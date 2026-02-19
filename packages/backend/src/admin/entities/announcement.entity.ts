import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('announcement')
export class Announcement {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text', default: '🦞 欢迎来到 Claw MCP Market · SGA-Molt 中国社区 MCP 市场' })
  content!: string;

  @UpdateDateColumn()
  updatedAt!: Date;
}
