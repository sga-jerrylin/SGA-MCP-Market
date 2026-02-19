import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { PackageEntity } from './entities/package.entity';

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
    }
  ): Promise<PackageEntity> {
    if (!body.name || !body.version) {
      throw new BadRequestException('name and version are required');
    }

    const data = file?.buffer ?? randomBytes(16);
    const sha256 = createHash('sha256').update(data).digest('hex');

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
      sha256
    });

    return this.packagesRepo.save(entity);
  }
}
