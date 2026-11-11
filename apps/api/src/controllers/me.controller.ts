import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ok, tokenFrom } from '../common';
import { StoreService } from '../core/store.service';

@Controller('me')
export class MeController {
  constructor(private readonly store: StoreService) {}

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
}
