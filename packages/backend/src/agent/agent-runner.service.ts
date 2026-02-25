import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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
  private isTickRunning = false;
  private lastHeartbeat = new Date(0);
  private lastDailyDigest = new Date(0);
  private lastTrendDetection = new Date(0);
  private lastWeeklyExpire = new Date(0);

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

  @Cron('* * * * *')
  async schedulerTick(): Promise<void> {
    if (this.isTickRunning) {
      return;
    }

    this.isTickRunning = true;
    try {
      const config = await this.getConfig();
      if (!config.enabled) {
        return;
      }

      const now = new Date();

      const minutesSinceHeartbeat = (now.getTime() - this.lastHeartbeat.getTime()) / 60000;
      if (minutesSinceHeartbeat >= (config.heartbeatMinutes || 1440)) {
        this.lastHeartbeat = now;
        this.logger.log('[AgentRunner] Heartbeat: scanning pending packages...');
        await this.reviewPendingPackages(config);
        await this.updateAnnouncement(config);
      }

      if (
        now.getHours() === (config.dailyDigestHour ?? 9) &&
        now.getMinutes() === 0 &&
        !this.isSameDay(this.lastDailyDigest, now)
      ) {
        this.lastDailyDigest = now;
        await this.dailyDigest();
      }

      if (
        now.getHours() === (config.trendDetectionHour ?? 9) &&
        now.getMinutes() === 30 &&
        !this.isSameDay(this.lastTrendDetection, now)
      ) {
        this.lastTrendDetection = now;
        await this.trendDetection();
      }

      if (
        now.getDay() === (config.weeklyExpireDay ?? 1) &&
        now.getHours() === 10 &&
        now.getMinutes() === 0 &&
        !this.isSameWeek(this.lastWeeklyExpire, now)
      ) {
        this.lastWeeklyExpire = now;
        await this.weeklyExpireCheck();
      }
    } finally {
      this.isTickRunning = false;
    }
  }

  private isSameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  private isSameWeek(a: Date, b: Date): boolean {
    if (a.getTime() === 0) {
      return false;
    }

    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    return b.getTime() - a.getTime() < msPerWeek;
  }

  @Cron('0 0 9 * * *')
  async dailyDigest(): Promise<void> {
    await this.webhookTriggers.sendDailyDigest();
  }

  @Cron('0 0 9 * * 1')
  async weeklyExpireCheck(): Promise<void> {
    await this.webhookTriggers.checkExpiredPackages();
  }

  async trendDetection(): Promise<void> {
    await this.webhookTriggers.detectTrends();
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
      await this.webhookTriggers.checkDuplicateName(pkg.name).catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`[AgentRunner] checkDuplicateName failed: ${msg}`);
      });

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

      if (!reviewResult.approved && config.webhookUrl) {
        const author = await this.users.findOne({ where: { id: pkg.authorId } });
        await this.weCom.sendMessage(
          config.webhookUrl,
          this.weCom.formatPackageReviewAlert({
            name: pkg.name,
            version: pkg.version,
            authorEmail: author?.email ?? 'unknown',
            securityScore: reviewResult.score,
            reviewNote: reviewResult.note
          })
        );
      }

      const refreshedAfterReview = await this.packages.findOne({ where: { id: pkg.id } });
      if (refreshedAfterReview) {
        await this.webhookTriggers.checkSecurityScore(refreshedAfterReview).catch((error) => {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.warn(`[AgentRunner] checkSecurityScore failed: ${msg}`);
        });

        await this.webhookTriggers.checkCredentials(refreshedAfterReview).catch((error) => {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.warn(`[AgentRunner] checkCredentials failed: ${msg}`);
        });

        await this.webhookTriggers.checkDownloadMilestone(refreshedAfterReview).catch((error) => {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.warn(`[AgentRunner] checkDownloadMilestone failed: ${msg}`);
        });
      }

      await this.packages.update(pkg.id, { pipelineStatus: 'classifying' });
      const classify = await this.autoClassify(config, pkg);
      const categoryForNext = classify.autoCategory ?? pkg.category;

      await this.packages.update(pkg.id, { pipelineStatus: 'enhancing' });
      await this.enhanceDescription(config, pkg, categoryForNext);

      await this.packages.update(pkg.id, { pipelineStatus: 'imaging' });
      await this.generateLogoImage(config, pkg, categoryForNext).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn('[AgentRunner] Logo gen failed: ' + msg);
      });
      await this.generateCardBannerImage(config, pkg, categoryForNext).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn('[AgentRunner] Banner gen failed: ' + msg);
      });

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

      await this.webhookTriggers.checkPipelineFailures(pkg).catch((error) => {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`[AgentRunner] checkPipelineFailures failed: ${msg}`);
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

    const descForReview = pkg.enhancedDescription || pkg.description || '(no description provided)';
    const prompt = [
      'You are a security reviewer for an MCP tool package registry.',
      'Your PRIMARY job is security screening. Quality/completeness are SECONDARY.',
      '',
      'Package info:',
      `Name: ${pkg.name}`,
      `Version: ${pkg.version}`,
      `Description: ${descForReview}`,
      `Category: ${pkg.category}`,
      `Tools count: ${pkg.toolsCount}`,
      '',
      'Scoring guidance:',
      '- Start at 75 for any package with a non-empty description and no red flags.',
      '- toolsCount=0 is ACCEPTABLE for new/simple packages. Do NOT penalize for this alone.',
      '- Deduct points only for real security issues: hardcoded secrets, suspicious shell commands, obfuscated code, obvious malware patterns.',
      '- Minor metadata gaps (missing category, short description) cost at most 10 points total.',
      '- Score >= 70 means approved=true.',
      '',
      'Respond with JSON only:',
      '{',
      '  "approved": boolean,',
      '  "score": number (0-100),',
      '  "note": "Brief explanation in Chinese (max 100 chars)",',
      '  "summary": "Suggested improved description in Chinese (max 200 chars)"',
      '}'
    ].join('\n');

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

    const desc = pkg.enhancedDescription || pkg.description || pkg.name;
    const prompt =
      'You are a package classifier for an MCP tool registry.\n' +
      'Pick EXACTLY ONE category from the list below based on the package name and description.\n\n' +
      'CATEGORY DEFINITIONS:\n' +
      '- 通用: General-purpose utilities — web search, HTTP requests, data fetching, file conversion, calculators, weather, news, translation, text processing, RSS feeds, URL shortening. When in doubt, use 通用.\n' +
      '- 办公工具: Office productivity — Word/Excel/PowerPoint/PDF operations, email (Gmail/Outlook), calendar (Google Calendar), meetings (Zoom/Teams/DingTalk), slides, spreadsheets, task management.\n' +
      '- AI模型: AI/ML services — LLM APIs, image generation (Stable Diffusion/DALL-E/Seedream), speech recognition, TTS, OCR, computer vision, embeddings, model inference.\n' +
      '- ERP: Enterprise Resource Planning — SAP, Oracle EBS, 金蝶, 用友, inventory, supply chain, manufacturing, HR systems, financial accounting modules.\n' +
      '- CRM: Customer Relationship Management — Salesforce, HubSpot, customer data, sales pipeline, lead/contact management, support tickets.\n' +
      '- 数据库: Database operations — SQL queries, NoSQL, Redis, Elasticsearch, data migration, schema management, ORMs, vector databases.\n' +
      '- 开发工具: Developer tools — Git, GitHub/GitLab, CI/CD, code analysis, testing frameworks, Docker, Kubernetes, package managers, IDE integrations, code generation.\n' +
      '- 监控: Observability — logging (Datadog/Grafana/Prometheus), metrics, alerting, APM, performance tracking, error tracking (Sentry), uptime monitoring.\n' +
      '- 安全: Security — authentication, OAuth, JWT, encryption, vulnerability scanning, secrets management, access control, WAF, SIEM.\n' +
      '- 网络: Networking — HTTP client, API gateway, DNS, load balancing, proxies, WebSocket, gRPC, network diagnostics.\n' +
      '- 存储: File/object storage — S3, MinIO, HDFS, file upload/download, cloud drives (Google Drive/OneDrive/Dropbox), backup.\n' +
      '- 电商: E-commerce — Shopify, WooCommerce, product catalog, orders, payments, inventory, logistics tracking.\n' +
      '- 其他: Only use when nothing else fits.\n\n' +
      `Package name: ${pkg.name}\n` +
      `Description: ${desc.slice(0, 300)}\n\n` +
      'Return JSON only: { "suggestedCategory": "<one of the category names above>", "confidence": 0.0-1.0 }';

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
      // Always persist the AI suggestion; update category field when confidence is sufficient
      const updateCategory = suggestedCategory.length > 0 && confidence >= 0.6;

      const updatePayload: Partial<PackageEntity> = { autoCategory: suggestedCategory };
      if (updateCategory) {
        updatePayload.category = suggestedCategory;
      }
      await this.packages.update(pkg.id, updatePayload);

      await this.saveLog({
        packageId: pkg.id,
        action: 'classify',
        status: 'success',
        durationMs: Date.now() - startedAt,
        detail: {
          model: config.model,
          suggestedCategory,
          confidence,
          applied: updateCategory
        }
      });

      return { autoCategory: suggestedCategory || null };
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

  private async generateLogoImage(
    config: AgentConfig,
    pkg: PackageEntity,
    category: string
  ): Promise<void> {
    const startedAt = Date.now();

    if (!config.apiKey) {
      await this.packages.update(pkg.id, { logoBase64: null });
      await this.saveLog({
        packageId: pkg.id,
        action: 'logo',
        status: 'success',
        durationMs: Date.now() - startedAt,
        detail: { skipped: true, reason: 'apiKey missing' }
      });
      return;
    }

    const categoryThemeColors: Record<string, string> = {
      'developer-tools': 'electric blue and cyan',
      data: 'deep purple and violet',
      ai: 'gold and orange',
      security: 'dark red and crimson',
      productivity: 'emerald green and teal',
      communication: 'magenta and pink',
      开发工具: 'electric blue and cyan',
      数据库: 'deep purple and violet',
      监控: 'amber and cyan',
      安全: 'dark red and crimson',
      通用: 'neon purple and deep blue'
    };
    const themeColor = categoryThemeColors[category] ?? 'neon purple and deep blue';

    const toolDesc = (pkg.enhancedDescription || pkg.description || pkg.name).slice(0, 80);
    const prompt =
      `App icon for MCP tool "${pkg.name}": ${toolDesc}. ` +
      `Visual concept: abstract symbol representing the tool's core function, combined with a stylized lobster/crayfish claw motif (Claw MCP brand). ` +
      `Color palette: ${themeColor}. Dark background. Flat icon design, no text, no letters, no gradients that obscure the symbol. ` +
      'Perfect square format, bold single focal element, clearly recognizable at 64x64 px.';

    const base64 = await this.openRouter.generateImage({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.imageModel,
      prompt,
      size: '512x512'
    });

    await this.packages.update(pkg.id, {
      logoBase64: `data:image/png;base64,${base64}`
    });

    await this.saveLog({
      packageId: pkg.id,
      action: 'logo',
      status: 'success',
      durationMs: Date.now() - startedAt,
      detail: { model: config.imageModel, generated: true }
    });
  }

  private async generateCardBannerImage(
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

    const categoryThemes: Record<string, string> = {
      'developer-tools': 'electric blue and cyan circuit board patterns, terminal green accents',
      data: 'deep purple and violet data stream visualization, flowing particles',
      ai: 'neural network nodes in gold and orange, pulsing connections',
      security: 'dark red and crimson shield motifs, hexagonal lock patterns',
      productivity: 'emerald green and teal workflow arrows, minimalist icons',
      communication: 'magenta and pink signal waves, dynamic speech bubbles',
      开发工具: 'electric blue and cyan circuit board patterns, terminal green accents',
      数据库: 'deep purple and violet data stream visualization, flowing particles',
      监控: 'amber and cyan telemetry waveforms with dashboard-like glow',
      安全: 'dark red and crimson shield motifs, hexagonal lock patterns',
      通用: 'neon purple and deep blue gradient, abstract tech symbols'
    };
    const theme = categoryThemes[category] ?? 'neon purple and deep blue gradient, abstract tech symbols';

    const bannerDesc = (pkg.enhancedDescription || pkg.description || pkg.name).slice(0, 60);
    const prompt =
      `Horizontal banner artwork for a developer tool card. Tool: "${pkg.name}" — ${bannerDesc}. ` +
      `Visual theme: ${theme}. ` +
      'Style: wide cinematic banner (16:9 ratio feel), dark immersive background with depth. ' +
      'Abstract tech atmosphere: flowing particles, circuit traces, light streaks — no sharp icons, no focal center. ' +
      'Subtle lobster claw silhouette as a watermark in one corner (Claw MCP brand). ' +
      'No text, no letters, no faces, no UI elements. Professional developer ecosystem aesthetic.';

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
