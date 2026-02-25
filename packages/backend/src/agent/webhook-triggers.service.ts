import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { AgentConfig } from '../admin/entities/agent-config.entity';
import { WeComService } from '../admin/wecom.service';
import { User } from '../auth/entities/user.entity';
import { PackageEntity } from '../packages/entities/package.entity';
import { AgentLog } from './entities/agent-log.entity';

@Injectable()
export class WebhookTriggersService {
  private readonly logger = new Logger(WebhookTriggersService.name);

  constructor(
    private readonly weCom: WeComService,
    @InjectRepository(PackageEntity)
    private readonly packagesRepo: Repository<PackageEntity>,
    @InjectRepository(AgentConfig)
    private readonly configRepo: Repository<AgentConfig>,
    @InjectRepository(AgentLog)
    private readonly logsRepo: Repository<AgentLog>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>
  ) {}

  private async getWebhookUrl(): Promise<string | null> {
    const config = await this.configRepo.findOne({
      where: {},
      order: { updatedAt: 'DESC' }
    });

    const webhookUrl = config?.webhookUrl?.trim();
    return webhookUrl ? webhookUrl : null;
  }

  async checkSecurityScore(pkg: PackageEntity): Promise<boolean> {
    const score = Number(pkg.securityScore ?? 0);
    if (score >= 70) {
      return false;
    }

    const severity = score < 50 ? '高风险' : '中风险';
    const content = [
      `## [MCP Market] ${severity}包告警`,
      `**包名**: ${pkg.name} v${pkg.version}`,
      `**安全评分**: ${score}/100`,
      `**审核备注**: ${pkg.reviewNote?.trim() || '无'}`,
      '> 请尽快人工核查'
    ].join('\n');

    return this.send(content);
  }

  async checkCredentials(pkg: PackageEntity): Promise<boolean> {
    const count = Array.isArray(pkg.credentials) ? pkg.credentials.length : 0;
    if (count <= 10) {
      return false;
    }

    const content = [
      '## [MCP Market] 异常凭据字段数量',
      `**包名**: ${pkg.name}`,
      `**凭据字段数**: ${count}`,
      '> 可能存在过度数据收集，请人工核查'
    ].join('\n');

    return this.send(content);
  }

  async checkDuplicateName(name: string): Promise<{ isDuplicate: boolean; similarName?: string }> {
    const normalized = name.trim().toLowerCase();
    if (!normalized) {
      return { isDuplicate: false };
    }

    const candidates = await this.packagesRepo
      .createQueryBuilder('pkg')
      .select(['pkg.name'])
      .getMany();

    let bestName: string | null = null;
    let bestDistance = Number.MAX_SAFE_INTEGER;

    for (const item of candidates) {
      const candidateName = (item.name ?? '').trim();
      const candidateNormalized = candidateName.toLowerCase();
      if (!candidateNormalized || candidateNormalized === normalized) {
        continue;
      }

      const distance = this.levenshtein(normalized, candidateNormalized);
      if (distance < 3 && distance < bestDistance) {
        bestDistance = distance;
        bestName = candidateName;
      }
    }

    if (!bestName) {
      return { isDuplicate: false };
    }

    const content = [
      '## [MCP Market] 疑似仿冒包',
      `**新包**: ${name}`,
      `**相似包**: ${bestName}`,
      `**编辑距离**: ${bestDistance}`,
      '> 请人工核查'
    ].join('\n');

    await this.send(content);
    return { isDuplicate: true, similarName: bestName };
  }

  async checkPipelineFailures(pkg: PackageEntity): Promise<boolean> {
    if (!pkg.id) {
      return false;
    }

    const failCount = await this.logsRepo.count({
      where: {
        packageId: pkg.id,
        status: 'failed'
      }
    });

    if (failCount < 3) {
      return false;
    }

    const content = [
      '## [MCP Market] 流水线连续失败',
      `**包名**: ${pkg.name}`,
      `**失败次数**: ${failCount}`,
      '> 需要人工排查'
    ].join('\n');

    return this.send(content);
  }

  async checkDownloadMilestone(pkg: PackageEntity): Promise<boolean> {
    const downloads = Number(pkg.downloads ?? 0);
    if (downloads !== 100 && downloads !== 500) {
      return false;
    }

    const content = [
      '## [MCP Market] 热门包里程碑',
      `**包名**: ${pkg.name}`,
      `**下载量**: ${downloads}`,
      `**里程碑**: ${downloads}`
    ].join('\n');

    return this.send(content);
  }

  async checkFirstPublish(authorId: string): Promise<boolean> {
    const publishCount = await this.packagesRepo.count({ where: { authorId } });
    if (publishCount !== 1) {
      return false;
    }

    const user = await this.usersRepo.findOne({ where: { id: authorId } });
    const content = [
      '## [MCP Market] 新用户首次发布',
      `**用户**: ${user?.email ?? authorId}`,
      '> 欢迎新社区成员'
    ].join('\n');

    return this.send(content);
  }

  async sendDailyDigest(): Promise<boolean> {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const [newPackages, pendingReview, totalPackages, agentRunsToday] = await Promise.all([
      this.packagesRepo.count({ where: { publishedAt: MoreThanOrEqual(since24h) } }),
      this.packagesRepo.count({ where: { reviewStatus: 'pending_review' } }),
      this.packagesRepo.count(),
      this.logsRepo.count({ where: { createdAt: MoreThanOrEqual(dayStart) } })
    ]);

    const downloadsRaw = await this.packagesRepo
      .createQueryBuilder('pkg')
      .select('COALESCE(SUM(pkg.downloads), 0)', 'total')
      .getRawOne<{ total: string | number }>();

    const totalDownloads = Number(downloadsRaw?.total ?? 0);

    const content = [
      '## [MCP Market] 每日运营摘要',
      `**近24h新增包**: ${newPackages}`,
      `**待审核**: ${pendingReview}`,
      `**包总数**: ${totalPackages}`,
      `**总下载**: ${totalDownloads}`,
      `**Agent执行次数**: ${agentRunsToday}`
    ].join('\n');

    return this.send(content);
  }

  async checkExpiredPackages(): Promise<boolean> {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const stale = await this.packagesRepo.find({
      where: {
        reviewStatus: 'approved',
        publishedAt: LessThan(cutoff)
      },
      order: { publishedAt: 'ASC' },
      take: 20
    });

    if (stale.length === 0) {
      return false;
    }

    const lines = stale.map((pkg) => {
      const days = Math.floor((Date.now() - pkg.publishedAt.getTime()) / (24 * 60 * 60 * 1000));
      return `- ${pkg.name}（${days}天未更新）`;
    });

    const content = ['## [MCP Market] 超90天未更新包周报', ...lines].join('\n');
    return this.send(content);
  }

  async detectTrends(): Promise<boolean> {
    const topPackages = await this.packagesRepo.find({
      where: { reviewStatus: 'approved' },
      order: { downloads: 'DESC' },
      take: 3
    });

    if (topPackages.length === 0) {
      return false;
    }

    const lines = topPackages.map((pkg, index) => `${index + 1}. ${pkg.name}（${pkg.downloads}）`);
    const content = ['## [MCP Market] 趋势工具包', ...lines].join('\n');
    return this.send(content);
  }

  private async send(content: string): Promise<boolean> {
    const webhookUrl = await this.getWebhookUrl();
    if (!webhookUrl) {
      return false;
    }

    const ok = await this.weCom.sendMessage(webhookUrl, content);
    if (!ok) {
      this.logger.warn('Failed to send webhook message');
    }
    return ok;
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;

    if (m === 0) return n;
    if (n === 0) return m;

    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i += 1) dp[i][0] = i;
    for (let j = 0; j <= n; j += 1) dp[0][j] = j;

    for (let i = 1; i <= m; i += 1) {
      for (let j = 1; j <= n; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }

    return dp[m][n];
  }

  // Compatibility helper for legacy callers.
  public static levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i += 1) dp[i][0] = i;
    for (let j = 0; j <= n; j += 1) dp[0][j] = j;

    for (let i = 1; i <= m; i += 1) {
      for (let j = 1; j <= n; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }

    return dp[m][n];
  }
}
