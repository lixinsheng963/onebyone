import { Controller, Get, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { assertEnum, ok, tokenFrom } from '../common';
import { StoreService } from '../core/store.service';

@Controller()
export class FeedController {
  constructor(private readonly store: StoreService) {}

  @Get('feed')
  feed(@Query('tab') tab = 'latest', @Req() req: FastifyRequest) {
    const safeTab = assertEnum(tab, ['latest', 'hot', 'featured'] as const, 'feed 类型');
    return ok(this.store.getFeed(safeTab, tokenFrom(req)));
  }

  @Get('topics')
  topics() {
    return ok(this.store.getTopics());
  }
}
