import { Injectable } from '@nestjs/common';

interface Code2SessionResponse {
  openid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
}

@Injectable()
export class WechatAuthService {
  async code2Session(code: string): Promise<{ openid: string }> {
    const appid = process.env.WX_APPID || '';
    const secret = process.env.WX_SECRET || '';
    if (!appid || !secret) throw new Error('WECHAT_LOGIN_NOT_CONFIGURED');
    const params = new URLSearchParams({
      appid,
      secret,
      js_code: code,
      grant_type: 'authorization_code'
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${params.toString()}`, {
        signal: controller.signal
      });
      if (!response.ok) throw new Error('WECHAT_LOGIN_UPSTREAM');
      const payload = (await response.json()) as Code2SessionResponse;
      if (payload.errcode || !payload.openid) throw new Error('WECHAT_LOGIN_FAILED');
      return { openid: payload.openid };
    } finally {
      clearTimeout(timer);
    }
  }
}
