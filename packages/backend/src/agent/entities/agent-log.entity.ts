import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('agent_logs')
export class AgentLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ nullable: true })
  packageId!: string | null;

  @Column()
  action!: string;

  @Column({ type: 'simple-json', nullable: true })
  detail!: Record<string, unknown> | null;

  @Column()
  status!: string;

  @Column({ default: 0 })
  durationMs!: number;

  @CreateDateColumn()
  createdAt!: Date;
}

