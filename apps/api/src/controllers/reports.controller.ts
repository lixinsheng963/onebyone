import { BadRequestException, Body, Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { assertEnum, assertId, ok, optionalText, requireText, tokenFrom } from '../common';
import { StoreService } from '../core/store.service';

@Controller()
export class ReportsController {
  constructor(private readonly store: StoreService) {}

  @Post('reports')
  create(@Body() body: any, @Req() req: FastifyRequest) {
    const targetType = assertEnum(body?.targetType, ['post', 'comment', 'user'] as const, '举报对象');
    const targetId = assertId(body?.targetId, '举报对象');
    const reason = requireText(body?.reason, 64, '举报原因');
    const detail = optionalText(body?.detail, 500, '举报说明');
    try {
      return ok(this.store.createReport({ targetType, targetId, reason, detail }, tokenFrom(req)));
    } catch (error) {
      const message = (error as Error).message;
      if (message === 'AUTH_REQUIRED') throw new UnauthorizedException('请先登录');
      if (message === 'NOT_FOUND') throw new BadRequestException('举报对象不存在');
      throw error;
    }
  }

  @Post('appeals')
  appeal(@Body() body: any, @Req() req: FastifyRequest) {
    if (!this.store.getUserByToken(tokenFrom(req))) throw new UnauthorizedException('请先登录');
    const reason = requireText(body?.reason, 1000, '申诉理由');
    return ok({
      publicId: `appeal_${Date.now()}`,
      status: 'pending',
      message: '申诉已提交，24 小时内由另一位审核员复核',
      reason
    });
  }
}
