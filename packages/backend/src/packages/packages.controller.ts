import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { MinioService } from '../storage/minio.service';
import { AuthGuard } from '../auth/auth.guard';
import { PackagesService } from './packages.service';

interface AuthenticatedRequest extends Request {
  user?: { userId: string };
}

@Controller('packages')
export class PackagesController {
  constructor(
    private readonly packagesService: PackagesService,
    private readonly minio: MinioService
  ) {}

  @Get()
  list(@Query('q') q?: string, @Query('category') category?: string) {
    return this.packagesService.list(q, category);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.packagesService.detail(id);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const pkg = await this.packagesService.detailInternal(id);
    if (!pkg) {
      throw new NotFoundException('package not found');
    }

    const key = `${id}/package.tgz`;
    const exists = await this.minio.objectExists(key);
    if (!exists) {
      throw new NotFoundException('tarball not found');
    }

    const stream = await this.minio.getObject(key);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="package.tgz"');
    stream.pipe(res);
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

  @UseGuards(AuthGuard)
  @Post('sync/push')
  @UseInterceptors(FileInterceptor('file'))
  async syncPush(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('metadata') metadataRaw: string
  ) {
    if (!metadataRaw) {
      throw new BadRequestException('metadata field is required');
    }

    let metadata: {
      packageId?: string;
      manifest?: {
        id?: string;
        name?: string;
        version?: string;
        description?: string;
        category?: string;
        toolCount?: number;
        sha256?: string;
        credentials?: unknown[];
      };
      autoDeploy?: boolean;
    };

    try {
      metadata = JSON.parse(metadataRaw) as typeof metadata;
    } catch {
      throw new BadRequestException('metadata must be valid JSON');
    }

    const manifest = metadata.manifest;
    if (!manifest) {
      throw new BadRequestException('metadata.manifest is required');
    }

    const { name, version, description, category, toolCount, credentials } = manifest;

    if (!name || !version) {
      throw new BadRequestException('manifest.name and manifest.version are required');
    }

    const saved = await this.packagesService.publish(req.user!.userId, file, {
      name,
      version,
      description,
      category,
      toolsCount: toolCount !== undefined ? String(toolCount) : undefined,
      credentials: credentials !== undefined ? JSON.stringify(credentials) : undefined,
    });

    return {
      code: 0,
      message: 'ok',
      data: {
        id: saved.id,
        name: saved.name,
        version: saved.version,
      },
    };
  }
}
