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
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: { email: string; password: string }): Promise<{ id: string; email: string }> {
    return this.authService.register(body.email, body.password);
  }

  @Post('login')
  async login(@Body() body: { email: string; password: string }): Promise<{ accessToken: string }> {
    const accessToken = await this.authService.login(body.email, body.password);
    return { accessToken };
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
  ): Promise<Array<{ id: string; name: string; scope: string[]; expiresAt: string | null; createdAt: string }>> {
    return this.authService.listTokens(req.user!.userId);
  }

  @UseGuards(AuthGuard)
  @Delete('tokens/:id')
  async revokeToken(@Req() req: AuthenticatedRequest, @Param('id') id: string): Promise<{ ok: true }> {
    await this.authService.revokeToken(req.user!.userId, id);
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @Get('verify')
  verify(@Req() req: AuthenticatedRequest): { valid: true; userId: string } {
    return { valid: true, userId: req.user!.userId };
  }
}
