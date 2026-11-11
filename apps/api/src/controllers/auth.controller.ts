import { Body, Controller, Get, HttpException, HttpStatus, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ok, requireText, tokenFrom } from '../common';
import { LoginThrottleService } from '../core/login-throttle.service';
import { StoreService } from '../core/store.service';
import { WechatAuthService } from '../core/wechat-auth.service';

@Controller()
export class AuthController {
  constructor(
    private readonly store: StoreService,
    private readonly wechatAuth: WechatAuthService,
    private readonly loginThrottle: LoginThrottleService
  ) {}

  @Post('auth/wechat/login')
  async login(@Body() body: { code?: string }, @Req() req: FastifyRequest) {
    const key = `user:${req.ip}`;
    try {
      await this.loginThrottle.check(key, 20, 10 * 60 * 1000);
    } catch {
      throw new HttpException('登录尝试过多，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = requireText(body?.code, 256, 'code');
    const requireWechat = process.env.WECHAT_LOGIN === 'true'
      || (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_LOGIN !== 'true');
    if (requireWechat) {
      try {
        const session = await this.wechatAuth.code2Session(code);
        await this.loginThrottle.success(key);
        return ok(this.store.loginWithOpenId(session.openid));
      } catch {
        await this.loginThrottle.fail(key, 20, 10 * 60 * 1000);
        throw new UnauthorizedException('微信登录失败，请稍后重试');
      }
    }
    if (process.env.ALLOW_DEMO_LOGIN === 'false') {
      throw new UnauthorizedException('演示登录已关闭');
    }
    await this.loginThrottle.success(key);
    return ok(this.store.login(code));
  }

  @Post('auth/logout')
  logout(@Req() req: FastifyRequest) {
    this.store.logout(tokenFrom(req));
    return ok({ loggedOut: true });
  }

  @Post('auth/invite/redeem')
  async redeem(@Body() body: { code?: string }, @Req() req: FastifyRequest) {
    const token = tokenFrom(req);
    if (!this.store.getUserByToken(token)) throw new UnauthorizedException('请先登录');
    const key = `invite:${req.ip}`;
    try {
      await this.loginThrottle.check(key, 10, 10 * 60 * 1000);
    } catch {
      throw new HttpException('尝试次数过多，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = requireText(body?.code, 64, '邀请码');
    const result = this.store.redeemInvite(code, token);
    if (!result.ok) await this.loginThrottle.fail(key, 10, 10 * 60 * 1000);
    else await this.loginThrottle.success(key);
    return ok(result);
  }

  @Get('me')
  me(@Req() req: FastifyRequest) {
    const user = this.store.getMe(tokenFrom(req));
    if (!user) throw new UnauthorizedException('请先登录');
    return ok(user);
  }
}
