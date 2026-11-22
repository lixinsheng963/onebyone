import { BadRequestException, Body, Controller, ForbiddenException, Get, Put, Req, UnauthorizedException } from '@nestjs/common';
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
      const school = body?.school === undefined ? undefined : optionalText(body.school, 64, '学校');
      if (nickname !== undefined && !nickname.trim()) throw new BadRequestException('昵称不能为空');
      if (school !== undefined && !school.trim()) throw new BadRequestException('请选择学校');
      return ok(this.store.updateMyProfile(tokenFrom(req), { nickname, avatar, school }));
    } catch (error) {
      if ((error as Error).message === 'AUTH_REQUIRED') throw new UnauthorizedException('请先登录');
      if ((error as Error).message === 'INVITE_REQUIRED') throw new ForbiddenException('请先完成邀请码认证');
      if ((error as Error).message === 'NICKNAME_INVALID') throw new BadRequestException('昵称需为 1-16 个字');
      if ((error as Error).message === 'AVATAR_INVALID') throw new BadRequestException('头像地址不合法');
      if ((error as Error).message === 'SCHOOL_INVALID') throw new BadRequestException('现阶段仅支持湖南人文科技学院');
      if ((error as Error).message === 'SCHOOL_LOCKED') throw new BadRequestException('学校已选择，不能修改');
      throw error;
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
