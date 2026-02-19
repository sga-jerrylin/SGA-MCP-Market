import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentModule } from './agent/agent.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { PackagesModule } from './packages/packages.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USER ?? 'market',
      password: process.env.DB_PASS ?? 'market',
      database: process.env.DB_NAME ?? 'market',
      autoLoadEntities: true,
      synchronize: process.env.NODE_ENV !== 'production'
    }),
    AuthModule,
    PackagesModule,
    AdminModule,
    AgentModule
  ]
})
export class AppModule {}
