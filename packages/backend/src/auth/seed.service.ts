import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class SeedService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = 'jerrylin@sologenai.com';
    const password = 'kk.kk.11';
    const exists = await this.users.findOne({ where: { email } });
    if (!exists) {
      await this.users.save(
        this.users.create({
          email,
          passwordHash: createHash('sha256').update(password).digest('hex'),
          isSuperUser: true
        })
      );
      console.log('[Seed] Super user created:', email);
    } else if (!exists.isSuperUser) {
      await this.users.update(exists.id, { isSuperUser: true });
      console.log('[Seed] Super user flag set for:', email);
    }
  }
}
