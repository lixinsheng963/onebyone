import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

interface Attempt {
  count: number;
  resetAt: number;
}

@Injectable()
export class LoginThrottleService {
  private readonly attempts = new Map<string, Attempt>();

  constructor(private readonly redis: RedisService) {}

  async check(key: string, max: number, windowMs: number): Promise<void> {
    if (this.redis.available) {
      const raw = await this.redis.get(`throttle:${key}`);
      if (Number(raw || 0) >= max) throw new Error('RATE_LIMITED');
    }
    const item = this.attempts.get(key);
    if (!item || item.resetAt <= Date.now()) return;
    if (item.count >= max) throw new Error('RATE_LIMITED');
  }

  async fail(key: string, max: number, windowMs: number): Promise<void> {
    if (this.redis.available) {
      const count = await this.redis.incrementWindow(`throttle:${key}`, windowMs);
      if (count !== null) return;
    }
    const now = Date.now();
    const item = this.attempts.get(key);
    if (!item || item.resetAt <= now) {
      this.attempts.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    item.count = Math.min(item.count + 1, max);
  }

  async success(key: string): Promise<void> {
    if (this.redis.available) await this.redis.reset(`throttle:${key}`);
    this.attempts.delete(key);
  }
}
