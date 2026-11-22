import { BadRequestException, Controller, ForbiddenException, HttpException, HttpStatus, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ok, tokenFrom } from '../common';
import { StorageService } from '../core/storage.service';
import { ImageSafetyService } from '../core/image-safety.service';
import { StoreService } from '../core/store.service';

@Controller('media')
export class MediaController {
  constructor(
    private readonly store: StoreService,
    private readonly storage: StorageService,
    private readonly imageSafety: ImageSafetyService
  ) {}

  @Post()
  async upload(@Req() req: FastifyRequest) {
    const user = this.store.getUserByToken(tokenFrom(req));
    if (!user) throw new UnauthorizedException('请先登录');
    if (!user.admittedAt) throw new ForbiddenException('请先完成邀请码认证');
    const purpose = String((req.query as any)?.purpose || '');
    if (!user.school && purpose !== 'avatar') throw new ForbiddenException('请到“我的”页面选择学校');
    const file = await (req as any).file();
    if (!file) throw new BadRequestException('缺少图片文件');
    try {
      const buffer = await file.toBuffer();
      const media = await this.storage.upload(buffer, file.mimetype, user.id);
      try {
        const safety = await this.imageSafety.check({ url: media.url, mediaId: media.id, ownerId: user.id });
        if (safety.status === 'blocked') {
          await this.storage.deleteMedia([media]);
          throw new BadRequestException('图片未通过内容安全检测');
        }
        media.safetyStatus = safety.status;
        media.safetyLabel = safety.label;
        media.safetyTraceId = safety.traceId;
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        await this.storage.deleteMedia([media]);
        throw new HttpException('图片内容安全检测暂不可用，请稍后再试', HttpStatus.SERVICE_UNAVAILABLE);
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
