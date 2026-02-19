import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm';
import { User } from './user.entity';

@Entity('tokens')
export class Token {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @ManyToOne(() => User, (user) => user.tokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ unique: true })
  token!: string;

  @Column()
  name!: string;

  @Column({ type: 'simple-json', nullable: true })
  scope!: string[] | null;

  @Column({ type: 'datetime', nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
