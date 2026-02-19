import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PackageEntity } from '../packages/entities/package.entity';
import { AgentConfig } from '../admin/entities/agent-config.entity';
import { Announcement } from '../admin/entities/announcement.entity';
import { WeComService } from '../admin/wecom.service';
import { User } from '../auth/entities/user.entity';

@Injectable()
export class AgentRunnerService {
  private readonly logger = new Logger(AgentRunnerService.name);

  constructor(
    @InjectRepository(PackageEntity) private packages: Repository<PackageEntity>,
    @InjectRepository(AgentConfig) private agentConfigs: Repository<AgentConfig>,
    @InjectRepository(Announcement) private announcements: Repository<Announcement>,
    @InjectRepository(User) private users: Repository<User>,
    private readonly weCom: WeComService
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async runHeartbeat(): Promise<void> {
    const config = await this.getConfig();
    if (!config.enabled) return;

    this.logger.log('[AgentRunner] Heartbeat: scanning pending packages...');
    await this.reviewPendingPackages(config);
    await this.updateAnnouncement(config);
  }

  private async getConfig(): Promise<AgentConfig> {
    let config = await this.agentConfigs.findOne({ where: {} });
    if (!config) {
      config = await this.agentConfigs.save(this.agentConfigs.create({ enabled: false }));
    }
    return config;
  }

  private async reviewPendingPackages(config: AgentConfig): Promise<void> {
    const pending = await this.packages.find({ where: { reviewStatus: 'pending_review' } });

    for (const pkg of pending) {
      try {
        const result = await this.callLlmReview(config, pkg);
        await this.packages.update(pkg.id, {
          reviewStatus: result.approved ? 'approved' : 'needs_human_review',
          securityScore: result.score,
          reviewNote: result.note,
          agentSummary: result.summary
        });

        if (!result.approved && config.webhookUrl) {
          const author = await this.users.findOne({ where: { id: pkg.authorId } });
          await this.weCom.sendMessage(
            config.webhookUrl,
            this.weCom.formatPackageReviewAlert({
              name: pkg.name,
              version: pkg.version,
              authorEmail: author?.email ?? 'unknown',
              securityScore: result.score,
              reviewNote: result.note
            })
          );
        }
      } catch (err) {
        this.logger.error(`[AgentRunner] Failed to review package ${pkg.id}: ${err}`);
      }
    }
  }

  private async callLlmReview(
    config: AgentConfig,
    pkg: PackageEntity
  ): Promise<{ approved: boolean; score: number; note: string; summary: string }> {
    if (!config.apiKey) {
      // No API key — auto-approve with note
      return { approved: true, score: 70, note: '未配置 API Key，自动通过', summary: '' };
    }

    const prompt = `You are a security reviewer for an MCP tool package registry. Review this package:

Name: ${pkg.name}
Version: ${pkg.version}
Description: ${pkg.description}
Category: ${pkg.category}
Tools count: ${pkg.toolsCount}

Evaluate for:
1. Security concerns (hardcoded API keys, suspicious patterns, dangerous operations)
2. Quality (proper description, clear purpose, appropriate category)
3. Completeness (sufficient metadata)

Respond with JSON only:
{
  "approved": boolean,
  "score": number (0-100, security score — 0 is very dangerous, 100 is perfectly safe),
  "note": "Brief explanation in Chinese (max 100 chars)",
  "summary": "Suggested improved description in Chinese (max 200 chars)"
}`;

    const isAnthropic = config.model.startsWith('claude');
    const isOpenAI = config.model.startsWith('gpt');

    let responseText = '';

    if (isAnthropic) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = (await res.json()) as { content?: Array<{ text?: string }> };
      responseText = data.content?.[0]?.text ?? '';
    } else if (isOpenAI) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      responseText = data.choices?.[0]?.message?.content ?? '';
    }

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as {
          approved: boolean;
          score: number;
          note: string;
          summary: string;
        };
      }
    } catch {
      /* fall through */
    }

    return { approved: true, score: 75, note: 'LLM 响应解析失败，默认通过', summary: '' };
  }

  private async updateAnnouncement(config: AgentConfig): Promise<void> {
    // Only update announcement once per hour (check if updated recently)
    const ann = await this.announcements.findOne({ where: {} });
    if (!ann) return;

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (ann.updatedAt > oneHourAgo) return; // Updated within last hour, skip

    if (!config.apiKey) return;

    const count = await this.packages.count({ where: { reviewStatus: 'approved' } });
    const latest = await this.packages.findOne({
      where: { reviewStatus: 'approved' },
      order: { publishedAt: 'DESC' }
    });

    const prompt = `Generate a short, fun marquee announcement for Claw MCP Market (Chinese MCP package registry).
Stats: ${count} packages total${latest ? `, latest: "${latest.name}"` : ''}.
Write in Chinese, max 80 chars, start with 🦞, make it engaging. Return just the text, no quotes.`;

    try {
      const isAnthropic = config.model.startsWith('claude');
      let text = '';
      if (isAnthropic) {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: config.model,
            max_tokens: 100,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        const data = (await res.json()) as { content?: Array<{ text?: string }> };
        text = data.content?.[0]?.text?.trim() ?? '';
      }
      if (text) {
        await this.announcements.update(ann.id, { content: text });
        this.logger.log(`[AgentRunner] Announcement updated: ${text}`);
      }
    } catch (err) {
      this.logger.warn(`[AgentRunner] Failed to update announcement: ${err}`);
    }
  }

  // Manual trigger for testing
  async triggerReview(): Promise<{ reviewed: number }> {
    const config = await this.getConfig();
    const before = await this.packages.count({ where: { reviewStatus: 'pending_review' } });
    await this.reviewPendingPackages(config);
    return { reviewed: before };
  }
}
