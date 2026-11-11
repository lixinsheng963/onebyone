import { Controller, Get, Param } from '@nestjs/common';
import { assertId, ok } from '../common';
import { StoreService } from '../core/store.service';

@Controller('notices')
export class NoticesController {
  constructor(private readonly store: StoreService) {}

  @Get('emergency')
  emergency() {
    return ok(this.store.getEmergency());
  }

  @Get()
  list() {
    return ok(this.store.getNotices());
  }

  @Get(':noticeId')
  detail(@Param('noticeId') noticeId: string) {
    assertId(noticeId, '通知');
    return ok(this.store.getNotice(noticeId) ?? null);
  }
}
