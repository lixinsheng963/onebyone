import { BadRequestException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

export function ok<T>(data: T, requestId = crypto.randomUUID()) {
  return { code: 'OK', data, requestId };
}

export function tokenFrom(req: FastifyRequest): string | undefined {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7);
  const header = req.headers['x-user-token'];
  return typeof header === 'string' ? header : undefined;
}

export function adminTokenFrom(req: FastifyRequest): string | undefined {
  const header = req.headers['x-admin-token'];
  return typeof header === 'string' ? header : undefined;
}

export function requireText(value: unknown, max: number, field: string): string {
  if (typeof value !== 'string') throw new BadRequestException(`${field}格式不正确`);
  const result = value.trim();
  if (!result) throw new BadRequestException(`${field}不能为空`);
  if (result.length > max) throw new BadRequestException(`${field}不能超过${max}个字符`);
  return result;
}

export function optionalText(value: unknown, max: number, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requireText(value, max, field);
}

export function stringList(value: unknown, maxItems: number, maxLength: number, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new BadRequestException(`${field}格式不正确`);
  return value.map((item) => requireText(item, maxLength, field));
}

export function assertEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new BadRequestException(`${field}不合法`);
  return value as T;
}

export function assertId(value: unknown, field = 'ID'): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,96}$/.test(value)) throw new BadRequestException(`${field}不合法`);
  return value;
}
