import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { PackageEntity } from '../packages/entities/package.entity';
import { AgentConfig } from '../admin/entities/agent-config.entity';
import { Announcement } from '../admin/entities/announcement.entity';
import { User } from '../auth/entities/user.entity';
import { AgentRunnerService } from './agent-runner.service';
import { WeComService } from '../admin/wecom.service';

@Module({
  imports: [
    ScheduleModule,
    TypeOrmModule.forFeature([PackageEntity, AgentConfig, Announcement, User])
  ],
  providers: [AgentRunnerService, WeComService],
  exports: [AgentRunnerService, WeComService]
})
export class AgentModule {}
