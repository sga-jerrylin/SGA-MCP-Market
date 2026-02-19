import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { In, Repository } from 'typeorm';
import { PackageEntity } from '../packages/entities/package.entity';
import { User } from '../auth/entities/user.entity';
import { AgentConfig } from './entities/agent-config.entity';
import { Announcement } from './entities/announcement.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AgentConfig) private readonly agentConfigs: Repository<AgentConfig>,
    @InjectRepository(Announcement) private readonly announcements: Repository<Announcement>,
    @InjectRepository(PackageEntity) private readonly packages: Repository<PackageEntity>
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
    apiKey?: string;
    systemPrompt?: string;
  }): Promise<AgentConfig> {
    const config = await this.getAgentConfig();
    if (dto.enabled !== undefined) config.enabled = dto.enabled;
    if (dto.model !== undefined) config.model = dto.model;
    if (dto.apiKey !== undefined) config.apiKey = dto.apiKey;
    if (dto.systemPrompt !== undefined) config.systemPrompt = dto.systemPrompt;
    return this.agentConfigs.save(config);
  }

  async getAnnouncement(): Promise<{ content: string }> {
    const existing = await this.announcements.findOne({ where: {} });
    if (existing) {
      return { content: existing.content };
    }
    const created = await this.announcements.save(this.announcements.create());
    return { content: created.content };
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

  async getReviewQueue(status?: string): Promise<PackageEntity[]> {
    const where = status
      ? { reviewStatus: status }
      : { reviewStatus: In(['pending_review', 'needs_human_review']) };
    return this.packages.find({ where, order: { publishedAt: 'DESC' } });
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
}
