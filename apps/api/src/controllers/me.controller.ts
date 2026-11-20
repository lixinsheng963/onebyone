import { BadRequestException, Body, Controller, Delete, Get, Put, Req, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ok, optionalText, tokenFrom } from '../common';
import { StoreService } from '../core/store.service';

@Controller('me')
export class MeController {
  constructor(private readonly store: StoreService) {}

  @Put()
  update(@Body() body: any, @Req() req: FastifyRequest) {
    try {
      const nickname = body?.nickname === undefined ? undefined : optionalText(body.nickname, 16, '昵称');
      const avatar = body?.avatar === undefined ? undefined : optionalText(body.avatar, 500, '头像');
      if (nickname !== undefined && !nickname.trim()) throw new BadRequestException('昵称不能为空');
      return ok(this.store.updateMyProfile(tokenFrom(req), { nickname, avatar }));
    } catch (error) {
      if ((error as Error).message === 'AUTH_REQUIRED') throw new UnauthorizedException('请先登录');
      if ((error as Error).message === 'NICKNAME_INVALID') throw new BadRequestException('昵称需为 1-16 个字');
      if ((error as Error).message === 'AVATAR_INVALID') throw new BadRequestException('头像地址不合法');
      throw error;
    }
  }

  @Delete()
  remove(@Req() req: FastifyRequest) {
    try {
      this.store.deleteMyAccount(tokenFrom(req));
      return ok({ deleted: true });
    } catch {
      throw new UnauthorizedException('请先登录');
    }
  }

  @Get('posts')
  posts(@Req() req: FastifyRequest) {
    try {
      return ok(this.store.getMyPosts(tokenFrom(req)));
    } catch {
      throw new UnauthorizedException('请先登录');
    }
  }

  @Get('comments')
  comments(@Req() req: FastifyRequest) {
    try {
      return ok(this.store.getMyComments(tokenFrom(req)));
    } catch {
      throw new UnauthorizedException('请先登录');
    }
  }

  @Get('favorites')
  favorites(@Req() req: FastifyRequest) {
    try {
      return ok(this.store.getMyFavorites(tokenFrom(req)));
    } catch {
      throw new UnauthorizedException('请先登录');
    }
  }

  @Get('comment-threads')
  commentThreads(@Req() req: FastifyRequest) {
    try {
      return ok(this.store.getMyCommentThreads(tokenFrom(req)));
    } catch {
      throw new UnauthorizedException('请先登录');
    }
  }
}
