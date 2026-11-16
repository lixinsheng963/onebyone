import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { AppModule } from './app.module';

function validateProductionEnv(): void {
  const errors: string[] = [];
  const requireValue = (key: string, label: string) => {
    if (!process.env[key]) errors.push(`${label} (${key}) 未配置`);
  };
  if (process.env.ALLOW_DEMO_LOGIN !== 'false') {
    errors.push('生产环境必须设置 ALLOW_DEMO_LOGIN=false，禁止演示登录');
  }
  requireValue('WX_APPID', '微信 AppID');
  requireValue('WX_SECRET', '微信 AppSecret');
  requireValue('SESSION_PEPPER', '会话 pepper');
  if ((process.env.SESSION_PEPPER || '').length < 32) errors.push('SESSION_PEPPER 长度必须至少 32 位');
  requireValue('ADMIN_PASSWORD', '管理员密码');
  if ((process.env.ADMIN_PASSWORD || '').length < 12 || process.env.ADMIN_PASSWORD === 'campus2026') {
    errors.push('ADMIN_PASSWORD 必须是至少 12 位的非默认密码');
  }
  requireValue('ADMIN_TOTP_SECRET', '管理员 TOTP secret');
  if (process.env.ADMIN_TOTP_SECRET && !/^[A-Z2-7]+=*$/i.test(process.env.ADMIN_TOTP_SECRET)) {
    errors.push('ADMIN_TOTP_SECRET 必须是 Base32（A-Z2-7）');
  }
  const origins = (process.env.CORS_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!origins.length) errors.push('CORS_ORIGINS 未配置');
  if (origins.some((origin) => /localhost|127\.0\.0\.1/.test(origin))) {
    errors.push('生产环境 CORS_ORIGINS 不能使用 localhost/127.0.0.1');
  }
  const publicBase = process.env.PUBLIC_BASE_URL || '';
  if (!/^https:\/\//i.test(publicBase)) errors.push('PUBLIC_BASE_URL 必须是 HTTPS 地址');
  if (process.env.DATA_MODE !== 'mysql') errors.push('生产环境必须设置 DATA_MODE=mysql');
  if (process.env.REDIS_ENABLED !== 'true') errors.push('生产环境必须设置 REDIS_ENABLED=true');
  if (process.env.TRUST_PROXY !== 'true') errors.push('生产环境必须设置 TRUST_PROXY=true（Nginx 反向代理）');
  if (!process.env.MYSQL_PASSWORD) errors.push('MYSQL_PASSWORD 未配置');
  if (errors.length) {
    console.error('生产环境配置校验失败：');
    for (const error of errors) console.error(`- ${error}`);
    throw new Error('生产环境配置不完整，拒绝启动');
  }
}

async function bootstrap() {
  // Works for both `tsx src/main.ts` and `node dist/main.js`.
  loadEnv({ path: resolve(__dirname, '..', '.env'), quiet: true });
  loadEnv({ path: resolve(process.cwd(), '.env'), quiet: true });
  loadEnv({ path: resolve(process.cwd(), '../../.env'), quiet: true });
  if (process.env.NODE_ENV === 'production') validateProductionEnv();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: true,
      trustProxy: process.env.TRUST_PROXY === 'true',
      bodyLimit: 1024 * 1024,
      requestTimeout: 30_000
    })
  );
  const uploadRoot = resolve(__dirname, '../uploads');
  mkdirSync(uploadRoot, { recursive: true });
  // Plugin package and Nest's bundled Fastify have parallel 5.x type copies;
  // runtime is compatible, but the duplicate generic instances are not.
  await app.register(helmet as any, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  });
  await app.register(rateLimit as any, {
    global: true,
    max: Number(process.env.RATE_LIMIT_MAX || 300),
    timeWindow: '1 minute'
  });
  await app.register(multipart as any, { limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 10 } });
  await app.register(fastifyStatic as any, {
    root: uploadRoot,
    prefix: '/uploads/',
    decorateReply: false,
    setHeaders: (res: any) => {
      // @fastify/static v10 passes a Fastify reply here, not a raw ServerResponse.
      if (typeof res.header === 'function') {
        res.header('X-Content-Type-Options', 'nosniff');
        res.header('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (typeof res.setHeader === 'function') {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  });
  app.setGlobalPrefix('api/v1', { exclude: ['healthz'] });
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  app.enableCors({
    origin: ((origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    }) as any,
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization', 'x-user-token', 'x-admin-token']
  });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT || 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`Campus API listening on http://127.0.0.1:${port}`);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
