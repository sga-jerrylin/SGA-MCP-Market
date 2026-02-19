import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { PackageCredentialField, PackageEntity } from './entities/package.entity';

@Injectable()
export class PackagesService {
  constructor(
    @InjectRepository(PackageEntity)
    private readonly packagesRepo: Repository<PackageEntity>
  ) {}

  async list(q?: string, category?: string): Promise<PackageEntity[]> {
    const qb = this.packagesRepo
      .createQueryBuilder('pkg')
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

    return this.packagesRepo.save(entity);
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
