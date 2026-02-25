import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { AgentRunnerService } from '../agent/agent-runner.service';
import { WebhookTriggersService } from '../agent/webhook-triggers.service';
import { MinioService } from '../storage/minio.service';
import { PackageCredentialField, PackageEntity } from './entities/package.entity';

@Injectable()
export class PackagesService {
  private readonly logger = new Logger(PackagesService.name);

  constructor(
    @InjectRepository(PackageEntity)
    private readonly packagesRepo: Repository<PackageEntity>,
    private readonly agentRunner: AgentRunnerService,
    private readonly webhookTriggers: WebhookTriggersService,
    private readonly minio: MinioService
  ) {}

  async list(q?: string, category?: string): Promise<PackageEntity[]> {
    const qb = this.packagesRepo
      .createQueryBuilder('pkg')
      .select([
        'pkg.id', 'pkg.name', 'pkg.version', 'pkg.description', 'pkg.category',
        'pkg.authorId', 'pkg.status', 'pkg.reviewStatus', 'pkg.securityScore',
        'pkg.agentSummary', 'pkg.pipelineStatus', 'pkg.enhancedDescription',
        'pkg.toolsSummary', 'pkg.autoCategory', 'pkg.toolsCount', 'pkg.downloads',
        'pkg.publishedAt', 'pkg.cardImageBase64', 'pkg.logoBase64'
      ])
      .where('pkg.reviewStatus = :reviewStatus', { reviewStatus: 'approved' })
      .orderBy('pkg.publishedAt', 'DESC');

    if (q && q.trim()) {
      qb.andWhere('(pkg.name LIKE :q OR pkg.description LIKE :q)', {
        q: `%${q.trim()}%`
      });
    }

    if (category && category.trim()) {
      qb.andWhere('pkg.category = :category', { category: category.trim() });
    }

    return qb.getMany();
  }

  async detail(id: string): Promise<PackageEntity> {
    const item = await this.packagesRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('package not found');
    }
    if (item.reviewStatus !== 'approved') {
      throw new NotFoundException('package not found');
    }
    return item;
  }

  async detailInternal(id: string): Promise<PackageEntity | null> {
    return this.packagesRepo.findOne({ where: { id } });
  }

  async publish(
    userId: string,
    file: Express.Multer.File | undefined,
    body: {
      name: string;
      version: string;
      description?: string;
      category?: string;
      status?: string;
      toolsCount?: string;
      credentials?: string;
    }
  ): Promise<PackageEntity> {
    if (!body.name || !body.version) {
      throw new BadRequestException('name and version are required');
    }

    const data = file?.buffer ?? randomBytes(16);
    const sha256 = createHash('sha256').update(data).digest('hex');
    const credentialsParsed = this.parseCredentials(body.credentials);

    const entity = this.packagesRepo.create({
      name: body.name,
      version: body.version,
      description: body.description ?? '',
      category: body.category ?? '其他',
      authorId: userId,
      status: body.status ?? 'published',
      reviewStatus: 'pending_review',
      toolsCount: body.toolsCount ? Number(body.toolsCount) || 0 : 0,
      downloads: 0,
      credentials: credentialsParsed,
      sha256
    });

    const saved = await this.packagesRepo.save(entity);

    if (file?.buffer) {
      await this.minio.putObject(`${saved.id}/package.tgz`, file.buffer);
    }

    void this.webhookTriggers.checkDuplicateName(saved.name).catch(() => undefined);
    void this.webhookTriggers.checkFirstPublish(userId).catch(() => undefined);

    // 上传即触发流水线（fire-and-forget）
    void this.agentRunner.retryPipeline(saved.id).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[PackagesService] Pipeline trigger failed for ${saved.id}: ${msg}`);
    });

    return saved;
  }

  private parseCredentials(raw?: string): PackageCredentialField[] | null {
    if (!raw || !raw.trim()) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('credentials must be valid JSON string');
    }

    if (!Array.isArray(parsed)) {
      throw new BadRequestException('credentials must be an array');
    }

    return parsed.map((item, index) => {
      if (!item || typeof item !== 'object') {
        throw new BadRequestException(`credentials[${index}] must be object`);
      }

      const candidate = item as Partial<PackageCredentialField>;
      if (
        typeof candidate.key !== 'string' ||
        typeof candidate.label !== 'string' ||
        typeof candidate.type !== 'string' ||
        typeof candidate.required !== 'boolean'
      ) {
        throw new BadRequestException(
          `credentials[${index}] requires key/label/type(required string) and required(boolean)`
        );
      }

      return {
        key: candidate.key,
        label: candidate.label,
        type: candidate.type,
        required: candidate.required,
        description: typeof candidate.description === 'string' ? candidate.description : undefined,
        defaultValue: typeof candidate.defaultValue === 'string' ? candidate.defaultValue : undefined
      };
    });
  }
}
