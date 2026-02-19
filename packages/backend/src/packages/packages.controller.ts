import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { PackagesService } from './packages.service';

interface AuthenticatedRequest extends Request {
  user?: { userId: string };
}

@Controller('packages')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Get()
  list(@Query('q') q?: string, @Query('category') category?: string) {
    return this.packagesService.list(q, category);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.packagesService.detail(id);
  }

  @UseGuards(AuthGuard)
  @Post('publish')
  @UseInterceptors(FileInterceptor('file'))
  publish(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body()
    body: {
      name: string;
      version: string;
      description?: string;
      category?: string;
      status?: string;
      toolsCount?: string;
      credentials?: string;
    }
  ) {
    return this.packagesService.publish(req.user!.userId, file, body);
  }
}
