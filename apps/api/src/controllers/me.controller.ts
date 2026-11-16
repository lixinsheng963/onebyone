import { Controller, Delete, Get, Req, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ok, tokenFrom } from '../common';
import { StoreService } from '../core/store.service';

@Controller('me')
export class MeController {
  constructor(private readonly store: StoreService) {}

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
