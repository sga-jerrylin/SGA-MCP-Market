import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { AgentLog } from '../agent/entities/agent-log.entity';
import { PackageEntity } from '../packages/entities/package.entity';
import { User } from '../auth/entities/user.entity';
import { AgentConfig } from './entities/agent-config.entity';
import { Announcement } from './entities/announcement.entity';
import { AnnouncementItem } from './entities/announcement-item.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AgentConfig) private readonly agentConfigs: Repository<AgentConfig>,
    @InjectRepository(Announcement) private readonly announcements: Repository<Announcement>,
    @InjectRepository(AnnouncementItem)
    private readonly announcementItems: Repository<AnnouncementItem>,
    @InjectRepository(PackageEntity) private readonly packages: Repository<PackageEntity>,
    @InjectRepository(AgentLog) private readonly agentLogs: Repository<AgentLog>
  ) {}

  async listUsers(): Promise<
    Array<{ id: string; email: string; role: string; isSuperUser: boolean; forcePasswordChange: boolean; createdAt: Date }>
  > {
    const rows = await this.users.find({ order: { createdAt: 'ASC' } });
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.isSuperUser ? 'superadmin' : 'member',
      isSuperUser: u.isSuperUser,
      forcePasswordChange: u.forcePasswordChange,
      createdAt: u.createdAt
    }));
  }

  async inviteUser(email: string): Promise<{ email: string; tempPassword: string }> {
    if (!email || !email.trim()) {
      throw new BadRequestException('email is required');
    }
    const exists = await this.users.findOne({ where: { email } });
    if (exists) {
      throw new BadRequestException('email already exists');
    }
    const tempPassword = randomBytes(4).toString('hex'); // 8 hex chars
    await this.users.save(
      this.users.create({
        email,
        passwordHash: createHash('sha256').update(tempPassword).digest('hex'),
        isSuperUser: false,
        forcePasswordChange: true
      })
    );
    return { email, tempPassword };
  }

  async deleteUser(id: string, requestingUserId: string): Promise<void> {
    if (id === requestingUserId) {
      throw new ForbiddenException('Cannot delete yourself');
    }
    const user = await this.users.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.users.delete(id);
  }

  async getAgentConfig(): Promise<AgentConfig> {
    const existing = await this.agentConfigs.findOne({ where: {} });
    if (existing) {
      return existing;
    }
    return this.agentConfigs.save(this.agentConfigs.create());
  }

  async updateAgentConfig(dto: {
    enabled?: boolean;
    model?: string;
    imageModel?: string;
    baseUrl?: string;
    apiKey?: string;
    systemPrompt?: string;
    webhookUrl?: string;
  }): Promise<AgentConfig> {
    const config = await this.getAgentConfig();
    if (dto.enabled !== undefined) config.enabled = dto.enabled;
    if (dto.model !== undefined) config.model = dto.model;
    if (dto.imageModel !== undefined) config.imageModel = dto.imageModel;
    if (dto.baseUrl !== undefined) config.baseUrl = dto.baseUrl;
    // 掩码值 (sk-...xxxx) 不应覆盖真实 key
    if (dto.apiKey !== undefined && !dto.apiKey.startsWith('sk-...')) {
      config.apiKey = dto.apiKey;
    }
    if (dto.systemPrompt !== undefined) config.systemPrompt = dto.systemPrompt;
    if (dto.webhookUrl !== undefined) config.webhookUrl = dto.webhookUrl;
    return this.agentConfigs.save(config);
  }

  async getAgentLogs(
    page: number,
    limit: number,
    action?: string
  ): Promise<{ items: AgentLog[]; total: number }> {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safeLimit =
      Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 20;

    const qb = this.agentLogs
      .createQueryBuilder('log')
      .orderBy('log.createdAt', 'DESC')
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit);

    if (action && action.trim().length > 0) {
      qb.where('log.action = :action', { action: action.trim() });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getAnnouncementItems(): Promise<AnnouncementItem[]> {
    return this.announcementItems.find({
      where: { active: true },
      order: { priority: 'DESC', createdAt: 'DESC' }
    });
  }

  async getAnnouncement(): Promise<{
    content: string;
    items: Array<{ id: number; content: string; source: string; priority: number }>;
  }> {
    const items = await this.getAnnouncementItems();
    if (items.length > 0) {
      return {
        content: items.map((item) => item.content).join(' | '),
        items: items.map((item) => ({
          id: item.id,
          content: item.content,
          source: item.source,
          priority: item.priority
        }))
      };
    }

    const existing = await this.announcements.findOne({ where: {} });
    if (existing) {
      return { content: existing.content, items: [] };
    }
    const created = await this.announcements.save(this.announcements.create());
    return { content: created.content, items: [] };
  }

  async updateAnnouncement(content: string): Promise<{ content: string }> {
    const existing = await this.announcements.findOne({ where: {} });
    if (existing) {
      existing.content = content;
      const saved = await this.announcements.save(existing);
      return { content: saved.content };
    }
    const created = await this.announcements.save(this.announcements.create({ content }));
    return { content: created.content };
  }

  async getReviewQueue(status?: string): Promise<Array<Record<string, unknown>>> {
    const qb = this.packages.createQueryBuilder('pkg')
      .leftJoin('pkg.author', 'author')
      .addSelect(['author.email'])
      .orderBy('pkg.publishedAt', 'DESC');

    if (status) {
      qb.where('pkg.reviewStatus = :status', { status });
    }

    const items = await qb.getMany();
    return items.map((pkg) => {
      const authorEmail = (pkg as unknown as { author?: { email?: string } }).author?.email;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { author: _a, ...rest } = pkg as unknown as Record<string, unknown>;
      return { ...rest, submitter: authorEmail ?? pkg.authorId };
    });
  }

  async reviewPackage(
    id: string,
    action: 'approve' | 'reject',
    reason?: string
  ): Promise<void> {
    const pkg = await this.packages.findOne({ where: { id } });
    if (!pkg) throw new NotFoundException(`Package ${id} not found`);
    await this.packages.update(id, {
      reviewStatus: action === 'approve' ? 'approved' : 'rejected',
      reviewNote: reason ?? null
    });
  }

  async deletePackage(id: string): Promise<void> {
    const pkg = await this.packages.findOne({ where: { id } });
    if (!pkg) throw new NotFoundException(`Package ${id} not found`);
    await this.packages.delete(id);
  }
}
