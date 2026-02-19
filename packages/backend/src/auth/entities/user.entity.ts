import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn
} from 'typeorm';
import { Token } from './token.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  passwordHash!: string;

  @Column({ default: false })
  isSuperUser!: boolean;

  @Column({ default: false })
  forcePasswordChange!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @OneToMany(() => Token, (token) => token.user)
  tokens!: Token[];
}
