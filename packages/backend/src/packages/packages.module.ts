import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PackageEntity } from './entities/package.entity';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';

@Module({
  imports: [TypeOrmModule.forFeature([PackageEntity]), AuthModule],
  controllers: [PackagesController],
  providers: [PackagesService],
  exports: [PackagesService]
})
export class PackagesModule {}
