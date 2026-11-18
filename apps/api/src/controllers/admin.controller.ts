import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { adminTokenFrom, assertEnum, assertId, ok, optionalText, requireText } from '../common';
import { AuthorizationService } from '../core/authorization.service';
import { LoginThrottleService } from '../core/login-throttle.service';
import { StoreService } from '../core/store.service';
import type { AdminIdentity, AdminRole } from '../types';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly store: StoreService,
    private readonly loginThrottle: LoginThrottleService,
    private readonly authorizations: AuthorizationService
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
      const identity = this.store.getAdminIdentity(result.token);
      await this.audit(req, 'admin.login', undefined, undefined, undefined, undefined, identity);
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
    const identity = this.store.getAdminIdentity(adminTokenFrom(req));
    this.store.adminLogout(adminTokenFrom(req));
    await this.audit(req, 'admin.logout', undefined, undefined, undefined, undefined, identity);
    return ok({ loggedOut: true });
  }

  @Get('me')
  me(@Req() req: FastifyRequest) {
    return ok(this.requireAdmin(req));
  }

  @Get('dashboard')
  dashboard(@Req() req: FastifyRequest) {
    this.requireAdmin(req);
    return ok(this.store.adminStats());
  }

  @Get('users')
  users(@Req() req: FastifyRequest) {
    this.requireAdmin(req, ['platform_admin', 'content_reviewer']);
    return ok(this.store.listAdminUsers());
  }

  @Post('users/:userId/status')
  async updateUserStatus(@Req() req: FastifyRequest, @Param('userId') userId: string, @Body() body: any) {
    const identity = this.requireAdmin(req, ['platform_admin']);
    assertId(userId, '用户');
    const status = assertEnum(body?.status, ['active', 'muted', 'banned', 'deleted'] as const, '账号状态');
    const reason = optionalText(body?.reason, 255, '处理说明');
    let mutedUntil: string | undefined;
    if (status === 'muted') {
      mutedUntil = this.futureDate(body?.mutedUntil, '禁言截止时间');
    }
    const before = this.store.listAdminUsers().find((item) => item.id === userId);
    if (!before) throw new BadRequestException('用户不存在');
    const result = this.store.setUserStatus(userId, status, { mutedUntil, reason });
    await this.audit(req, 'user.status', 'user', userId, before, result, identity);
    return ok(result);
  }

  @Get('moderation/queue')
  queue(@Req() req: FastifyRequest, @Query('risk') risk?: string) {
    this.requireAdmin(req, ['platform_admin', 'content_reviewer']);
    const safeRisk = risk === undefined || risk === '' ? undefined : assertEnum(risk, ['P0', 'P1', 'P2', 'P3'] as const, '风险等级');
    return ok(this.store.adminQueue(safeRisk));
  }

  @Post('moderation/:caseId/decision')
  async decision(@Req() req: FastifyRequest, @Param('caseId') caseId: string, @Body() body: any) {
    const identity = this.requireAdmin(req, ['platform_admin', 'content_reviewer']);
    assertId(caseId, '审核记录');
    const decision = assertEnum(body?.decision, ['approved', 'rejected'] as const, '审核结论');
    const reason = optionalText(body?.reason, 500, '审核说明');
    if (decision === 'rejected' && !reason) {
      throw new BadRequestException('拒绝必须填写说明');
    }
    const before = this.snapshot(this.store.adminQueue().find((item) => item.id === caseId));
    let result;
    try {
      result = this.store.decideCase(caseId, decision, reason, {
        id: String(identity.id),
        name: identity.displayName || identity.email,
        role: identity.role
      });
    } catch (error) {
      const message = (error as Error).message;
      if (message === 'CASE_CLOSED') throw new BadRequestException('该审核记录已处理');
      throw error;
    }
    if (!result) throw new BadRequestException('审核记录不存在');
    await this.audit(req, 'moderation.decision', 'moderation_case', caseId, before, result, identity);
    return ok(result);
  }

  @Get('official-accounts')
  officialAccounts(@Req() req: FastifyRequest) {
    this.requireAdmin(req, ['platform_admin', 'school_reviewer']);
    return ok(this.store.getOfficialAccounts());
  }

  @Post('official-accounts')
  async createOfficialAccount(@Req() req: FastifyRequest, @Body() body: any) {
    const identity = this.requireAdmin(req, ['platform_admin']);
    const orgName = requireText(body?.orgName, 80, '组织名称');
    const orgId = optionalText(body?.orgId, 64, '组织标识');
    const scope = this.assertOfficialScope(body?.scope);
    const expiresAt = this.futureDate(body?.expiresAt, '授权有效期');
    const result = this.store.createOfficialAccount({ orgName, orgId, scope, expiresAt });
    await this.audit(req, 'official.create', 'official_account', result.id, null, result, identity);
    return ok(result);
  }

  @Put('official-accounts/:accountId')
  async updateOfficialAccount(@Req() req: FastifyRequest, @Param('accountId') accountId: string, @Body() body: any) {
    const identity = this.requireAdmin(req, ['platform_admin']);
    assertId(accountId, '官方账号');
    const target = this.store.getOfficialAccount(accountId);
    if (!target) throw new BadRequestException('官方账号不存在');
    const before = this.snapshot(target);
    const patch: { orgName?: string; orgId?: string; scope?: string[]; expiresAt?: string } = {};
    if (body?.orgName !== undefined) patch.orgName = requireText(body.orgName, 80, '组织名称');
    if (body?.orgId !== undefined) patch.orgId = optionalText(body.orgId, 64, '组织标识');
    if (body?.scope !== undefined) patch.scope = this.assertOfficialScope(body.scope);
    if (body?.expiresAt !== undefined) patch.expiresAt = this.futureDate(body.expiresAt, '授权有效期');
    const result = this.store.updateOfficialAccount(accountId, patch);
    if (!result) throw new BadRequestException('官方账号不存在');
    await this.audit(req, 'official.update', 'official_account', accountId, before, result, identity);
    return ok(result);
  }

  @Post('official-accounts/:accountId/authorization')
  async uploadOfficialAuthorization(@Req() req: FastifyRequest, @Param('accountId') accountId: string) {
    const identity = this.requireAdmin(req, ['platform_admin', 'school_reviewer']);
    assertId(accountId, '官方账号');
    const target = this.store.getOfficialAccount(accountId);
    if (!target) throw new BadRequestException('官方账号不存在');
    if (identity.role === 'school_reviewer' && identity.orgId && target.orgId && identity.orgId !== target.orgId) {
      throw new ForbiddenException('只能为本人负责的学校组织上传授权文件');
    }
    const file = await (req as any).file();
    if (!file) throw new BadRequestException('缺少授权文件');
    try {
      const buffer = await file.toBuffer();
      const saved = this.authorizations.save(buffer, file.mimetype, file.filename || 'authorization');
      const before = this.snapshot(target);
      const result = this.store.attachOfficialAuthorization(accountId, saved);
      if (!result) throw new BadRequestException('官方账号不存在');
      this.authorizations.remove(before.authorizationFile);
      await this.audit(req, 'official.authorization.upload', 'official_account', accountId, before, result, identity);
      return ok({
        id: result.id,
        authorizationFile: result.authorizationFile,
        authorizationFileName: result.authorizationFileName,
        authorizationSize: result.authorizationSize
      });
    } catch (error) {
      const message = (error as Error).message;
      if (message === 'UNSUPPORTED_AUTH_TYPE') throw new BadRequestException('授权文件只支持 PDF/JPG/PNG');
      if (message === 'AUTH_TOO_LARGE') throw new BadRequestException('授权文件不能超过 8MB');
      if (message === 'INVALID_AUTH_FILE') throw new BadRequestException('授权文件内容与类型不符');
      throw error;
    }
  }

  @Get('official-accounts/:accountId/authorization')
  async downloadOfficialAuthorization(
    @Req() req: FastifyRequest,
    @Param('accountId') accountId: string,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const identity = this.requireAdmin(req, ['platform_admin', 'school_reviewer']);
    assertId(accountId, '官方账号');
    const target = this.store.getOfficialAccount(accountId);
    if (!target) throw new BadRequestException('官方账号不存在');
    if (identity.role === 'school_reviewer' && identity.orgId && target.orgId && identity.orgId !== target.orgId) {
      throw new ForbiddenException('无权查看该授权文件');
    }
    try {
      const buffer = this.authorizations.read(target.authorizationFile);
      const fileName = encodeURIComponent(target.authorizationFileName || 'authorization');
      reply.header('content-type', target.authorizationMime || 'application/octet-stream');
      reply.header('content-disposition', `inline; filename*=UTF-8''${fileName}`);
      reply.header('cache-control', 'private, no-store');
      return reply.send(buffer);
    } catch {
      throw new BadRequestException('授权文件不存在');
    }
  }

  @Post('official-accounts/:accountId/operator')
  async bindOfficialOperator(@Req() req: FastifyRequest, @Param('accountId') accountId: string, @Body() body: any) {
    const identity = this.requireAdmin(req, ['platform_admin']);
    assertId(accountId, '官方账号');
    const target = this.store.getOfficialAccount(accountId);
    if (!target) throw new BadRequestException('官方账号不存在');
    const userPublicId = requireText(body?.userId, 96, '运营者用户 ID');
    const before = this.snapshot(target);
    try {
      const result = this.store.bindOfficialOperator(accountId, userPublicId);
      await this.audit(req, 'official.operator.bind', 'official_account', accountId, before, result, identity);
      return ok(result);
    } catch (error) {
      const message = (error as Error).message;
      if (message === 'OFFICIAL_OPERATOR_NOT_FOUND') throw new BadRequestException('找不到该用户，请确认用户 ID');
      if (message === 'OFFICIAL_OPERATOR_PLACEHOLDER') throw new BadRequestException('不能绑定系统占位账号，请选择真实微信用户');
      if (message === 'OFFICIAL_OPERATOR_DISABLED') throw new BadRequestException('该用户已被封禁或注销，不能绑定');
      if (message === 'OFFICIAL_OPERATOR_MUTED') throw new BadRequestException('该用户处于禁言状态，不能绑定');
      if (message === 'OFFICIAL_OPERATOR_ALREADY_BOUND') throw new BadRequestException('该用户已绑定其他官方账号');
      throw error;
    }
  }

  @Post('official-accounts/:accountId/review')
  async reviewOfficial(@Req() req: FastifyRequest, @Param('accountId') accountId: string, @Body() body: any) {
    const identity = this.requireAdmin(req, ['platform_admin', 'school_reviewer']);
    assertId(accountId, '官方账号');
    const status = assertEnum(body?.status, ['pending_school', 'pending_platform', 'active', 'suspended', 'expired'] as const, '账号状态');
    const target = this.store.getOfficialAccount(accountId);
    if (!target) throw new BadRequestException('官方账号不存在');
    if (!target.authorizationFile) throw new BadRequestException('请先上传学校授权文件');
    if (identity.role === 'school_reviewer') {
      if (status !== 'pending_platform') throw new ForbiddenException('学校审核人只能提交平台复核');
      if (target.status !== 'pending_school') throw new BadRequestException('该账号当前不处于学校初审阶段');
      if (identity.orgId && target.orgId && identity.orgId === target.orgId) {
        throw new ForbiddenException('学校审核人不能审核本人所在组织');
      }
    } else {
      if (status !== 'active' && status !== 'suspended') {
        throw new BadRequestException('平台审核只能通过或暂停官方账号');
      }
      if (status === 'active' && target.status !== 'pending_platform' && target.status !== 'suspended') {
        throw new BadRequestException('官方账号须先通过学校初审，才能由平台复核生效');
      }
      if (status === 'active' && !this.store.isOfficialOperatorBound(accountId)) {
        throw new BadRequestException('请先绑定官方账号运营者，再复核生效');
      }
      if (status === 'active' && target.expiresAt && new Date(target.expiresAt).getTime() <= Date.now()) {
        throw new BadRequestException('授权已过期，请先更新有效期');
      }
    }
    const before = this.snapshot(target);
    const result = this.store.reviewOfficialAccount(accountId, status, identity);
    if (!result) throw new BadRequestException('官方账号不存在');
    await this.audit(req, 'official.review', 'official_account', accountId, before, result, identity);
    return ok(result);
  }

  @Get('notices')
  notices(@Req() req: FastifyRequest) {
    this.requireAdmin(req, ['platform_admin', 'school_reviewer']);
    return ok(this.store.getAdminNotices());
  }

  @Post('notices')
  async createNotice(@Req() req: FastifyRequest, @Body() body: any) {
    this.requireAdmin(req, ['platform_admin', 'school_reviewer']);
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
    this.requireAdmin(req, ['platform_admin']);
    return ok(await this.store.listInviteCodes());
  }

  @Post('invite-codes')
  async createInviteCode(@Req() req: FastifyRequest, @Body() body: any) {
    this.requireAdmin(req, ['platform_admin']);
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
    this.requireAdmin(req, ['platform_admin']);
    assertId(inviteId, '邀请码');
    const changed = await this.store.revokeInviteCode(Number(inviteId));
    if (!changed) throw new BadRequestException('邀请码不存在或已失效');
    await this.audit(req, 'invite_code.revoke', 'invite_code', inviteId, null, { status: 'revoked' });
    return ok({ id: Number(inviteId), status: 'revoked' });
  }

  @Get('reports')
  reports(@Req() req: FastifyRequest) {
    this.requireAdmin(req, ['platform_admin', 'content_reviewer']);
    return ok(this.store.getAdminReports());
  }

  @Get('reports/:reportId')
  reportDetail(@Req() req: FastifyRequest, @Param('reportId') reportId: string) {
    this.requireAdmin(req, ['platform_admin', 'content_reviewer']);
    assertId(reportId, '举报记录');
    const report = this.store.getAdminReport(reportId);
    if (!report) throw new BadRequestException('举报记录不存在');
    return ok(report);
  }

  @Post('reports/:reportId/decision')
  async resolveReport(@Req() req: FastifyRequest, @Param('reportId') reportId: string, @Body() body: any) {
    const identity = this.requireAdmin(req, ['platform_admin', 'content_reviewer']);
    assertId(reportId, '举报记录');
    const status = assertEnum(body?.status, ['resolved', 'rejected'] as const, '处理结果');
    const before = this.snapshot(this.store.getAdminReport(reportId));
    const result = this.store.resolveReport(reportId, status, { handledById: String(identity.id) });
    if (!result) throw new BadRequestException('举报记录不存在');
    const after = this.store.getAdminReport(reportId);
    await this.audit(req, 'report.decision', 'report', reportId, before, after);
    return ok(after);
  }

  @Get('ranking/config')
  ranking(@Req() req: FastifyRequest) {
    this.requireAdmin(req, ['platform_admin']);
    return ok(this.store.getRankingConfig());
  }

  @Put('ranking/config')
  async updateRanking(@Req() req: FastifyRequest, @Body() body: any) {
    this.requireAdmin(req, ['platform_admin']);
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

  @Get('appeals')
  appeals(@Req() req: FastifyRequest) {
    this.requireAdmin(req, ['platform_admin', 'content_reviewer']);
    return ok(this.store.getAdminAppeals());
  }

  @Post('appeals/:appealId/decision')
  async resolveAppeal(@Req() req: FastifyRequest, @Param('appealId') appealId: string, @Body() body: any) {
    const identity = this.requireAdmin(req, ['platform_admin', 'content_reviewer']);
    assertId(appealId, '申诉记录');
    const status = assertEnum(body?.status, ['approved', 'rejected'] as const, '申诉处理结果');
    const reason = optionalText(body?.reason, 255, '处理说明');
    const before = this.store.getAdminAppeals().find((item) => item.id === appealId);
    if (!before) throw new BadRequestException('申诉记录不存在');
    let result;
    try {
      result = this.store.resolveAppeal(appealId, status, {
        reason,
        handledBy: identity.displayName || identity.email,
        reviewerId: String(identity.id)
      });
    } catch (error) {
      if ((error as Error).message === 'APPEAL_CLOSED') throw new BadRequestException('该申诉已处理');
      if ((error as Error).message === 'APPEAL_SELF_REVIEW') throw new ForbiddenException('原审核人不能复核自己的处理');
      throw error;
    }
    if (!result) throw new BadRequestException('申诉记录不存在');
    await this.audit(req, 'appeal.decision', 'appeal', appealId, before, result, identity);
    return ok(this.store.getAdminAppeals().find((item) => item.id === appealId));
  }

  @Get('audit-logs')
  async auditLogs(@Req() req: FastifyRequest, @Query('limit') limit?: string) {
    this.requireAdmin(req, ['platform_admin']);
    return ok(await this.store.listAuditLogs(Number(limit) || 100));
  }

  @Get('operators')
  async operators(@Req() req: FastifyRequest) {
    this.requireAdmin(req, ['platform_admin']);
    return ok(await this.store.listAdminOperators());
  }

  @Get('school-reviewers')
  async schoolReviewers(@Req() req: FastifyRequest) {
    this.requireAdmin(req, ['platform_admin']);
    const operators = await this.store.listAdminOperators();
    return ok(operators.filter((item) => item.role === 'school_reviewer'));
  }

  @Post('operators')
  async createOperator(@Req() req: FastifyRequest, @Body() body: any) {
    const identity = this.requireAdmin(req, ['platform_admin']);
    const email = requireText(body?.email, 120, '邮箱').trim().toLowerCase();
    const password = requireText(body?.password, 200, '密码');
    const displayName = optionalText(body?.displayName, 64, '显示名称');
    const role = assertEnum(body?.role, ['school_reviewer', 'content_reviewer'] as const, '操作员角色');
    const schoolId = optionalText(body?.schoolId, 64, '学校');
    const orgId = optionalText(body?.orgId, 64, '机构');
    if (role === 'school_reviewer' && (!schoolId || !orgId)) {
      throw new BadRequestException('学校审核人必须指定学校和机构');
    }
    try {
      const result = await this.store.createAdminOperator({
        email,
        password,
        displayName,
        role,
        schoolId,
        orgId,
        authorizedBy: identity.id
      });
      await this.audit(req, 'admin.operator.create', 'admin_user', String(result.id), null, result, identity);
      return ok(result);
    } catch (error) {
      const message = (error as Error).message;
      if (message === 'ADMIN_EMAIL_EXISTS' || message === 'ADMIN_EMAIL_INVALID'
        || message === 'ADMIN_PASSWORD_TOO_SHORT' || message === 'SCHOOL_REVIEWER_SCOPE_REQUIRED') {
        throw new BadRequestException(message === 'ADMIN_EMAIL_EXISTS' ? '该邮箱已存在' : '操作员信息不合法');
      }
      throw error;
    }
  }

  @Post('operators/:adminId/revoke')
  async revokeOperator(@Req() req: FastifyRequest, @Param('adminId') adminId: string) {
    const identity = this.requireAdmin(req, ['platform_admin']);
    assertId(adminId, '操作员');
    const targetId = Number(adminId);
    if (targetId === identity.id) throw new BadRequestException('不能吊销当前登录账号');
    try {
      const result = await this.store.revokeAdminOperator(targetId);
      await this.audit(req, 'admin.operator.revoke', 'admin_user', adminId, null, result, identity);
      return ok(result);
    } catch (error) {
      if ((error as Error).message === 'ADMIN_NOT_FOUND') throw new BadRequestException('操作员不存在');
      if ((error as Error).message === 'ADMIN_CANNOT_REVOKE_PLATFORM') throw new BadRequestException('不能吊销平台管理员');
      throw error;
    }
  }

  private assertOfficialScope(value: unknown): string[] {
    const allowed = ['notice', 'emergency', 'emblem'];
    if (!Array.isArray(value) || !value.length || value.length > allowed.length) {
      throw new BadRequestException('授权范围不合法');
    }
    const scope = value.map((item) => String(item));
    if (scope.some((item) => !allowed.includes(item))) throw new BadRequestException('授权范围不合法');
    return [...new Set(scope)];
  }

  private futureDate(value: unknown, label: string): string {
    const text = requireText(value, 40, label);
    const time = new Date(text).getTime();
    if (Number.isNaN(time) || time <= Date.now()) throw new BadRequestException(`${label}必须晚于当前时间`);
    return new Date(time).toISOString();
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
    after?: unknown,
    identity?: AdminIdentity
  ): Promise<void> {
    const requestId = String((req as FastifyRequest & { id?: string }).id || req.headers['x-request-id'] || '');
    const actor = identity || this.store.getAdminIdentity(adminTokenFrom(req));
    return this.store.recordAudit({
      action,
      targetType,
      targetId,
      before,
      after,
      requestId,
      ip: req.ip,
      actorId: actor?.id,
      actorRole: actor?.role
    });
  }

  private requireAdmin(req: FastifyRequest, roles?: AdminRole[]): AdminIdentity {
    const identity = this.store.getAdminIdentity(adminTokenFrom(req));
    if (!identity) throw new UnauthorizedException('请先登录管理后台');
    if (roles && !roles.includes(identity.role)) {
      throw new ForbiddenException('当前角色无权访问该功能');
    }
    return identity;
  }
}
