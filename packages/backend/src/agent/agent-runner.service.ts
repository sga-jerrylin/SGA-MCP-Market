import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, MoreThanOrEqual, Repository } from 'typeorm';
import { AgentLog } from './entities/agent-log.entity';
import { OpenRouterService } from './openrouter.service';
import { PackageEntity } from '../packages/entities/package.entity';
import { AgentConfig } from '../admin/entities/agent-config.entity';
import { Announcement } from '../admin/entities/announcement.entity';
import { AnnouncementItem } from '../admin/entities/announcement-item.entity';
import { WeComService } from '../admin/wecom.service';
import { User } from '../auth/entities/user.entity';
import { WebhookTriggersService } from './webhook-triggers.service';

interface ReviewResult {
  approved: boolean;
  score: number;
  note: string;
  summary: string;
}

interface ClassifyResult {
  suggestedCategory: string;
  confidence: number;
}

interface ToolSummaryItem {
  name: string;
  description: string;
}

interface EnhanceResult {
  enhancedDescription: string;
  toolsSummary: ToolSummaryItem[];
}

@Injectable()
export class AgentRunnerService {
  private readonly logger = new Logger(AgentRunnerService.name);
  private isHeartbeatRunning = false;

  constructor(
    @InjectRepository(PackageEntity) private packages: Repository<PackageEntity>,
    @InjectRepository(AgentConfig) private agentConfigs: Repository<AgentConfig>,
    @InjectRepository(Announcement) private announcements: Repository<Announcement>,
    @InjectRepository(AnnouncementItem)
    private announcementItems: Repository<AnnouncementItem>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(AgentLog) private agentLogs: Repository<AgentLog>,
    private readonly weCom: WeComService,
    private readonly openRouter: OpenRouterService,
    private readonly webhookTriggers: WebhookTriggersService
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async runHeartbeat(): Promise<void> {
    if (this.isHeartbeatRunning) return;
    this.isHeartbeatRunning = true;
    try {
      await this.runHeartbeatInner();
    } finally {
      this.isHeartbeatRunning = false;
    }
  }

  private async runHeartbeatInner(): Promise<void> {
    const config = await this.getConfig();
    if (!config.enabled) {
      return;
    }

    this.logger.log('[AgentRunner] Heartbeat: scanning pending packages...');
    await this.reviewPendingPackages(config);
    await this.updateAnnouncement(config);
  }

  @Cron('0 9 * * *')
  async dailyDigest(): Promise<void> {
    const config = await this.getConfig();
    if (!config.enabled) {
      return;
    }

    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [newToday, pendingReview, activePackages, agentRunsToday] = await Promise.all([
      this.packages.count({ where: { publishedAt: MoreThanOrEqual(last24Hours) } }),
      this.packages.count({ where: { reviewStatus: 'pending_review' } }),
      this.packages.count({ where: { reviewStatus: 'approved' } }),
      this.agentLogs.count({ where: { createdAt: MoreThanOrEqual(todayStart) } })
    ]);

    const downloadsRaw = await this.packages
      .createQueryBuilder('pkg')
      .select('COALESCE(SUM(pkg.downloads), 0)', 'total')
      .getRawOne<{ total: string | number }>();

    const totalDownloads = Number(downloadsRaw?.total ?? 0);

    await this.webhookTriggers.sendDailyDigest(config, {
      newToday,
      pendingReview,
      totalDownloads,
      activePackages,
      agentRunsToday
    });
  }

  @Cron('0 10 * * 1')
  async weeklyExpireCheck(): Promise<void> {
    const config = await this.getConfig();
    if (!config.enabled || !config.webhookUrl) {
      return;
    }

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const stalePackages = await this.packages.find({
      where: {
        reviewStatus: 'approved',
        publishedAt: LessThan(ninetyDaysAgo)
      }
    });

    for (const pkg of stalePackages) {
      const newerVersion = await this.packages.findOne({
        where: {
          name: pkg.name,
          publishedAt: MoreThan(pkg.publishedAt)
        },
        order: {
          publishedAt: 'DESC'
        }
      });

      if (newerVersion) {
        continue;
      }

      const daysSince = Math.floor(
        (Date.now() - new Date(pkg.publishedAt).getTime()) / (24 * 60 * 60 * 1000)
      );

      const content = [
        '## ⚠️ [MCP Market] 长期未更新包',
        `**包名**: ${pkg.name}`,
        `**最后更新**: ${pkg.publishedAt.toISOString().slice(0, 10)}`,
        `**天数**: ${daysSince}`,
        '> 建议联系作者确认维护状态'
      ].join('\n');

      await this.weCom.sendMessage(config.webhookUrl, content);
    }
  }

  @Cron('30 9 * * *')
  async trendDetection(): Promise<void> {
    const config = await this.getConfig();
    if (!config.enabled || !config.webhookUrl) {
      return;
    }

    const topPackages = await this.packages.find({
      where: { reviewStatus: 'approved' },
      order: { downloads: 'DESC' },
      take: 3
    });

    if (topPackages.length === 0 || topPackages[0].downloads <= 50) {
      return;
    }

    const lines = topPackages.map((item, index) => `${index + 1}. ${item.name}（${item.downloads}）`);
    const content = ['## 📈 [MCP Market] 本周趋势包', ...lines].join('\n');
    await this.weCom.sendMessage(config.webhookUrl, content);
  }

  async retryPipeline(packageId: string): Promise<void> {
    const config = await this.getConfig();
    const pkg = await this.packages.findOne({ where: { id: packageId } });
    if (!pkg) {
      throw new NotFoundException(`Package ${packageId} not found`);
    }
    await this.processPackage(config, pkg);
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
      await this.processPackage(config, pkg);
    }
  }

  private async processPackage(config: AgentConfig, pkg: PackageEntity): Promise<void> {
    try {
      const similar = await this.findSimilarPackage(pkg);
      if (similar) {
        await this.webhookTriggers.notifySimilarName(config, pkg, similar).catch((error: unknown) => {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.warn(`[AgentRunner] notifySimilarName failed: ${msg}`);
        });
      }

      await this.packages.update(pkg.id, {
        pipelineStatus: 'reviewing',
        pipelineError: null
      });

      const reviewResult = await this.callLlmReview(config, pkg);
      await this.packages.update(pkg.id, {
        reviewStatus: reviewResult.approved ? 'approved' : 'needs_human_review',
        securityScore: reviewResult.score,
        reviewNote: reviewResult.note,
        agentSummary: reviewResult.summary
      });

      // 统一通过 WebhookTriggersService 处理通知，避免重复
      const refreshedAfterReview = await this.packages.findOne({ where: { id: pkg.id } });
      if (refreshedAfterReview) {
        if (reviewResult.score < 70) {
          await this.webhookTriggers
            .notifyLowSecurityScore(config, refreshedAfterReview, reviewResult.score)
            .catch((error: unknown) => {
              const msg = error instanceof Error ? error.message : String(error);
              this.logger.warn(`[AgentRunner] notifyLowSecurityScore failed: ${msg}`);
            });
        }

        await this.webhookTriggers.notifyHighCredentials(config, refreshedAfterReview).catch((error) => {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.warn(`[AgentRunner] notifyHighCredentials failed: ${msg}`);
        });

        if (refreshedAfterReview.downloads === 100 || refreshedAfterReview.downloads === 500) {
          await this.webhookTriggers
            .notifyDownloadMilestone(
              config,
              refreshedAfterReview,
              refreshedAfterReview.downloads
            )
            .catch((error: unknown) => {
              const msg = error instanceof Error ? error.message : String(error);
              this.logger.warn(`[AgentRunner] notifyDownloadMilestone failed: ${msg}`);
            });
        }
      }

      await this.packages.update(pkg.id, { pipelineStatus: 'classifying' });
      const classify = await this.autoClassify(config, pkg);
      const categoryForNext = classify.autoCategory ?? pkg.category;

      await this.packages.update(pkg.id, { pipelineStatus: 'enhancing' });
      await this.enhanceDescription(config, pkg, categoryForNext);

      await this.packages.update(pkg.id, { pipelineStatus: 'imaging' });
      await this.generateCardImage(config, pkg, categoryForNext);

      await this.packages.update(pkg.id, {
        pipelineStatus: 'completed',
        pipelineError: null,
        pipelineCompletedAt: new Date()
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.packages.update(pkg.id, {
        pipelineStatus: 'failed',
        pipelineError: message
      });

      const recentSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const failCount = await this.agentLogs.count({
        where: {
          packageId: pkg.id,
          status: 'failed',
          createdAt: MoreThanOrEqual(recentSince)
        }
      });

      await this.webhookTriggers.notifyPipelineFailures(config, pkg, failCount).catch((error) => {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`[AgentRunner] notifyPipelineFailures failed: ${msg}`);
      });

      this.logger.error(`[AgentRunner] Failed to process package ${pkg.id}: ${message}`);
    }
  }

  private async findSimilarPackage(pkg: PackageEntity): Promise<PackageEntity | null> {
    const candidates = await this.packages
      .createQueryBuilder('pkg')
      .select(['pkg.id', 'pkg.name', 'pkg.version'])
      .where('pkg.id <> :id', { id: pkg.id })
      .getMany();

    let bestMatch: PackageEntity | null = null;
    let bestDistance = Number.MAX_SAFE_INTEGER;

    for (const item of candidates) {
      const distance = WebhookTriggersService.levenshteinDistance(
        pkg.name.toLowerCase(),
        (item.name ?? '').toLowerCase()
      );
      if (distance < 3 && distance < bestDistance) {
        bestDistance = distance;
        bestMatch = item;
      }
    }

    return bestMatch;
  }

  private async callLlmReview(config: AgentConfig, pkg: PackageEntity): Promise<ReviewResult> {
    if (!config.apiKey) {
      return { approved: true, score: 70, note: 'No API key configured, auto-approved', summary: '' };
    }

    const prompt = `You are a security reviewer for an MCP tool package registry. Review this package:\n\nName: ${pkg.name}\nVersion: ${pkg.version}\nDescription: ${pkg.description}\nCategory: ${pkg.category}\nTools count: ${pkg.toolsCount}\n\nEvaluate for:\n1. Security concerns (hardcoded API keys, suspicious patterns, dangerous operations)\n2. Quality (proper description, clear purpose, appropriate category)\n3. Completeness (sufficient metadata)\n\nRespond with JSON only:\n{\n  "approved": boolean,\n  "score": number (0-100),\n  "note": "Brief explanation in Chinese (max 100 chars)",\n  "summary": "Suggested improved description in Chinese (max 200 chars)"\n}`;

    const startedAt = Date.now();

    try {
      const responseText = await this.openRouter.chatCompletion({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 300,
        systemPrompt: config.systemPrompt ?? undefined
      });

      const result = this.parseReviewResponse(responseText);
      await this.saveLog({
        packageId: pkg.id,
        action: 'review',
        status: 'success',
        durationMs: Date.now() - startedAt,
        detail: {
          model: config.model,
          approved: result.approved,
          score: result.score
        }
      });

      return result;
    } catch (error) {
      await this.saveLog({
        packageId: pkg.id,
        action: 'review',
        status: 'failed',
        durationMs: Date.now() - startedAt,
        detail: {
          model: config.model,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
  }

  private async autoClassify(
    config: AgentConfig,
    pkg: PackageEntity
  ): Promise<{ autoCategory: string | null }> {
    const startedAt = Date.now();

    if (!config.apiKey) {
      await this.saveLog({
        packageId: pkg.id,
        action: 'classify',
        status: 'success',
        durationMs: Date.now() - startedAt,
        detail: { skipped: true, reason: 'apiKey missing' }
      });
      return { autoCategory: null };
    }

    const prompt =
      'You are a package classifier for an MCP tool registry. Given this package:\n' +
      `Name: ${pkg.name}, Description: ${pkg.description}\n` +
      "Known categories: ['ERP', 'CRM', '通用', 'AI模型', '文档', '办公工具', '数据库', '开发工具', '监控', '安全', '网络', '存储']\n" +
      'Return JSON: { "suggestedCategory": "category_name", "confidence": 0.0-1.0 }';

    try {
      const raw = await this.openRouter.chatCompletion({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 100,
        systemPrompt: config.systemPrompt ?? undefined
      });

      const parsed = this.parseJsonBlock<ClassifyResult>(raw);
      if (
        !parsed ||
        typeof parsed.suggestedCategory !== 'string' ||
        typeof parsed.confidence !== 'number'
      ) {
        throw new Error('Invalid classify response');
      }

      const suggestedCategory = parsed.suggestedCategory.trim();
      const confidence = parsed.confidence;
      const shouldApply =
        suggestedCategory.length > 0 && confidence > 0.8 && suggestedCategory !== pkg.category;

      if (shouldApply) {
        await this.packages.update(pkg.id, { autoCategory: suggestedCategory });
      }

      await this.saveLog({
        packageId: pkg.id,
        action: 'classify',
        status: 'success',
        durationMs: Date.now() - startedAt,
        detail: {
          model: config.model,
          suggestedCategory,
          confidence,
          applied: shouldApply
        }
      });

      return { autoCategory: shouldApply ? suggestedCategory : null };
    } catch (error) {
      await this.saveLog({
        packageId: pkg.id,
        action: 'classify',
        status: 'failed',
        durationMs: Date.now() - startedAt,
        detail: {
          model: config.model,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
  }

  private async enhanceDescription(
    config: AgentConfig,
    pkg: PackageEntity,
    category: string
  ): Promise<void> {
    const startedAt = Date.now();

    if (!config.apiKey) {
      await this.saveLog({
        packageId: pkg.id,
        action: 'enhance',
        status: 'success',
        durationMs: Date.now() - startedAt,
        detail: { skipped: true, reason: 'apiKey missing' }
      });
      return;
    }

    const toolCount = Math.max(pkg.toolsCount, 1);
    const prompt =
      'You are a technical writer for an MCP tool registry. Enhance this package description:\n' +
      `Name: ${pkg.name}, Description: ${pkg.description}, Category: ${category}, Tools count: ${pkg.toolsCount}\n` +
      'Return JSON: {\n' +
      '  "enhancedDescription": "200字以内的中文富描述，突出功能特点和使用场景",\n' +
      '  "toolsSummary": [{"name": "tool_name", "description": "一句话中文描述"}]\n' +
      '}\n' +
      `Generate ${toolCount} tools in toolsSummary (or at least 1 if toolsCount is 0).`;

    try {
      const raw = await this.openRouter.chatCompletion({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 500,
        systemPrompt: config.systemPrompt ?? undefined
      });

      const parsed = this.parseJsonBlock<EnhanceResult>(raw);
      if (!parsed || typeof parsed.enhancedDescription !== 'string') {
        throw new Error('Invalid enhance response');
      }

      const toolsSummaryRaw = Array.isArray(parsed.toolsSummary) ? parsed.toolsSummary : [];
      const toolsSummary = toolsSummaryRaw
        .map((item) => ({
          name: typeof item?.name === 'string' ? item.name.trim() : '',
          description: typeof item?.description === 'string' ? item.description.trim() : ''
        }))
        .filter((item) => item.name.length > 0 && item.description.length > 0);

      const normalizedSummary: ToolSummaryItem[] =
        toolsSummary.length > 0
          ? toolsSummary
          : [{ name: 'default_tool', description: '通用工具描述' }];

      await this.packages.update(pkg.id, {
        enhancedDescription: parsed.enhancedDescription.trim(),
        toolsSummary: JSON.stringify(normalizedSummary)
      });

      await this.saveLog({
        packageId: pkg.id,
        action: 'enhance',
        status: 'success',
        durationMs: Date.now() - startedAt,
        detail: {
          model: config.model,
          toolsSummaryCount: normalizedSummary.length
        }
      });
    } catch (error) {
      await this.saveLog({
        packageId: pkg.id,
        action: 'enhance',
        status: 'failed',
        durationMs: Date.now() - startedAt,
        detail: {
          model: config.model,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
  }

  private async generateCardImage(
    config: AgentConfig,
    pkg: PackageEntity,
    category: string
  ): Promise<void> {
    const startedAt = Date.now();

    if (!config.apiKey) {
      await this.packages.update(pkg.id, { cardImageBase64: null });
      await this.saveLog({
        packageId: pkg.id,
        action: 'image',
        status: 'success',
        durationMs: Date.now() - startedAt,
        detail: { skipped: true, reason: 'apiKey missing' }
      });
      return;
    }

    const prompt = `为MCP工具'${pkg.name}'生成现代科技风卡片图标。分类:${category}。深色背景，渐变色调，简洁线条，无文字。正方形。`;

    try {
      const base64 = await this.openRouter.generateImage({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.imageModel,
        prompt,
        size: '512x512'
      });

      await this.packages.update(pkg.id, {
        cardImageBase64: `data:image/png;base64,${base64}`
      });

      await this.saveLog({
        packageId: pkg.id,
        action: 'image',
        status: 'success',
        durationMs: Date.now() - startedAt,
        detail: { model: config.imageModel, generated: true }
      });
    } catch (error) {
      await this.packages.update(pkg.id, { cardImageBase64: null });
      await this.saveLog({
        packageId: pkg.id,
        action: 'image',
        status: 'failed',
        durationMs: Date.now() - startedAt,
        detail: {
          model: config.imageModel,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      this.logger.warn(
        `[AgentRunner] Image generation failed for package ${pkg.id}, continuing pipeline`
      );
    }
  }

  private parseJsonBlock<T extends object>(text: string): T | null {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }
      return JSON.parse(jsonMatch[0]) as T;
    } catch {
      return null;
    }
  }

  private parseReviewResponse(responseText: string): ReviewResult {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Partial<ReviewResult>;
        if (
          typeof parsed.approved === 'boolean' &&
          typeof parsed.score === 'number' &&
          typeof parsed.note === 'string' &&
          typeof parsed.summary === 'string'
        ) {
          return {
            approved: parsed.approved,
            score: parsed.score,
            note: parsed.note,
            summary: parsed.summary
          };
        }
      }
    } catch {
      // Fallback below
    }

    return {
      approved: false,
      score: 0,
      note: 'LLM 响应解析失败，转人工审核',
      summary: ''
    };
  }

  private async updateAnnouncement(config: AgentConfig): Promise<void> {
    let ann = await this.announcements.findOne({ where: {} });
    if (!ann) {
      ann = await this.announcements.save(this.announcements.create());
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (ann.updatedAt > oneHourAgo) {
      return;
    }

    const approvedPackages = await this.packages.find({ where: { reviewStatus: 'approved' } });
    const packageCount = approvedPackages.length;
    const toolsTotal = approvedPackages.reduce((sum, item) => sum + (item.toolsCount || 0), 0);

    const latest =
      approvedPackages.length > 0
        ? approvedPackages.reduce((acc, item) =>
            item.publishedAt > acc.publishedAt ? item : acc
          )
        : null;

    const popular =
      approvedPackages
        .filter((item) => item.downloads > 50)
        .sort((a, b) => b.downloads - a.downloads)[0] ?? null;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const trending =
      approvedPackages
        .filter((item) => item.publishedAt >= sevenDaysAgo && item.downloads > 50)
        .sort((a, b) => b.downloads - a.downloads)[0] ?? null;

    const items: Array<{
      content: string;
      source: 'auto';
      active: true;
      priority: number;
    }> = [];

    items.push({
      content: `Claw Market 已收录 ${packageCount} 个工具包，共 ${toolsTotal} 个工具`,
      source: 'auto',
      active: true,
      priority: 10
    });

    if (latest) {
      const latestDescription = (latest.description ?? '').trim();
      const latestPreview =
        latestDescription.length > 30 ? `${latestDescription.slice(0, 30)}...` : latestDescription;
      items.push({
        content: `今日新增: ${latest.name} — ${latestPreview || '暂无描述'}`,
        source: 'auto',
        active: true,
        priority: 8
      });
    }

    if (trending) {
      items.push({
        content: `本周趋势: ${trending.name} 近7天下载增长显著（${trending.downloads}）`,
        source: 'auto',
        active: true,
        priority: 7
      });
    }

    if (popular) {
      items.push({
        content: `${popular.name} 已被下载 ${popular.downloads} 次`,
        source: 'auto',
        active: true,
        priority: 6
      });
    }

    const startedAt = Date.now();
    if (config.apiKey) {
      try {
        const prompt = `Generate a short, fun marquee announcement for Claw MCP Market (Chinese MCP package registry). Stats: ${packageCount} packages total${latest ? `, latest: "${latest.name}"` : ''}. Write in Chinese, max 80 chars, start with 🎉, return plain text only.`;
        const text = (
          await this.openRouter.chatCompletion({
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            model: config.model,
            messages: [{ role: 'user', content: prompt }],
            maxTokens: 100,
            systemPrompt: config.systemPrompt ?? undefined
          })
        ).trim();

        if (text) {
          items.push({
            content: text,
            source: 'auto',
            active: true,
            priority: 4
          });
        }

        await this.saveLog({
          packageId: null,
          action: 'announcement',
          status: 'success',
          durationMs: Date.now() - startedAt,
          detail: { model: config.model, llmItemCreated: Boolean(text) }
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.saveLog({
          packageId: null,
          action: 'announcement',
          status: 'failed',
          durationMs: Date.now() - startedAt,
          detail: { model: config.model, error: message }
        });
        this.logger.warn(`[AgentRunner] Failed to generate LLM announcement item: ${message}`);
      }
    }

    await this.announcementItems.delete({ source: 'auto' });
    if (items.length > 0) {
      await this.announcementItems.save(this.announcementItems.create(items));
    }

    const content = items.map((item) => item.content).join(' | ');
    await this.announcements.update(ann.id, { content });
    this.logger.log(`[AgentRunner] Announcement items refreshed (${items.length})`);
  }

  private async saveLog(input: {
    packageId: string | null;
    action: string;
    status: 'success' | 'failed';
    durationMs: number;
    detail?: Record<string, unknown>;
  }): Promise<void> {
    await this.agentLogs.save(
      this.agentLogs.create({
        packageId: input.packageId,
        action: input.action,
        status: input.status,
        durationMs: input.durationMs,
        detail: input.detail ?? null
      })
    );
  }

  async triggerReview(): Promise<{ reviewed: number }> {
    const config = await this.getConfig();
    const before = await this.packages.count({ where: { reviewStatus: 'pending_review' } });
    await this.reviewPendingPackages(config);
    return { reviewed: before };
  }
}
