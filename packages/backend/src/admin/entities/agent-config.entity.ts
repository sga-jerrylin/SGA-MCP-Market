import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('agent_config')
export class AgentConfig {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ default: false })
  enabled!: boolean;

  @Column({ default: 'claude-sonnet-4-6' })
  model!: string;

  @Column({ default: 'bytedance-seed/seedream-4.5' })
  imageModel!: string;

  @Column({ default: 'https://openrouter.ai/api/v1' })
  baseUrl!: string;

  @Column({ type: 'text', nullable: true })
  apiKey!: string | null;

  @Column({ type: 'text', nullable: true })
  systemPrompt!: string | null;

  @Column({ type: 'text', nullable: true })
  webhookUrl!: string | null;

  @Column({ default: 1440 })
  heartbeatMinutes!: number;

  @Column({ default: 9 })
  dailyDigestHour!: number;

  @Column({ default: 9 })
  trendDetectionHour!: number;

  @Column({ default: 1 })
  weeklyExpireDay!: number; // 0=Sun, 1=Mon, ..., 6=Sat

  @UpdateDateColumn()
  updatedAt!: Date;
}
