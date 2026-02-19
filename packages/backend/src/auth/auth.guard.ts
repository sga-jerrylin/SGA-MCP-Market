import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
  };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.readBearer(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const user = await this.authService.verifyToken(token);
    request.user = { userId: user.userId };
    return true;
  }

  private readBearer(header?: string): string | null {
    if (!header || !header.startsWith('Bearer ')) {
      return null;
    }
    const token = header.slice('Bearer '.length).trim();
    return token.length > 0 ? token : null;
  }
}
