import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AgentModule } from '../agent/agent.module';
import { PackageEntity } from './entities/package.entity';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';

@Module({
  imports: [TypeOrmModule.forFeature([PackageEntity]), AuthModule, AgentModule],
  controllers: [PackagesController],
  providers: [PackagesService],
  exports: [PackagesService]
})
export class PackagesModule {}

