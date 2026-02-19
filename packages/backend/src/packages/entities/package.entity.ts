import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

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

  @Column({ default: 0 })
  toolsCount!: number;

  @Column({ default: 0 })
  downloads!: number;

  @Column()
  sha256!: string;

  @CreateDateColumn()
  publishedAt!: Date;
}
