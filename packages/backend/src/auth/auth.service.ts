import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { Token } from './entities/token.entity';
import { User } from './entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Token) private readonly tokens: Repository<Token>
  ) {}

  async register(email: string, password: string): Promise<{ id: string; email: string }> {
    if (!email || !password) {
      throw new BadRequestException('email and password are required');
    }

    const exists = await this.users.findOne({ where: { email } });
    if (exists) {
      throw new ConflictException('email already exists');
    }

    const saved = await this.users.save(
      this.users.create({ email, passwordHash: this.hash(password) })
    );
    return { id: saved.id, email: saved.email };
  }

  async login(email: string, password: string): Promise<string> {
    const user = await this.users.findOne({ where: { email } });
    if (!user || user.passwordHash !== this.hash(password)) {
      throw new UnauthorizedException('invalid credentials');
    }

    const token = randomBytes(16).toString('hex');
    await this.tokens.save(
      this.tokens.create({
        userId: user.id,
        token,
        name: 'session',
        scope: ['session'],
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      })
    );

    return token;
  }

  async createToken(
    userId: string,
    name: string,
    scope?: string[],
    expiresAt?: string
  ): Promise<{ token: string; id: string }> {
    if (!name || name.trim().length === 0) {
      throw new BadRequestException('name is required');
    }

    const token = randomBytes(16).toString('hex');
    const saved = await this.tokens.save(
      this.tokens.create({
        userId,
        token,
        name,
        scope: scope && scope.length > 0 ? scope : ['publish', 'read'],
        expiresAt: expiresAt ? new Date(expiresAt) : null
      })
    );

    return { token: saved.token, id: saved.id };
  }

  async listTokens(userId: string): Promise<Array<{ id: string; name: string; scope: string[]; expiresAt: string | null; createdAt: string }>> {
    const rows = await this.tokens.find({
      where: { userId },
      order: { createdAt: 'DESC' }
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      scope: row.scope ?? [],
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      createdAt: row.createdAt.toISOString()
    }));
  }

  async revokeToken(userId: string, id: string): Promise<void> {
    await this.tokens.delete({ id, userId });
  }

  async verifyToken(tokenValue: string): Promise<{ userId: string }> {
    const row = await this.tokens.findOne({ where: { token: tokenValue } });
    if (!row) {
      throw new UnauthorizedException('invalid token');
    }
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('token expired');
    }
    return { userId: row.userId };
  }

  private hash(password: string): string {
    return createHash('sha256').update(password).digest('hex');
  }
}
