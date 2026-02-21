import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { PackageEntity } from '../packages/entities/package.entity';
import { AgentConfig } from '../admin/entities/agent-config.entity';
import { Announcement } from '../admin/entities/announcement.entity';
import { AnnouncementItem } from '../admin/entities/announcement-item.entity';
import { User } from '../auth/entities/user.entity';
import { AgentRunnerService } from './agent-runner.service';
import { WeComService } from '../admin/wecom.service';
import { AgentLog } from './entities/agent-log.entity';
import { OpenRouterService } from './openrouter.service';
import { WebhookTriggersService } from './webhook-triggers.service';

@Module({
  imports: [
    ScheduleModule,
    TypeOrmModule.forFeature([
      PackageEntity,
      AgentConfig,
      Announcement,
      AnnouncementItem,
      User,
      AgentLog
    ])
  ],
  providers: [AgentRunnerService, WeComService, OpenRouterService, WebhookTriggersService],
  exports: [AgentRunnerService, WeComService, OpenRouterService, WebhookTriggersService]
})
export class AgentModule {}

