import { Injectable } from '@nestjs/common';

@Injectable()
export class WeComService {
  async sendMessage(webhookUrl: string, content: string): Promise<boolean> {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: { content }
        })
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  formatPackageReviewAlert(pkg: {
    name: string;
    version: string;
    authorEmail: string;
    securityScore: number;
    reviewNote: string;
  }): string {
    return (
      `## 🦞 [MCP Market] 新包待人工审核\n` +
      `**包名**: ${pkg.name} v${pkg.version}\n` +
      `**提交者**: ${pkg.authorEmail}\n` +
      `**Agent安全评分**: ${pkg.securityScore}/100\n` +
      `**Agent建议**: ${pkg.reviewNote}\n` +
      `> 请登录管理后台处理：http://localhost:5100/settings`
    );
  }
}
