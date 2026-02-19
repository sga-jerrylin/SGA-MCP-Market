import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    isSuperUser: boolean;
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(
    @Body() body: { email: string; password: string }
  ): Promise<{ accessToken: string; isSuperUser: boolean; email: string }> {
    return this.authService.login(body.email, body.password);
  }

  @UseGuards(AuthGuard)
  @Post('tokens')
  createToken(
    @Req() req: AuthenticatedRequest,
    @Body() body: { name: string; scope?: string[]; expiresAt?: string }
  ): Promise<{ token: string; id: string }> {
    return this.authService.createToken(req.user!.userId, body.name, body.scope, body.expiresAt);
  }

  @UseGuards(AuthGuard)
  @Get('tokens')
  listTokens(
    @Req() req: AuthenticatedRequest
  ): Promise<
    Array<{ id: string; name: string; scope: string[]; expiresAt: string | null; createdAt: string }>
  > {
    return this.authService.listTokens(req.user!.userId);
  }

  @UseGuards(AuthGuard)
  @Delete('tokens/:id')
  async revokeToken(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string
  ): Promise<{ ok: true }> {
    await this.authService.revokeToken(req.user!.userId, id);
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @Get('verify')
  verify(
    @Req() req: AuthenticatedRequest
  ): { valid: true; userId: string; email: string; isSuperUser: boolean } {
    return {
      valid: true,
      userId: req.user!.userId,
      email: req.user!.email,
      isSuperUser: req.user!.isSuperUser
    };
  }
}
