import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { assertId, ok, optionalText, requireText, stringList, tokenFrom } from '../common';
import { DeepSeekService } from '../core/deepseek.service';
import { mergeModeration } from '../core/moderation';
import { StorageService } from '../core/storage.service';
import { StoreService } from '../core/store.service';
import { WechatSafetyService } from '../core/wechat-safety.service';

@Controller('posts')
export class PostsController {
  constructor(
    private readonly store: StoreService,
    private readonly deepseek: DeepSeekService,
    private readonly wechat: WechatSafetyService,
    private readonly storage: StorageService
  ) {}

  @Get('comments/:commentId/replies')
  replies(@Param('commentId') commentId: string) {
    assertId(commentId, '评论');
    return ok({ commentId, items: [] });
  }

  @Get(':publicId/comments')
  comments(@Param('publicId') publicId: string, @Req() req: FastifyRequest) {
    assertId(publicId, '内容');
    const viewer = this.store.getUserByToken(tokenFrom(req));
    return ok(this.store.getComments(publicId, viewer));
  }

  @Get(':publicId')
  detail(@Param('publicId') publicId: string, @Req() req: FastifyRequest) {
    assertId(publicId, '内容');
    const result = this.store.getPost(publicId, tokenFrom(req));
    if (!result) return ok(null);
    return ok(result);
  }

  @Post()
  async create(@Body() body: any, @Req() req: FastifyRequest) {
    const token = tokenFrom(req);
    const user = this.store.getUserByToken(token);
    if (!user) throw new UnauthorizedException('请先登录');
    const text = requireText(body?.text, 2000, '正文');
    const mediaIds = stringList(body?.mediaIds, 9, 96, '图片').map((item) => assertId(item, '图片'));
    const topic = optionalText(body?.topic, 30, '话题');
    const location = optionalText(body?.location, 50, '地点');
    const input = {
      text,
      mediaIds,
      topic,
      location,
      anonymity: body?.anonymity === true,
      commentsEnabled: body?.commentsEnabled !== false
    };
    const [ai, wechat] = await Promise.all([
      this.deepseek.classify(text),
      this.wechat.scanText(text, user.openid)
    ]);
    const extra = ai && wechat ? mergeModeration(wechat, ai) : ai || wechat;
    return ok(this.store.createPost(input, token, extra));
  }

  @Post(':publicId/like')
  like(@Param('publicId') publicId: string, @Req() req: FastifyRequest) {
    assertId(publicId, '内容');
    try {
      return ok(this.store.setLike(publicId, tokenFrom(req), true));
    } catch (error) {
      this.mapPostError(error);
    }
  }

  @Delete(':publicId/like')
  unlike(@Param('publicId') publicId: string, @Req() req: FastifyRequest) {
    assertId(publicId, '内容');
    try {
      return ok(this.store.setLike(publicId, tokenFrom(req), false));
    } catch (error) {
      this.mapPostError(error);
    }
  }

  @Post(':publicId/favorite')
  favorite(@Param('publicId') publicId: string, @Req() req: FastifyRequest) {
    assertId(publicId, '内容');
    try {
      return ok(this.store.setFavorite(publicId, tokenFrom(req), true));
    } catch (error) {
      this.mapPostError(error);
    }
  }

  @Delete(':publicId/favorite')
  unfavorite(@Param('publicId') publicId: string, @Req() req: FastifyRequest) {
    assertId(publicId, '内容');
    try {
      return ok(this.store.setFavorite(publicId, tokenFrom(req), false));
    } catch (error) {
      this.mapPostError(error);
    }
  }

  @Post(':publicId/view')
  view(@Param('publicId') publicId: string, @Req() req: FastifyRequest) {
    assertId(publicId, '内容');
    const token = tokenFrom(req);
    const user = this.store.getUserByToken(token);
    const key = user?.id ?? (req.ip || 'anonymous');
    try {
      return ok(this.store.recordView(publicId, key));
    } catch (error) {
      this.mapPostError(error);
    }
  }

  @Delete(':publicId')
  async remove(@Param('publicId') publicId: string, @Req() req: FastifyRequest) {
    assertId(publicId, '内容');
    try {
      const media = this.store.deletePost(publicId, tokenFrom(req));
      await this.storage.deleteMedia(media);
      return ok({ deleted: true });
    } catch (error) {
      if ((error as Error).message === 'AUTH_REQUIRED') throw new UnauthorizedException('请先登录');
      if ((error as Error).message === 'FORBIDDEN') throw new ForbiddenException('只能删除自己的内容');
      if ((error as Error).message === 'NOT_FOUND') throw new NotFoundException('内容不存在');
      throw error;
    }
  }

  @Post(':publicId/pin')
  pin(@Param('publicId') publicId: string, @Req() req: FastifyRequest) {
    return this.setPin(publicId, req, true);
  }

  @Delete(':publicId/pin')
  unpin(@Param('publicId') publicId: string, @Req() req: FastifyRequest) {
    return this.setPin(publicId, req, false);
  }

  private setPin(publicId: string, req: FastifyRequest, pinned: boolean) {
    assertId(publicId, '内容');
    try {
      return ok(this.store.setPinned(publicId, tokenFrom(req), pinned));
    } catch (error) {
      if ((error as Error).message === 'AUTH_REQUIRED') throw new UnauthorizedException('请先登录');
      if ((error as Error).message === 'FORBIDDEN') throw new ForbiddenException('只能置顶自己的内容');
      if ((error as Error).message === 'PIN_LIMIT') throw new BadRequestException('置顶条数最高只能达五条，现您已达标！');
      if ((error as Error).message === 'NOT_FOUND') throw new NotFoundException('内容不存在');
      throw error;
    }
  }

  private mapPostError(error: unknown): never {
    const message = (error as Error).message;
    if (message === 'AUTH_REQUIRED') throw new UnauthorizedException('请先登录');
    if (message === 'NOT_FOUND') throw new NotFoundException('内容不存在');
    if (message === 'COMMENTS_CLOSED') throw new BadRequestException('该内容已关闭评论');
    throw error as Error;
  }

  @Post(':publicId/comments')
  async comment(@Param('publicId') publicId: string, @Body() body: any, @Req() req: FastifyRequest) {
    assertId(publicId, '内容');
    const token = tokenFrom(req);
    const user = this.store.getUserByToken(token);
    if (!user) throw new UnauthorizedException('请先登录');
    const text = requireText(body?.text, 500, '评论');
    const replyToCommentId = body?.replyToCommentId ? assertId(body.replyToCommentId, '回复评论') : undefined;
    const [ai, wechat] = await Promise.all([
      this.deepseek.classify(text),
      this.wechat.scanText(text, user.openid)
    ]);
    const extra = ai && wechat ? mergeModeration(wechat, ai) : ai || wechat;
    try {
      return ok(this.store.createComment(publicId, text, token, replyToCommentId, body?.anonymity !== false, extra));
    } catch (error) {
      this.mapPostError(error);
    }
  }
}
