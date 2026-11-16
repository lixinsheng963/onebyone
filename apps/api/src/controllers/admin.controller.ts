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
      await this.audit(req, 'admin.login');
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
  async logout(@Req() req: FastifyRequest) {
    this.store.adminLogout(adminTokenFrom(req));
    await this.audit(req, 'admin.logout');
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
  async decision(@Req() req: FastifyRequest, @Param('caseId') caseId: string, @Body() body: any) {
    this.assertAdmin(req);
    assertId(caseId, '审核记录');
    const decision = assertEnum(body?.decision, ['approved', 'rejected'] as const, '审核结论');
    const reason = optionalText(body?.reason, 500, '审核说明');
    if (decision === 'rejected' && !reason) {
      throw new BadRequestException('拒绝必须填写说明');
    }
    const before = this.snapshot(this.store.adminQueue().find((item) => item.id === caseId));
    const result = this.store.decideCase(caseId, decision, reason);
    if (!result) throw new BadRequestException('审核记录不存在');
    await this.audit(req, 'moderation.decision', 'moderation_case', caseId, before, result);
    return ok(result);
  }

  @Get('official-accounts')
  officialAccounts(@Req() req: FastifyRequest) {
    this.assertAdmin(req);
    return ok(this.store.getOfficialAccounts());
  }

  @Post('official-accounts/:accountId/review')
  async reviewOfficial(@Req() req: FastifyRequest, @Param('accountId') accountId: string, @Body() body: any) {
    this.assertAdmin(req);
    assertId(accountId, '官方账号');
    const status = assertEnum(body?.status, ['pending_school', 'pending_platform', 'active', 'suspended'] as const, '账号状态');
    const before = this.snapshot(this.store.getOfficialAccounts().find((item) => item.id === accountId));
    const result = this.store.reviewOfficialAccount(accountId, status);
    if (!result) throw new BadRequestException('官方账号不存在');
    await this.audit(req, 'official.review', 'official_account', accountId, before, result);
    return ok(result);
  }

  @Get('notices')
  notices(@Req() req: FastifyRequest) {
    this.assertAdmin(req);
    return ok(this.store.getAdminNotices());
  }

  @Post('notices')
  async createNotice(@Req() req: FastifyRequest, @Body() body: any) {
    this.assertAdmin(req);
    const title = requireText(body?.title, 80, '通知标题');
    const noticeBody = requireText(body?.body, 1000, '通知正文');
    const type = assertEnum(body?.type, ['normal', 'emergency'] as const, '通知类型');
    const source = requireText(body?.source, 30, '通知来源');
    const effectiveTo = requireText(body?.effectiveTo, 40, '有效期');
    if (Number.isNaN(new Date(effectiveTo).getTime())) throw new BadRequestException('有效期格式不正确');
    const result = this.store.createNotice({ title, body: noticeBody, type, source, effectiveTo: new Date(effectiveTo).toISOString() });
    await this.audit(req, 'notice.create', 'notice', result.id, null, result);
    return ok(result);
  }

  @Get('invite-codes')
  async inviteCodes(@Req() req: FastifyRequest) {
    this.assertAdmin(req);
    return ok(await this.store.listInviteCodes());
  }

  @Post('invite-codes')
  async createInviteCode(@Req() req: FastifyRequest, @Body() body: any) {
    this.assertAdmin(req);
    const name = optionalText(body?.name, 64, '邀请码名称');
    const code = optionalText(body?.code, 32, '邀请码')?.trim().toUpperCase();
    if (code && !/^[A-Z0-9-]{4,32}$/.test(code)) throw new BadRequestException('邀请码只能包含字母、数字和短横线，长度4-32');
    const maxUses = body?.maxUses === undefined ? 1 : Number(body.maxUses);
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100) throw new BadRequestException('邀请码可用次数必须为1-100');
    const expiresText = optionalText(body?.expiresAt, 40, '邀请码有效期');
    if (expiresText && Number.isNaN(new Date(expiresText).getTime())) throw new BadRequestException('邀请码有效期格式不正确');
    if (expiresText && new Date(expiresText).getTime() <= Date.now()) throw new BadRequestException('邀请码有效期必须晚于当前时间');
    try {
      const result = await this.store.createInviteCode({ name, code, maxUses, expiresAt: expiresText });
      await this.audit(req, 'invite_code.create', 'invite_code', String(result.id), null, {
        id: result.id,
        code: result.code,
        name: result.name,
        maxUses: result.maxUses,
        expiresAt: result.expiresAt
      });
      return ok(result);
    } catch (error) {
      if ((error as Error).message === 'INVITE_CODE_EXISTS') throw new BadRequestException('邀请码已存在（含已吊销/已过期邀请码）');
      throw error;
    }
  }

  @Post('invite-codes/:inviteId/revoke')
  async revokeInviteCode(@Req() req: FastifyRequest, @Param('inviteId') inviteId: string) {
    this.assertAdmin(req);
    assertId(inviteId, '邀请码');
    const changed = await this.store.revokeInviteCode(Number(inviteId));
    if (!changed) throw new BadRequestException('邀请码不存在或已失效');
    await this.audit(req, 'invite_code.revoke', 'invite_code', inviteId, null, { status: 'revoked' });
    return ok({ id: Number(inviteId), status: 'revoked' });
  }

  @Get('reports')
  reports(@Req() req: FastifyRequest) {
    this.assertAdmin(req);
    return ok(this.store.getAdminReports());
  }

  @Get('reports/:reportId')
  reportDetail(@Req() req: FastifyRequest, @Param('reportId') reportId: string) {
    this.assertAdmin(req);
    assertId(reportId, '举报记录');
    const report = this.store.getAdminReport(reportId);
    if (!report) throw new BadRequestException('举报记录不存在');
    return ok(report);
  }

  @Post('reports/:reportId/decision')
  async resolveReport(@Req() req: FastifyRequest, @Param('reportId') reportId: string, @Body() body: any) {
    this.assertAdmin(req);
    assertId(reportId, '举报记录');
    const status = assertEnum(body?.status, ['resolved', 'rejected'] as const, '处理结果');
    const before = this.snapshot(this.store.getAdminReport(reportId));
    const result = this.store.resolveReport(reportId, status);
    if (!result) throw new BadRequestException('举报记录不存在');
    const after = this.store.getAdminReport(reportId);
    await this.audit(req, 'report.decision', 'report', reportId, before, after);
    return ok(after);
  }

  @Get('ranking/config')
  ranking(@Req() req: FastifyRequest) {
    this.assertAdmin(req);
    return ok(this.store.getRankingConfig());
  }

  @Put('ranking/config')
  async updateRanking(@Req() req: FastifyRequest, @Body() body: any) {
    this.assertAdmin(req);
    const before = this.snapshot(this.store.getRankingConfig());
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
    const result = this.store.updateRankingConfig(patch);
    await this.audit(req, 'ranking.update', 'ranking_config', '1', before, result);
    return ok(result);
  }

  @Get('audit-logs')
  async auditLogs(@Req() req: FastifyRequest, @Query('limit') limit?: string) {
    this.assertAdmin(req);
    return ok(await this.store.listAuditLogs(Number(limit) || 100));
  }

  private snapshot<T>(value: T): T {
    if (value === undefined || value === null) return value;
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private audit(
    req: FastifyRequest,
    action: string,
    targetType?: string,
    targetId?: string,
    before?: unknown,
    after?: unknown
  ): Promise<void> {
    const requestId = String((req as FastifyRequest & { id?: string }).id || req.headers['x-request-id'] || '');
    return this.store.recordAudit({
      action,
      targetType,
      targetId,
      before,
      after,
      requestId,
      ip: req.ip
    });
  }

  private assertAdmin(req: FastifyRequest) {
    if (!this.store.isAdmin(adminTokenFrom(req))) throw new UnauthorizedException('请先登录管理后台');
  }
}
