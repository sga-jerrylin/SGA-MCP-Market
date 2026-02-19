import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { PackagesModule } from './packages/packages.module';

@Module({
  imports: [
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
    PackagesModule
  ]
})
export class AppModule {}

