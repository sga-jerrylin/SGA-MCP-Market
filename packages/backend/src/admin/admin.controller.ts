import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';
import type { Request } from 'express';
import { AgentRunnerService } from '../agent/agent-runner.service';
import { OpenRouterService } from '../agent/openrouter.service';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { WeComService } from './wecom.service';
import { AgentConfig } from './entities/agent-config.entity';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    isSuperUser: boolean;
  };
}

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly weCom: WeComService,
    private readonly openRouter: OpenRouterService,
    private readonly agentRunner: AgentRunnerService
  ) {}

  @UseGuards(AdminGuard)
  @Get('users')
  listUsers(): Promise<
    Array<{ id: string; email: string; isSuperUser: boolean; createdAt: Date }>
  > {
    return this.adminService.listUsers();
  }

  @UseGuards(AdminGuard)
  @Post('invite')
  inviteUser(
    @Body() body: { email: string }
  ): Promise<{ email: string; tempPassword: string }> {
    return this.adminService.inviteUser(body.email);
  }

  @UseGuards(AdminGuard)
  @Delete('users/:id')
  async deleteUser(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string
  ): Promise<{ ok: true }> {
    await this.adminService.deleteUser(id, req.user!.userId);
    return { ok: true };
  }

  @UseGuards(AdminGuard)
  @Get('agent')
  async getAgentConfig(): Promise<Omit<AgentConfig, 'apiKey'> & { apiKey: string | null }> {
    const config = await this.adminService.getAgentConfig();
    return {
      ...config,
      apiKey: config.apiKey ? `sk-...${config.apiKey.slice(-4)}` : null
    };
  }

  @UseGuards(AdminGuard)
  @Put('agent')
  updateAgentConfig(
    @Body()
    body: {
      enabled?: boolean;
      model?: string;
      imageModel?: string;
      baseUrl?: string;
      apiKey?: string;
      systemPrompt?: string;
      webhookUrl?: string;
    }
  ): Promise<AgentConfig> {
    return this.adminService.updateAgentConfig(body);
  }

  @UseGuards(AdminGuard)
  @Post('agent/test')
  async testAgentConnection(
    @Body() body: { model: string; apiKey: string; baseUrl?: string; systemPrompt?: string }
  ): Promise<{ ok: boolean; message: string }> {
    try {
      const config = await this.adminService.getAgentConfig();
      const baseUrl = body.baseUrl || config.baseUrl;
      const model = body.model || config.model;
      // 如果前端传来的是掩码值或空值，使用存储的 key
      const isMasked = !body.apiKey || body.apiKey.startsWith('sk-...');
      const apiKey = isMasked ? config.apiKey : body.apiKey;
      if (!apiKey) {
        return { ok: false, message: 'apiKey is required' };
      }

      await this.openRouter.chatCompletion({
        baseUrl,
        apiKey,
        model,
        maxTokens: 10,
        systemPrompt: body.systemPrompt || config.systemPrompt || undefined,
        messages: [{ role: 'user', content: 'ping' }]
      });

      return { ok: true, message: '连接成功' };
    } catch (err) {
      return { ok: false, message: `连接失败: ${String(err)}` };
    }
  }

  @UseGuards(AdminGuard)
  @Get('agent/logs')
  async getAgentLogs(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('action') action?: string
  ): Promise<{ code: number; data: { items: unknown[]; total: number } }> {
    const result = await this.adminService.getAgentLogs(Number(page), Number(limit), action);
    return { code: 0, data: result };
  }

  @UseGuards(AdminGuard)
  @Post('agent/retry-pipeline/:id')
  async retryPipeline(@Param('id') id: string): Promise<{ code: number; message: string }> {
    await this.agentRunner.retryPipeline(id);
    return { code: 0, message: 'Pipeline restarted' };
  }

  @UseGuards(AdminGuard)
  @Post('agent/test-webhook')
  async testWebhook(
    @Body() body: { webhookUrl: string }
  ): Promise<{ ok: boolean; message: string }> {
    const success = await this.weCom.sendMessage(
      body.webhookUrl,
      '## ✅ Test message\nClaw MCP Market Webhook connection test succeeded.'
    );
    return {
      ok: success,
      message: success ? '发送成功' : '发送失败，请检查 Webhook URL'
    };
  }

  @Get('announcement')
  getAnnouncement(): Promise<{
    content: string;
    items: Array<{ id: number; content: string; source: string; priority: number }>;
  }> {
    return this.adminService.getAnnouncement();
  }

  @UseGuards(AdminGuard)
  @Put('announcement')
  updateAnnouncement(@Body() body: { content: string }): Promise<{ content: string }> {
    return this.adminService.updateAnnouncement(body.content);
  }

  @UseGuards(AdminGuard)
  @Get('review-queue')
  async getReviewQueue(@Query('status') status?: string) {
    const items = await this.adminService.getReviewQueue(status);
    return { code: 0, message: 'ok', data: items };
  }

  @UseGuards(AdminGuard)
  @Post('packages/:id/review')
  async reviewPackage(
    @Param('id') id: string,
    @Body() body: { action: 'approve' | 'reject'; reason?: string }
  ) {
    await this.adminService.reviewPackage(id, body.action, body.reason);
    return { code: 0, message: 'ok' };
  }

  @UseGuards(AdminGuard)
  @Delete('packages/:id')
  async deletePackage(@Param('id') id: string) {
    await this.adminService.deletePackage(id);
    return { code: 0, message: 'ok' };
  }
}
