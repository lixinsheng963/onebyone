import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { adminTokenFrom, assertEnum, assertId, ok, optionalText, requireText } from '../common';
import { LoginThrottleService } from '../core/login-throttle.service';
import { StoreService } from '../core/store.service';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly store: StoreService,
    private readonly loginThrottle: LoginThrottleService
  ) {}

  @Post('auth/login')
  async login(@Body() body: { email?: string; password?: string; totp?: string }, @Req() req: FastifyRequest) {
    const key = `admin:${req.ip}`;
    try {
      await this.loginThrottle.check(key, 5, 15 * 60 * 1000);
    } catch {
      throw new HttpException('登录尝试过多，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
    try {
      const email = requireText(body?.email, 120, '邮箱');
      const password = requireText(body?.password, 200, '密码');
      const totp = requireText(body?.totp, 6, '动态验证码');
      const result = this.store.adminLogin(email, password, totp);
      await this.loginThrottle.success(key);
      return ok(result);
    } catch (error) {
      const message = (error as Error).message;
      if (message === 'ADMIN_AUTH_NOT_CONFIGURED') {
        throw new ServiceUnavailableException('管理员登录尚未配置');
      }
      if (message === 'RATE_LIMITED') {
        throw new HttpException('登录尝试过多，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
      }
      await this.loginThrottle.fail(key, 5, 15 * 60 * 1000);
      throw new UnauthorizedException('账号、密码或验证码错误');
    }
  }

  @Post('auth/logout')
  logout(@Req() req: FastifyRequest) {
    this.store.adminLogout(adminTokenFrom(req));
    return ok({ loggedOut: true });
  }

  @Get('dashboard')
  dashboard(@Req() req: FastifyRequest) {
    this.assertAdmin(req);
    return ok(this.store.adminStats());
  }

  @Get('moderation/queue')
  queue(@Req() req: FastifyRequest, @Query('risk') risk?: string) {
    this.assertAdmin(req);
    const safeRisk = risk === undefined || risk === '' ? undefined : assertEnum(risk, ['P0', 'P1', 'P2', 'P3'] as const, '风险等级');
    return ok(this.store.adminQueue(safeRisk));
  }

  @Post('moderation/:caseId/decision')
  decision(@Req() req: FastifyRequest, @Param('caseId') caseId: string, @Body() body: any) {
    this.assertAdmin(req);
    assertId(caseId, '审核记录');
    const decision = assertEnum(body?.decision, ['approved', 'rejected'] as const, '审核结论');
    const reason = optionalText(body?.reason, 500, '审核说明');
    if (decision === 'rejected' && !reason) {
      throw new BadRequestException('拒绝必须填写说明');
    }
    const result = this.store.decideCase(caseId, decision, reason);
    if (!result) throw new BadRequestException('审核记录不存在');
    return ok(result);
  }

  @Get('official-accounts')
  officialAccounts(@Req() req: FastifyRequest) {
    this.assertAdmin(req);
    return ok(this.store.getOfficialAccounts());
  }

  @Post('official-accounts/:accountId/review')
  reviewOfficial(@Req() req: FastifyRequest, @Param('accountId') accountId: string, @Body() body: any) {
    this.assertAdmin(req);
    assertId(accountId, '官方账号');
    const status = assertEnum(body?.status, ['pending_school', 'pending_platform', 'active', 'suspended'] as const, '账号状态');
    const result = this.store.reviewOfficialAccount(accountId, status);
    if (!result) throw new BadRequestException('官方账号不存在');
    return ok(result);
  }

  @Get('notices')
  notices(@Req() req: FastifyRequest) {
    this.assertAdmin(req);
    return ok(this.store.getAdminNotices());
  }

  @Post('notices')
  createNotice(@Req() req: FastifyRequest, @Body() body: any) {
    this.assertAdmin(req);
    const title = requireText(body?.title, 80, '通知标题');
    const noticeBody = requireText(body?.body, 1000, '通知正文');
    const type = assertEnum(body?.type, ['normal', 'emergency'] as const, '通知类型');
    const source = requireText(body?.source, 30, '通知来源');
    const effectiveTo = requireText(body?.effectiveTo, 40, '有效期');
    if (Number.isNaN(new Date(effectiveTo).getTime())) throw new BadRequestException('有效期格式不正确');
    return ok(this.store.createNotice({ title, body: noticeBody, type, source, effectiveTo: new Date(effectiveTo).toISOString() }));
  }

  @Get('reports')
  reports(@Req() req: FastifyRequest) {
    this.assertAdmin(req);
    return ok(this.store.getReports());
  }

  @Post('reports/:reportId/decision')
  resolveReport(@Req() req: FastifyRequest, @Param('reportId') reportId: string, @Body() body: any) {
    this.assertAdmin(req);
    assertId(reportId, '举报记录');
    const status = assertEnum(body?.status, ['resolved', 'rejected'] as const, '处理结果');
    const result = this.store.resolveReport(reportId, status);
    if (!result) throw new BadRequestException('举报记录不存在');
    return ok(result);
  }

  @Get('ranking/config')
  ranking(@Req() req: FastifyRequest) {
    this.assertAdmin(req);
    return ok(this.store.getRankingConfig());
  }

  @Put('ranking/config')
  updateRanking(@Req() req: FastifyRequest, @Body() body: any) {
    this.assertAdmin(req);
    const numericKeys = [
      'likeWeight', 'commentWeight', 'favoriteWeight', 'viewWeight',
      'coldStart', 'coldDecayHours', 'timeOffsetHours', 'timeExponent',
      'windowDays', 'snapshotSize', 'maxPerAuthorTop20'
    ] as const;
    const patch: Record<string, number> = {};
    for (const key of numericKeys) {
      if (body?.[key] === undefined) continue;
      const value = Number(body[key]);
      if (!Number.isFinite(value) || value < 0 || value > 10000) throw new BadRequestException(`${key}超出允许范围`);
      patch[key] = value;
    }
    return ok(this.store.updateRankingConfig(patch));
  }

  private assertAdmin(req: FastifyRequest) {
    if (!this.store.isAdmin(adminTokenFrom(req))) throw new UnauthorizedException('请先登录管理后台');
  }
}
