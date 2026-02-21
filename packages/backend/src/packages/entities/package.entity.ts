import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export interface PackageCredentialField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  description?: string;
  defaultValue?: string;
}

@Entity('packages')
export class PackageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column()
  version!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column()
  category!: string;

  @Column()
  authorId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'authorId' })
  author!: User;

  @Column({ default: 'published' })
  status!: string;

  @Column({ default: 'pending_review' })
  reviewStatus!: string; // 'pending_review' | 'approved' | 'rejected'

  @Column({ type: 'text', nullable: true })
  reviewNote!: string | null; // Agent's review note / rejection reason

  @Column({ default: 0 })
  securityScore!: number; // 0-100, set by agent

  @Column({ type: 'text', nullable: true })
  agentSummary!: string | null; // Agent-generated description improvement suggestion

  @Column({ default: 'pending' })
  pipelineStatus!: string;

  @Column({ type: 'text', nullable: true })
  enhancedDescription!: string | null;

  @Column({ type: 'text', nullable: true })
  toolsSummary!: string | null;

  @Column({ type: 'text', nullable: true })
  cardImageBase64!: string | null;

  @Column({ nullable: true })
  autoCategory!: string | null;

  @Column({ type: 'text', nullable: true })
  pipelineError!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  pipelineCompletedAt!: Date | null;

  @Column({ default: 0 })
  toolsCount!: number;

  @Column({ default: 0 })
  downloads!: number;

  @Column('simple-json', { nullable: true, default: null })
  credentials!: PackageCredentialField[] | null;

  @Column()
  sha256!: string;

  @CreateDateColumn()
  publishedAt!: Date;
}
