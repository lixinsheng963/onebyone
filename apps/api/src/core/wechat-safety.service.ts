import { Injectable } from '@nestjs/common';
import type { ModerationResult } from './moderation';

@Injectable()
export class WechatSafetyService {
  private token = '';
  private tokenExpiresAt = 0;

  async scanText(text: string, openid?: string): Promise<ModerationResult | null> {
    const appid = process.env.WX_APPID;
    const secret = process.env.WX_SECRET;
    if (!appid || !secret || !text.trim()) return null;

    try {
      const accessToken = await this.getAccessToken(appid, secret);
      if (!accessToken) return null;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${accessToken}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          content: text.slice(0, 2500),
          version: 2,
          scene: 3,
          openid
        })
      });
      clearTimeout(timeout);
      if (!response.ok) return null;
      const payload = (await response.json()) as any;
      if (payload?.errcode !== 0) return null;
      const suggest = payload?.result?.suggest;
      if (suggest === 'pass') {
        return { risk: 'P3', labels: [], evidence: [], reason: '微信内容安全通过', needsHuman: false };
      }
      return {
        risk: suggest === 'risky' ? 'P1' : 'P2',
        labels: ['campus_safety'],
        evidence: payload?.result?.label ? [`label:${payload.result.label}`] : [],
        reason: suggest === 'risky' ? '微信内容安全判定为高风险' : '微信内容安全建议人工复核',
        needsHuman: true
      };
    } catch {
      return null;
    }
  }

  private async getAccessToken(appid: string, secret: string): Promise<string | null> {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
    try {
      const response = await fetch(
        `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`
      );
      if (!response.ok) return null;
      const payload = (await response.json()) as any;
      if (!payload?.access_token) return null;
      this.token = payload.access_token;
      this.tokenExpiresAt = Date.now() + Math.max(60, Number(payload.expires_in || 7200) - 200) * 1000;
      return this.token;
    } catch {
      return null;
    }
  }
}
