import { BadRequestException, Controller, HttpException, HttpStatus, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ok, tokenFrom } from '../common';
import { StorageService } from '../core/storage.service';
import { StoreService } from '../core/store.service';

interface UploadWindow {
  count: number;
  resetAt: number;
}

@Controller('media')
export class MediaController {
  private readonly uploads = new Map<string, UploadWindow>();

  constructor(
    private readonly store: StoreService,
    private readonly storage: StorageService
  ) {}

  @Post()
  async upload(@Req() req: FastifyRequest) {
    const user = this.store.getUserByToken(tokenFrom(req));
    if (!user) throw new UnauthorizedException('请先登录');
    const now = Date.now();
    const window = this.uploads.get(user.id);
    if (window && window.resetAt > now && window.count >= 20) {
      throw new HttpException('图片上传过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
    const file = await (req as any).file();
    if (!file) throw new BadRequestException('缺少图片文件');
    try {
      const buffer = await file.toBuffer();
      const media = await this.storage.upload(buffer, file.mimetype, user.id);
      const current = this.uploads.get(user.id);
      if (!current || current.resetAt <= now) {
        this.uploads.set(user.id, { count: 1, resetAt: now + 3600_000 });
      } else {
        current.count += 1;
      }
      return ok(this.store.addMedia(media));
    } catch (error) {
      const message = (error as Error).message;
      if (message === 'UNSUPPORTED_IMAGE_TYPE') throw new BadRequestException('只支持 JPG/PNG/WebP');
      if (message === 'IMAGE_TOO_LARGE') throw new BadRequestException('图片不能超过 8MB');
      if (message === 'INVALID_IMAGE') throw new BadRequestException('图片文件损坏');
      throw error;
    }
  }
}
