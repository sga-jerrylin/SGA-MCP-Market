import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import path from 'node:path';
import { AuthModule } from './auth/auth.module';
import { PackagesModule } from './packages/packages.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'market.sqlite'),
      autoLoadEntities: true,
      synchronize: true
    }),
    AuthModule,
    PackagesModule
  ]
})
export class AppModule {}
