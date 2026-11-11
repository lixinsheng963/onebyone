import { Controller, Get, NotFoundException, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { assertId, ok, tokenFrom } from '../common';
import { StoreService } from '../core/store.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly store: StoreService) {}

  @Get()
  list(@Req() req: FastifyRequest) {
    try {
      return ok(this.store.getNotifications(tokenFrom(req)));
    } catch (error) {
      if ((error as Error).message === 'AUTH_REQUIRED') throw new UnauthorizedException('请先登录');
      throw error;
    }
  }

  @Post(':notificationId/read')
  read(@Param('notificationId') notificationId: string, @Req() req: FastifyRequest) {
    assertId(notificationId, '通知');
    try {
      const read = this.store.markNotificationRead(notificationId, tokenFrom(req));
      if (!read) throw new NotFoundException('通知不存在');
      return ok({ read });
    } catch (error) {
      if ((error as Error).message === 'AUTH_REQUIRED') throw new UnauthorizedException('请先登录');
      throw error;
    }
  }
}
