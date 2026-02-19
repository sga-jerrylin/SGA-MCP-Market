import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
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
  constructor(private readonly adminService: AdminService) {}

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
  getAgentConfig(): Promise<AgentConfig> {
    return this.adminService.getAgentConfig();
  }

  @UseGuards(AdminGuard)
  @Put('agent')
  updateAgentConfig(
    @Body() body: { enabled?: boolean; model?: string; apiKey?: string; systemPrompt?: string }
  ): Promise<AgentConfig> {
    return this.adminService.updateAgentConfig(body);
  }

  @Get('announcement')
  getAnnouncement(): Promise<{ content: string }> {
    return this.adminService.getAnnouncement();
  }

  @UseGuards(AdminGuard)
  @Put('announcement')
  updateAnnouncement(@Body() body: { content: string }): Promise<{ content: string }> {
    return this.adminService.updateAnnouncement(body.content);
  }
}
