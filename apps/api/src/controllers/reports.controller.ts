import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
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
          images: target.media,
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
      if (message === 'ACCOUNT_MUTED') throw new ForbiddenException('账号已被禁言，暂时无法举报');
      if (message === 'ACCOUNT_DISABLED') throw new ForbiddenException('账号已被停用');
      if (message === 'AUTH_REQUIRED') throw new UnauthorizedException('请先登录');
      if (message === 'NOT_FOUND') throw new BadRequestException('举报对象不存在');
      throw error;
    }
  }

  @Post('appeals')
  appeal(@Body() body: any, @Req() req: FastifyRequest) {
    const token = tokenFrom(req);
    if (!token) throw new UnauthorizedException('请先登录');
    const targetType = assertEnum(body?.targetType, ['post', 'comment', 'user'] as const, '申诉对象');
    const targetId = assertId(body?.targetId, '申诉对象');
    const reason = requireText(body?.reason, 1000, '申诉理由');
    try {
      return ok(this.store.createAppeal(token, { targetType, targetId, reason }));
    } catch (error) {
      const message = (error as Error).message;
      if (message === 'AUTH_REQUIRED') throw new UnauthorizedException('请先登录');
      if (message === 'NOT_FOUND') throw new BadRequestException('申诉对象不存在');
      if (message === 'FORBIDDEN') throw new ForbiddenException('只能申诉自己的内容');
      if (message === 'NOT_APPEALABLE') throw new BadRequestException('该内容当前不可申诉');
      if (message === 'APPEAL_DUPLICATE') throw new BadRequestException('该内容已有待处理申诉');
      throw error;
    }
  }

  @Get('me/appeals')
  myAppeals(@Req() req: FastifyRequest) {
    try {
      return ok(this.store.getMyAppeals(tokenFrom(req)));
    } catch (error) {
      if ((error as Error).message === 'AUTH_REQUIRED') throw new UnauthorizedException('请先登录');
      throw error;
    }
  }
}
