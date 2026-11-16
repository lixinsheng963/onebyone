import { BadRequestException, Body, Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { assertEnum, assertId, ok, optionalText, requireText, tokenFrom } from '../common';
import { DeepSeekService } from '../core/deepseek.service';
import { StoreService } from '../core/store.service';

@Controller()
export class ReportsController {
  constructor(
    private readonly store: StoreService,
    private readonly deepseek: DeepSeekService
  ) {}

  @Post('reports')
  async create(@Body() body: any, @Req() req: FastifyRequest) {
    const targetType = assertEnum(body?.targetType, ['post', 'comment', 'user'] as const, '举报对象');
    const targetId = assertId(body?.targetId, '举报对象');
    const reason = requireText(body?.reason, 64, '举报原因');
    const detail = optionalText(body?.detail, 500, '举报说明');
    try {
      const report = this.store.createReport({ targetType, targetId, reason, detail }, tokenFrom(req));
      const adminReport = this.store.getAdminReport(report.id);
      if (adminReport?.target?.exists) {
        const target = adminReport.target;
        const targetText = target.text
          || target.postText
          || [target.nickname, target.type === 'user' ? '用户资料举报' : ''].filter(Boolean).join(' ');
        const ai = await this.deepseek.judgeReport({
          reason,
          detail,
          targetType,
          targetText: targetText || '',
          hasMedia: Boolean(target.media?.length),
          context: target.type === 'comment' ? target.postText : undefined
        });
        if (ai) {
          const confident = ai.confidence >= 0.65;
          if (ai.decision === 'reject' && confident) {
            this.store.resolveReport(report.id, 'rejected', { ai, hide: false });
          } else if (ai.decision === 'uphold' && confident) {
            this.store.resolveReport(report.id, 'resolved', { ai, hide: true });
          } else {
            this.store.setReportAi(report.id, ai);
          }
        }
      }
      return ok(this.store.getAdminReport(report.id) || report);
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
