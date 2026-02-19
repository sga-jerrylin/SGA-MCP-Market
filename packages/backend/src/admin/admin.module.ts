import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PackageEntity } from '../packages/entities/package.entity';
import { User } from '../auth/entities/user.entity';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { AgentConfig } from './entities/agent-config.entity';
import { Announcement } from './entities/announcement.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, AgentConfig, Announcement, PackageEntity]), AuthModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard]
})
export class AdminModule {}
