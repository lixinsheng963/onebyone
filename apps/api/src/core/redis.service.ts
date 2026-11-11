import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType | null = null;

  async onModuleInit(): Promise<void> {
    if (process.env.REDIS_ENABLED !== 'true') return;
    const url = this.redisUrl();
    try {
      const client = createClient({
        url,
        socket: {
          connectTimeout: 1500,
          reconnectStrategy: false
        }
      });
      client.on('error', (error) => console.warn('Redis error:', error.message));
      await client.connect();
      await client.ping();
      this.client = client as RedisClientType;
      console.log('Redis connected');
    } catch (error) {
      console.warn('Redis unavailable, using in-memory fallback:', (error as Error).message);
      this.client = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) await this.client.quit().catch(() => undefined);
  }

  get available(): boolean {
    return Boolean(this.client && this.client.isOpen);
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async incrementWindow(key: string, windowMs: number): Promise<number | null> {
    if (!this.client) return null;
    try {
      const count = await this.client.incr(key);
      if (count === 1) await this.client.pExpire(key, windowMs);
      return count;
    } catch {
      return null;
    }
  }

  async reset(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(key);
    } catch {
      // Redis failure falls back to the in-memory throttle.
    }
  }

  private redisUrl(): string {
    if (process.env.REDIS_URL) return process.env.REDIS_URL;
    const host = process.env.REDIS_HOST || '127.0.0.1';
    const port = process.env.REDIS_PORT || '6379';
    const password = process.env.REDIS_PASSWORD || '';
    const auth = password ? `:${encodeURIComponent(password)}@` : '';
    return `redis://${auth}${host}:${port}/0`;
  }
}
