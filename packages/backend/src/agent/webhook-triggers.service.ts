import { Injectable, Logger } from '@nestjs/common';
import { AgentConfig } from '../admin/entities/agent-config.entity';
import { WeComService } from '../admin/wecom.service';
import { PackageEntity } from '../packages/entities/package.entity';

interface DailyDigestStats {
  newToday: number;
  pendingReview: number;
  totalDownloads: number;
  activePackages: number;
  agentRunsToday: number;
}

@Injectable()
export class WebhookTriggersService {
  private readonly logger = new Logger(WebhookTriggersService.name);

  constructor(private readonly weCom: WeComService) {}

  async notifyLowSecurityScore(
    config: AgentConfig,
    pkg: PackageEntity,
    score: number
  ): Promise<boolean> {
    if (score >= 70) {
      return false;
    }

    const title = score < 50 ? '## ⚠️ [MCP Market] 高风险包检测' : '## ⚠️ [MCP Market] 边界安全评分';
    const reviewNote = pkg.reviewNote?.trim() || '无';

    const content = [
      title,
      `**包名**: ${pkg.name} v${pkg.version}`,
      `**安全评分**: ${score}/100`,
      `**Agent备注**: ${reviewNote}`,
      '> 请立即审核'
    ].join('\n');

    return this.send(config.webhookUrl, content);
  }

  async notifyHighCredentials(config: AgentConfig, pkg: PackageEntity): Promise<boolean> {
    const count = Array.isArray(pkg.credentials) ? pkg.credentials.length : 0;
    if (count <= 10) {
      return false;
    }

    const content = [
      '## ⚠️ [MCP Market] 异常凭据字段数量',
      `**包名**: ${pkg.name}`,
      `**凭据字段数**: ${count}`,
      '> 可能存在过度数据收集'
    ].join('\n');

    return this.send(config.webhookUrl, content);
  }

  async notifySimilarName(
    config: AgentConfig,
    pkg: PackageEntity,
    similarPkg: PackageEntity
  ): Promise<boolean> {
    const distance = WebhookTriggersService.levenshteinDistance(
      pkg.name.toLowerCase(),
      similarPkg.name.toLowerCase()
    );

    const content = [
      '## ⚠️ [MCP Market] 疑似仿冒包',
      `**新包**: ${pkg.name}`,
      `**相似包**: ${similarPkg.name}`,
      `**编辑距离**: ${distance}`,
      '> 请人工核查'
    ].join('\n');

    return this.send(config.webhookUrl, content);
  }

  async notifyPipelineFailures(
    config: AgentConfig,
    pkg: PackageEntity,
    failCount: number
  ): Promise<boolean> {
    if (failCount < 3) {
      return false;
    }

    const content = [
      '## ⚠️ [MCP Market] 流水线连续失败',
      `**包名**: ${pkg.name}`,
      `**失败次数**: ${failCount}`,
      '> 需人工排查'
    ].join('\n');

    return this.send(config.webhookUrl, content);
  }

  async notifyDownloadMilestone(
    config: AgentConfig,
    pkg: PackageEntity,
    milestone: number
  ): Promise<boolean> {
    if (milestone !== 100 && milestone !== 500) {
      return false;
    }

    const content = [
      '## 🎉 [MCP Market] 热门包里程碑',
      `**包名**: ${pkg.name}`,
      `**下载量**: ${pkg.downloads}`,
      `**里程碑**: ${milestone}`
    ].join('\n');

    return this.send(config.webhookUrl, content);
  }

  async notifyFirstPublish(config: AgentConfig, authorEmail: string): Promise<boolean> {
    const content = [
      '## 🌟 [MCP Market] 新用户首次发布',
      `**用户**: ${authorEmail}`,
      '> 欢迎新社区成员'
    ].join('\n');

    return this.send(config.webhookUrl, content);
  }

  async sendDailyDigest(config: AgentConfig, stats: DailyDigestStats): Promise<boolean> {
    const content = [
      '## 📊 [MCP Market] 每日运营摘要',
      `**新增包**: ${stats.newToday}`,
      `**待审核**: ${stats.pendingReview}`,
      `**总下载**: ${stats.totalDownloads}`,
      `**活跃包**: ${stats.activePackages}`,
      `**Agent执行**: ${stats.agentRunsToday}`
    ].join('\n');

    return this.send(config.webhookUrl, content);
  }

  // Compatibility methods for existing publish flow integrations.
  async checkDuplicateName(_name: string): Promise<{ isDuplicate: boolean; similarName?: string }> {
    return { isDuplicate: false };
  }

  async checkFirstPublish(_authorId: string): Promise<boolean> {
    return false;
  }

  static levenshteinDistance(a: string, b: string): number {
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

  private async send(webhookUrl: string | null, content: string): Promise<boolean> {
    if (!webhookUrl || !webhookUrl.trim()) {
      return false;
    }

    const ok = await this.weCom.sendMessage(webhookUrl.trim(), content);
    if (!ok) {
      this.logger.warn('Failed to send webhook message');
    }
    return ok;
  }
}
