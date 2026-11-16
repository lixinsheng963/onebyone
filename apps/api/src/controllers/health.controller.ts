import { Controller, Get, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { RedisService } from '../core/redis.service';
import { StoreService } from '../core/store.service';

@Controller()
export class HealthController {
  constructor(
    private readonly store: StoreService,
    private readonly redis: RedisService
  ) {}

  @Get('healthz')
  health() {
    return { status: 'ok', service: 'campus-api', time: new Date().toISOString() };
  }

  @Get('readyz')
  async readiness(@Res({ passthrough: true }) reply: FastifyReply) {
    const redisRequired = process.env.REDIS_ENABLED === 'true';
    const [database, redis] = await Promise.all([
      this.store.checkDatabase(),
      redisRequired ? this.redis.ping() : Promise.resolve(true)
    ]);
    const ready = database && redis;
    reply.status(ready ? 200 : 503);
    return {
      status: ready ? 'ok' : 'degraded',
      service: 'campus-api',
      checks: {
        database: database ? 'ok' : 'down',
        redis: redisRequired ? (redis ? 'ok' : 'down') : 'disabled'
      },
      time: new Date().toISOString()
    };
  }
}
