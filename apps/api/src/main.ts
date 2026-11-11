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

async function bootstrap() {
  // Works for both `tsx src/main.ts` and `node dist/main.js`.
  loadEnv({ path: resolve(__dirname, '..', '.env'), quiet: true });
  loadEnv({ path: resolve(process.cwd(), '.env'), quiet: true });
  loadEnv({ path: resolve(process.cwd(), '../../.env'), quiet: true });
  if (process.env.NODE_ENV === 'production') {
    if (process.env.ALLOW_DEMO_LOGIN === 'true') console.warn('SECURITY: ALLOW_DEMO_LOGIN=true in production');
    if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'campus2026') console.warn('SECURITY: replace the default admin password');
    if (!process.env.ADMIN_TOTP_SECRET) console.warn('SECURITY: ADMIN_TOTP_SECRET is not set; static TOTP fallback is weaker');
    if (!process.env.CORS_ORIGINS) console.warn('SECURITY: CORS_ORIGINS is not set');
    if (process.env.TRUST_PROXY !== 'true') console.warn('SECURITY: TRUST_PROXY is not true; rate limiting will see the proxy IP');
  }
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
    max: 300,
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
