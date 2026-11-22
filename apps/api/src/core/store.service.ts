import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createPool, type Pool, type PoolConnection, type ResultSetHeader } from 'mysql2/promise';
import type {
  Appeal,
  Comment,
  Media,
  ModerationCase,
  Notice,
  Notification,
  OfficialAccount,
  Post,
  RankingConfig,
  Report,
  ReportAi,
  Risk,
  Topic,
  User
} from '../types';
import { verifySync } from 'otplib';
import { ensureMysqlSchema } from './mysql-schema';
import { CampusStore, type StoreSnapshot } from './store';
import type { AdminIdentity, AdminRole } from '../types';

const nowIso = () => new Date().toISOString();

function asIso(value: unknown, fallback = ''): string {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function asSqlDate(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

function asNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asJson(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value === null || value === undefined ? fallback : String(value);
}

function normalizeLocalMediaUrl(url: string): string {
  if (!url) return url;
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (!base) return url;
  try {
    const parsed = new URL(url);
    const localHost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || /^192\.168\.\d+\.\d+$/.test(parsed.hostname);
    if (localHost && parsed.pathname.startsWith('/uploads/')) {
      return `${base}${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return url;
  }
  return url;
}

function asStringArray(value: unknown): string[] {
  const parsed = asJson(value);
  return Array.isArray(parsed) ? parsed.map(String).slice(0, 8) : [];
}

function asReportAi(row: any): ReportAi | undefined {
  if (!row.ai_decision) return undefined;
  const decision = ['reject', 'uphold', 'needs_human'].includes(row.ai_decision) ? row.ai_decision : 'needs_human';
  return {
    decision,
    reason: asString(row.ai_reason, 'AI 研判'),
    evidence: asStringArray(row.ai_evidence),
    confidence: asNumber(row.ai_confidence, 0),
    checkedAt: asIso(row.ai_checked_at, '')
  };
}

function riskScore(risk: Risk): number {
  return { P0: 100, P1: 75, P2: 50, P3: 10 }[risk] ?? 0;
}

function cloneSnapshot(snapshot: StoreSnapshot): StoreSnapshot {
  return structuredClone(snapshot);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function auditJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value, (_key, item) => item instanceof Set ? [...item] : item);
}

function hashAdminPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyAdminPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  try {
    const expected = Buffer.from(hash, 'hex');
    const actual = scryptSync(password, salt, expected.length || 64);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function verifyAdminTotp(totp: string): boolean {
  const secret = process.env.ADMIN_TOTP_SECRET || '';
  if (secret) {
    try {
      return verifySync({ token: totp, secret, epochTolerance: 30 }).valid;
    } catch {
      return false;
    }
  }
  const staticCode = process.env.ADMIN_TOTP || '';
  return Boolean(staticCode) && totp === staticCode;
}

interface AdminUserRecord extends AdminIdentity {
  passwordHash: string;
  reviewerStatus?: string;
}

export interface AuditLogInput {
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  requestId?: string;
  ip?: string;
  actorRole?: string;
  actorId?: number;
}

@Injectable()
export class StoreService extends CampusStore implements OnModuleDestroy {
  private pool: Pool | null = null;
  private persistTimer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> | null = null;
  private flushAgain = false;
  private lastPersisted: StoreSnapshot | null = null;
  private readonly filePath = resolve(__dirname, '../../data/store.json');

  private userIds = new Map<string, number>();
  private postIds = new Map<string, number>();
  private commentIds = new Map<string, number>();
  private mediaIds = new Map<string, number>();
  private mediaPostIds = new Map<string, number | null>();
  private mediaSorts = new Map<string, number>();
  private topicIds = new Map<string, number>();
  private topicIdsByName = new Map<string, number>();
  private topicPublicIdsByName = new Map<string, string>();
  private locationIds = new Map<string, number>();
  private noticeIds = new Map<string, number>();
  private reportIds = new Map<string, number>();
  private notificationIds = new Map<string, number>();
  private caseIds = new Map<string, number>();
  private appealIds = new Map<string, number>();
  private officialIds = new Map<string, number>();
  private adminUserId: number | null = null;
  private readonly adminUsers = new Map<number, AdminUserRecord>();
  private readonly adminUsersByEmail = new Map<string, AdminUserRecord>();

  async init(): Promise<void> {
    const mode = process.env.DATA_MODE || 'file';
    if (mode === 'memory') return;
    if (mode === 'file') {
      this.loadFile();
      this.setChangeHook(() => this.schedulePersist());
      this.recheckPublishedSafety();
      this.markDirty();
      return;
    }

    try {
      this.pool = createPool({
        host: process.env.MYSQL_HOST || '127.0.0.1',
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER || 'campus',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'campus',
        waitForConnections: true,
        connectionLimit: Number(process.env.MYSQL_POOL_SIZE || 10),
        timezone: 'Z',
        charset: 'utf8mb4',
        decimalNumbers: true,
        supportBigNumbers: true
      });
      await ensureMysqlSchema(this.pool);
      await this.seedAdminUser();
      await this.loadAdminUsers();
      await this.seedInviteCodes();
      const normalized = await this.loadNormalizedSnapshot();
      if (normalized) {
        this.importSnapshot(normalized);
        this.lastPersisted = cloneSnapshot(this.exportSnapshot());
        console.log('MySQL normalized persistence enabled');
      } else {
        const legacy = await this.loadLegacySnapshot();
        if (legacy) {
          this.importSnapshot(legacy);
          console.log('Legacy snapshot found, migrating to normalized MySQL tables');
        } else {
          this.loadFile();
          console.log('No normalized MySQL data found, seeding from file/default data');
        }
        await this.persistSnapshot(cloneSnapshot(this.exportSnapshot()), null);
        this.lastPersisted = cloneSnapshot(this.exportSnapshot());
      }
      this.setChangeHook(() => this.schedulePersist());
      this.recheckPublishedSafety();
      this.markDirty();
    } catch (error) {
      console.warn('MySQL persistence unavailable, falling back to local file:', (error as Error).message);
      if (this.pool) {
        await this.pool.end().catch(() => undefined);
        this.pool = null;
      }
      this.loadFile();
      this.setChangeHook(() => this.schedulePersist());
      this.recheckPublishedSafety();
      this.markDirty();
    }
  }

  async checkDatabase(): Promise<boolean> {
    if ((process.env.DATA_MODE || 'file') !== 'mysql') return true;
    if (!this.pool) return false;
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    try {
      await this.flush();
    } catch (error) {
      console.warn('Final MySQL flush failed:', (error as Error).message);
    }
    if (this.pool) await this.pool.end().catch(() => undefined);
  }

  private async seedAdminUser(): Promise<void> {
    if (!this.pool) return;
    const email = (process.env.ADMIN_EMAIL || '').trim();
    const password = process.env.ADMIN_PASSWORD || '';
    const displayName = (process.env.ADMIN_DISPLAY_NAME || '平台管理员').trim() || '平台管理员';
    if (!email || !password) return;
    try {
      const publicId = `adm_${createHash('sha256').update(email).digest('hex').slice(0, 24)}`;
      await this.pool.query(
        `INSERT INTO admin_users (public_id, email, display_name, password_hash, role, status)
         VALUES (?, ?, ?, ?, 'platform_admin', 'active')
         ON DUPLICATE KEY UPDATE display_name = VALUES(display_name),
           password_hash = VALUES(password_hash), role = 'platform_admin', status = 'active'`,
        [publicId, email, displayName, hashAdminPassword(password)]
      );
      const [rows] = await this.pool.query<any[]>('SELECT id FROM admin_users WHERE email = ? LIMIT 1', [email]);
      this.adminUserId = rows[0]?.id ? Number(rows[0].id) : null;
    } catch (error) {
      console.warn('Admin user seed failed:', (error as Error).message);
    }
  }

  private async loadAdminUsers(): Promise<void> {
    this.adminUsers.clear();
    this.adminUsersByEmail.clear();
    if (!this.pool) return;
    try {
      const [rows] = await this.pool.query<any[]>(
        `SELECT au.id, au.public_id, au.email, au.display_name, au.password_hash, au.role, au.status,
                sr.school_id, sr.org_id, sr.status AS reviewer_status
         FROM admin_users au
         LEFT JOIN school_reviewers sr ON sr.admin_user_id = au.id AND sr.status = 'active'
         ORDER BY au.id, sr.id DESC`
      );
      for (const row of rows) {
        const role = ['platform_admin', 'content_reviewer', 'school_reviewer'].includes(asString(row.role))
          ? asString(row.role) as AdminRole
          : 'content_reviewer';
        const record: AdminUserRecord = {
          id: Number(row.id),
          publicId: asString(row.public_id),
          email: asString(row.email),
          displayName: asString(row.display_name) || asString(row.email).split('@')[0],
          role,
          status: asString(row.status) === 'active' ? 'active' : 'disabled',
          schoolId: asString(row.school_id) || undefined,
          orgId: asString(row.org_id) || undefined,
          passwordHash: asString(row.password_hash),
          reviewerStatus: asString(row.reviewer_status) || undefined
        };
        if (this.adminUsers.has(record.id)) continue;
        this.adminUsers.set(record.id, record);
        this.adminUsersByEmail.set(record.email.toLowerCase(), record);
      }
    } catch (error) {
      console.warn('Admin users load failed:', (error as Error).message);
    }
  }

  private identityFor(record: AdminUserRecord): AdminIdentity {
    return {
      id: record.id,
      publicId: record.publicId,
      email: record.email,
      displayName: record.displayName,
      role: record.role,
      status: record.status,
      schoolId: record.schoolId,
      orgId: record.orgId
    };
  }

  getAdminIdentity(token?: string): AdminIdentity | undefined {
    const subject = this.adminSessionSubject(token);
    if (!subject) return undefined;
    if (subject === 'env:platform_admin' || subject === 'admin') {
      return {
        id: this.adminUserId || 0,
        email: process.env.ADMIN_EMAIL || '',
        displayName: process.env.ADMIN_DISPLAY_NAME || '平台管理员',
        role: 'platform_admin',
        status: 'active'
      };
    }
    const match = /^admin:(\d+)$/.exec(subject);
    if (!match) return undefined;
    const record = this.adminUsers.get(Number(match[1]));
    if (!record || record.status !== 'active') return undefined;
    if (record.role === 'school_reviewer' && record.reviewerStatus !== 'active') return undefined;
    return this.identityFor(record);
  }

  adminLogin(email: string, password: string, totp: string): { token: string; user: string; role: string; schoolId?: string; orgId?: string } {
    const record = this.adminUsersByEmail.get(email.trim().toLowerCase());
    if (record) {
      if (record.status !== 'active') throw new Error('ADMIN_AUTH_FAILED');
      if (!verifyAdminPassword(password, record.passwordHash) || !verifyAdminTotp(totp)) {
        throw new Error('ADMIN_AUTH_FAILED');
      }
      const session = this.issueAdminSession(`admin:${record.id}`, record.displayName);
      void this.pool?.query('UPDATE admin_users SET last_login_at = UTC_TIMESTAMP(3) WHERE id = ?', [record.id])
        .catch(() => undefined);
      return { ...session, role: record.role, schoolId: record.schoolId, orgId: record.orgId };
    }
    const fallback = super.adminLogin(email, password, totp);
    return { ...fallback, role: 'platform_admin' };
  }

  async listAdminOperators(): Promise<AdminIdentity[]> {
    return [...this.adminUsers.values()].map((record) => this.identityFor(record));
  }

  async createAdminOperator(input: {
    email: string;
    password: string;
    displayName?: string;
    role: AdminRole;
    schoolId?: string;
    orgId?: string;
    authorizedBy?: number;
    backupAdminUserId?: number;
  }): Promise<AdminIdentity> {
    if (!this.pool) throw new Error('ADMIN_DB_REQUIRED');
    const email = input.email.trim().toLowerCase();
    const password = input.password;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('ADMIN_EMAIL_INVALID');
    if (password.length < 10) throw new Error('ADMIN_PASSWORD_TOO_SHORT');
    if (input.role !== 'school_reviewer' && input.role !== 'content_reviewer') {
      throw new Error('ADMIN_ROLE_INVALID');
    }
    if (input.role === 'school_reviewer' && (!input.schoolId || !input.orgId)) {
      throw new Error('SCHOOL_REVIEWER_SCOPE_REQUIRED');
    }
    if (this.adminUsersByEmail.has(email)) throw new Error('ADMIN_EMAIL_EXISTS');
    const sameRoleActive = [...this.adminUsers.values()].filter(
      (record) => record.role === input.role && record.status === 'active'
    ).length;
    if (sameRoleActive >= 1) throw new Error('ADMIN_OPERATOR_LIMIT');
    const displayName = (input.displayName || email.split('@')[0]).trim().slice(0, 64);
    const publicId = `adm_${randomBytes(12).toString('hex')}`;
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO admin_users (public_id, email, display_name, password_hash, role, status)
         VALUES (?, ?, ?, ?, ?, 'active')`,
        [publicId, email, displayName, hashAdminPassword(password), input.role]
      );
      const adminId = Number(result.insertId);
      if (input.role === 'school_reviewer') {
        await connection.query(
          `INSERT INTO school_reviewers
             (admin_user_id, school_id, org_id, authorized_by, backup_admin_user_id, status)
           VALUES (?, ?, ?, ?, ?, 'active')`,
          [adminId, input.schoolId, input.orgId, input.authorizedBy || this.adminUserId || 0, input.backupAdminUserId || null]
        );
      }
      await connection.commit();
      await this.loadAdminUsers();
      const record = this.adminUsers.get(adminId);
      if (!record) throw new Error('ADMIN_CREATE_FAILED');
      return this.identityFor(record);
    } catch (error) {
      await connection.rollback().catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  async revokeAdminOperator(adminId: number): Promise<AdminIdentity> {
    if (!this.pool) throw new Error('ADMIN_DB_REQUIRED');
    const record = this.adminUsers.get(adminId);
    if (!record) throw new Error('ADMIN_NOT_FOUND');
    if (record.role === 'platform_admin') throw new Error('ADMIN_CANNOT_REVOKE_PLATFORM');
    await this.pool.query('UPDATE admin_users SET status = \'disabled\' WHERE id = ?', [adminId]);
    if (record.role === 'school_reviewer') {
      await this.pool.query(
        'UPDATE school_reviewers SET status = \'revoked\', changed_at = UTC_TIMESTAMP(3) WHERE admin_user_id = ? AND status = \'active\'',
        [adminId]
      );
    }
    this.revokeAdminSubject(`admin:${adminId}`);
    await this.loadAdminUsers();
    return { ...this.identityFor(record), status: 'disabled' };
  }

  private inviteHash(code: string): string {
    return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
  }

  private async seedInviteCodes(): Promise<void> {
    if (!this.pool) return;
    const code = (process.env.INVITE_CODE || '').trim().toUpperCase();
    if (!code) {
      // The old demo master code is no longer a valid admission path. Keep the
      // row for audit/history, but revoke it so every client must use a code
      // issued from the admin console.
      await this.pool.query(
        "UPDATE invite_codes SET status = 'revoked' WHERE code = 'CAMPUS' AND source = 'seed' AND status = 'active'"
      ).catch((error) => console.warn('Default invite code revoke failed:', (error as Error).message));
      return;
    }
    const maxUses = Math.min(100, Math.max(1, Number(process.env.INVITE_MAX_USES || 100)));
    const name = (process.env.INVITE_NAME || '默认邀请码').trim().slice(0, 64);
    const expiresAt = new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 23).replace('T', ' ');
    try {
      await this.pool.query(
        `INSERT INTO invite_codes (code_hash, code, name, issuer_id, source, max_uses, used_count, expires_at, status)
         VALUES (?, ?, ?, 0, 'seed', ?, 0, ?, 'active')
         ON DUPLICATE KEY UPDATE code = VALUES(code), name = VALUES(name)`,
        [this.inviteHash(code), code, name, maxUses, expiresAt]
      );
      // Keep the development seed within the new 1-100 limit without changing an already-used code.
      await this.pool.query(
        `UPDATE invite_codes SET max_uses = ? WHERE code_hash = ? AND used_count = 0 AND max_uses > ?`,
        [maxUses, this.inviteHash(code), maxUses]
      );
    } catch (error) {
      console.warn('Invite code seed failed:', (error as Error).message);
    }
  }

  async createInviteCode(input: { name?: string; code?: string; maxUses?: number; expiresAt?: string }): Promise<{
    id: number;
    code: string;
    name: string;
    maxUses: number;
    expiresAt: string;
  }> {
    if (!this.pool) throw new Error('MYSQL_NOT_READY');
    const custom = Boolean(input.code?.trim());
    const name = (input.name?.trim() || '未命名邀请码').slice(0, 64);
    const maxUses = Math.min(100, Math.max(1, Number(input.maxUses) || 1));
    const expiresAt = input.expiresAt
      ? new Date(input.expiresAt).toISOString()
      : new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    let plain = custom
      ? input.code!.trim().toUpperCase()
      : `CAMPUS-${randomBytes(4).toString('hex').toUpperCase()}`;

    // Never reuse a revoked, expired or used code. A custom code collision is an
    // explicit validation error; generated codes simply roll again.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const [existing] = await this.pool.query<any[]>(
        'SELECT id FROM invite_codes WHERE code_hash = ? LIMIT 1',
        [this.inviteHash(plain)]
      );
      if (!existing.length) break;
      if (custom) throw new Error('INVITE_CODE_EXISTS');
      if (attempt === 7) throw new Error('INVITE_CODE_EXISTS');
      plain = `CAMPUS-${randomBytes(4).toString('hex').toUpperCase()}`;
    }

    try {
      const [result] = await this.pool.query<ResultSetHeader>(
        `INSERT INTO invite_codes (code_hash, code, name, issuer_id, source, max_uses, used_count, expires_at, status)
         VALUES (?, ?, ?, ?, 'admin', ?, 0, ?, 'active')`,
        [this.inviteHash(plain), plain, name, this.adminUserId || 0, maxUses, expiresAt.slice(0, 23).replace('T', ' ')]
      );
      return { id: Number(result.insertId), code: plain, name, maxUses, expiresAt };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'ER_DUP_ENTRY') throw new Error('INVITE_CODE_EXISTS');
      throw error;
    }
  }

  async listInviteCodes(): Promise<unknown[]> {
    if (!this.pool) return [];
    const [rows] = await this.pool.query<any[]>(
      `SELECT id, code, name, issuer_id, source, max_uses, used_count, expires_at, status, created_at
       FROM invite_codes WHERE source <> 'seed' ORDER BY id ASC LIMIT 500`
    );
    return rows.map((row) => ({
      id: Number(row.id),
      code: row.code || null,
      name: row.name || '未命名邀请码',
      issuerId: Number(row.issuer_id || 0),
      source: row.source,
      maxUses: Number(row.max_uses),
      usedCount: Number(row.used_count),
      expiresAt: asIso(row.expires_at),
      status: row.status === 'active' && new Date(row.expires_at).getTime() <= Date.now() ? 'expired' : row.status,
      createdAt: asIso(row.created_at)
    }));
  }

  async revokeInviteCode(id: number): Promise<boolean> {
    if (!this.pool) return false;
    const [result] = await this.pool.query<ResultSetHeader>(
      `UPDATE invite_codes SET status = 'revoked' WHERE id = ? AND status = 'active'`,
      [id]
    );
    return result.affectedRows > 0;
  }

  async checkInvite(code: string): Promise<{ ok: boolean; message: string }> {
    if (!this.pool) return super.checkInvite(code);
    const [rows] = await this.pool.query<any[]>(
      'SELECT status, expires_at, max_uses, used_count FROM invite_codes WHERE code_hash = ? LIMIT 1',
      [this.inviteHash(code)]
    );
    const invite = rows[0];
    const expired = invite ? new Date(invite.expires_at).getTime() <= Date.now() : true;
    if (!invite || invite.status !== 'active' || expired || Number(invite.used_count) >= Number(invite.max_uses)) {
      return { ok: false, message: '邀请码无效或已使用' };
    }
    return { ok: true, message: '邀请码有效' };
  }

  async redeemInvite(code: string, token?: string): Promise<{ ok: boolean; message: string; user?: User }> {
    if (!this.pool) return super.redeemInvite(code, token);
    const user = this.getUserByToken(token);
    if (!user) return { ok: false, message: '请先登录' };
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<any[]>(
        `SELECT id, status, expires_at, max_uses, used_count FROM invite_codes WHERE code_hash = ? FOR UPDATE`,
        [this.inviteHash(code)]
      );
      const invite = rows[0];
      const expired = invite ? new Date(invite.expires_at).getTime() <= Date.now() : true;
      if (!invite || invite.status !== 'active' || expired || Number(invite.used_count) >= Number(invite.max_uses)) {
        await connection.rollback();
        return { ok: false, message: '邀请码无效或已使用' };
      }
      const nextCount = Number(invite.used_count) + 1;
      await connection.query(
        `UPDATE invite_codes SET used_count = ?, status = ? WHERE id = ?`,
        [nextCount, nextCount >= Number(invite.max_uses) ? 'used' : 'active', invite.id]
      );
      if (!user.admittedAt) {
        user.admittedAt = new Date().toISOString();
        await connection.query(
          'UPDATE users SET admitted_at = COALESCE(admitted_at, NOW(3)), updated_at = NOW(3) WHERE public_id = ?',
          [user.publicId]
        );
      }
      await connection.commit();
      this.markDirty();
      return { ok: true, message: '认证成功', user };
    } catch (error) {
      await connection.rollback().catch(() => undefined);
      console.warn('Invite redeem failed:', (error as Error).message);
      return { ok: false, message: '邀请码校验失败，请稍后重试' };
    } finally {
      connection.release();
    }
  }

  async recordAudit(input: AuditLogInput): Promise<void> {
    if (!this.pool) return;
    try {
      const targetId = input.targetId ? this.auditTargetId(input.targetType, input.targetId) : null;
      const ipHash = input.ip
        ? createHash('sha256').update(`${input.ip}|${process.env.SESSION_PEPPER || ''}`).digest('hex')
        : null;
      await this.pool.query(
        `INSERT INTO audit_logs
           (actor_id, actor_type, actor_role, action, target_type, target_id, before_json, after_json, request_id, ip_hash)
         VALUES (?, 'admin', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.actorId ?? this.adminUserId ?? 0,
          input.actorRole || 'platform_admin',
          input.action,
          input.targetType || null,
          targetId || null,
          auditJson(input.before),
          auditJson(input.after),
          input.requestId || null,
          ipHash
        ]
      );
    } catch (error) {
      console.warn('Audit log write failed:', (error as Error).message);
    }
  }

  async listAuditLogs(limit = 100): Promise<unknown[]> {
    if (!this.pool) return [];
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
    const [rows] = await this.pool.query<any[]>(
      `SELECT id, actor_id, actor_type, actor_role, action, target_type, target_id,
              before_json, after_json, request_id, ip_hash, created_at
       FROM audit_logs ORDER BY id DESC LIMIT ?`,
      [safeLimit]
    );
    return rows.map((row) => ({
      id: Number(row.id),
      actorId: Number(row.actor_id),
      actorType: row.actor_type,
      actorRole: row.actor_role,
      action: row.action,
      targetType: row.target_type || undefined,
      targetId: row.target_id === null ? undefined : Number(row.target_id),
      before: asJson(row.before_json),
      after: asJson(row.after_json),
      requestId: row.request_id || undefined,
      ipHash: row.ip_hash || undefined,
      createdAt: asIso(row.created_at)
    }));
  }

  private auditTargetId(targetType: string | undefined, publicId: string): number {
    if (targetType === 'notice') return this.noticeIds.get(publicId) ?? 0;
    if (targetType === 'report') return this.reportIds.get(publicId) ?? 0;
    if (targetType === 'moderation_case') return this.caseIds.get(publicId) ?? 0;
    if (targetType === 'official_account') return this.officialIds.get(publicId) ?? 0;
    if (targetType === 'appeal') return this.appealIds.get(publicId) ?? 0;
    if (targetType === 'comment') return this.commentIds.get(publicId) ?? 0;
    if (targetType === 'user') return this.userIds.get(publicId) ?? 0;
    if (targetType === 'post') return this.postIds.get(publicId) ?? 0;
    if (targetType === 'invite_code') return Number(publicId) || 0;
    return 0;
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.flush().catch((error) => {
        console.warn('MySQL persistence write failed:', (error as Error).message);
      });
    }, 100);
  }

  private loadFile(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const snapshot = JSON.parse(readFileSync(this.filePath, 'utf8'));
      this.importSnapshot(snapshot);
      console.log(`Local snapshot loaded: ${this.filePath}`);
    } catch (error) {
      console.warn('Local snapshot read failed:', (error as Error).message);
    }
  }

  private async loadLegacySnapshot(): Promise<StoreSnapshot | null> {
    if (this.pool) {
      try {
        const [rows] = await this.pool.query<any[]>('SELECT snapshot FROM app_state WHERE id = 1');
        if (rows.length && rows[0]?.snapshot) {
          const snapshot = asJson(rows[0].snapshot);
          if (snapshot && (snapshot as StoreSnapshot).version === 1) return snapshot as StoreSnapshot;
        }
      } catch (error) {
        if ((error as { code?: string }).code !== 'ER_NO_SUCH_TABLE') {
          console.warn('Legacy app_state read failed:', (error as Error).message);
        }
      }
    }
    if (!existsSync(this.filePath)) return null;
    try {
      const snapshot = JSON.parse(readFileSync(this.filePath, 'utf8'));
      return snapshot?.version === 1 ? snapshot as StoreSnapshot : null;
    } catch {
      return null;
    }
  }

  private async loadNormalizedSnapshot(): Promise<StoreSnapshot | null> {
    if (!this.pool) return null;
    const [userRows] = await this.pool.query<any[]>(
      `SELECT id, public_id, openid, nickname, avatar_url, role, level, is_official, official_org,
              official_base_role, official_base_level, status, muted_until, status_reason, deleted_at,
              school, school_selected_at, admitted_at, created_at
       FROM users ORDER BY id`
    );
    if (!userRows.length) return null;

    const users: User[] = [];
    for (const row of userRows) {
      const publicId = asString(row.public_id);
      this.userIds.set(publicId, Number(row.id));
      users.push({
        id: publicId,
        publicId,
        openid: row.openid || undefined,
        nickname: asString(row.nickname),
        avatar: asString(row.avatar_url),
        role: ['student', 'creator', 'official'].includes(row.role) ? row.role : 'student',
        level: ['L0', 'L1', 'L2', 'L3', 'L4'].includes(row.level) ? row.level : 'L1',
        isOfficial: Boolean(row.is_official),
        officialOrg: row.official_org || undefined,
        officialBaseRole: row.official_base_role === 'creator' ? 'creator' : row.official_base_role === 'student' ? 'student' : undefined,
        officialBaseLevel: ['L0', 'L1', 'L2', 'L3'].includes(row.official_base_level) ? row.official_base_level : undefined,
        status: ['active', 'muted', 'banned', 'deleted'].includes(row.status) ? row.status : 'active',
        mutedUntil: row.muted_until ? asIso(row.muted_until, '') : undefined,
        statusReason: row.status_reason || undefined,
        deletedAt: row.deleted_at ? asIso(row.deleted_at, '') : undefined,
        school: row.school || undefined,
        schoolSelectedAt: row.school_selected_at ? asIso(row.school_selected_at, '') : undefined,
        admittedAt: row.admitted_at ? asIso(row.admitted_at, '') : undefined,
        createdAt: asIso(row.created_at, nowIso())
      });
    }

    const [topicRows] = await this.pool.query<any[]>('SELECT id, public_id, name, emoji, count FROM topics ORDER BY id');
    const topics: Topic[] = topicRows.map((row) => {
      const publicId = asString(row.public_id);
      this.topicIds.set(publicId, Number(row.id));
      this.topicIdsByName.set(asString(row.name), Number(row.id));
      this.topicPublicIdsByName.set(asString(row.name), publicId);
      return { id: publicId, name: asString(row.name), emoji: row.emoji || undefined, count: asNumber(row.count) };
    });

    const [locationRows] = await this.pool.query<any[]>('SELECT id, name FROM locations ORDER BY id');
    for (const row of locationRows) {
      this.locationIds.set(asString(row.name), Number(row.id));
    }

    const [postRows] = await this.pool.query<any[]>(
      `SELECT p.id, p.public_id, p.author_id, p.text, p.topic_id, p.location_id,
              p.latitude, p.longitude, p.anonymity, p.anonymous_alias, p.status, p.risk_level, p.featured,
              p.comments_enabled, p.like_count, p.favorite_count, p.share_count, p.comment_count,
              p.unique_viewers, p.unique_commenters, p.heat_score, p.published_at,
              p.pinned_at, p.created_at
       FROM posts p ORDER BY p.id`
    );
    const posts: Post[] = postRows.map((row) => {
      const publicId = asString(row.public_id);
      this.postIds.set(publicId, Number(row.id));
      const topic = topicRows.find((item) => Number(item.id) === Number(row.topic_id));
      const location = locationRows.find((item) => Number(item.id) === Number(row.location_id));
      return {
        id: publicId,
        authorId: this.publicIdForUser(Number(row.author_id)),
        text: asString(row.text),
        media: [],
        topic: topic ? asString(topic.name) : undefined,
        location: location ? asString(location.name) : undefined,
        latitude: row.latitude === null || row.latitude === undefined ? undefined : Number(row.latitude),
        longitude: row.longitude === null || row.longitude === undefined ? undefined : Number(row.longitude),
        anonymity: Boolean(row.anonymity),
        anonymousAlias: row.anonymous_alias || undefined,
        status: ['pending', 'published', 'rejected', 'hidden'].includes(row.status) ? row.status : 'pending',
        risk: ['P0', 'P1', 'P2', 'P3'].includes(row.risk_level) ? row.risk_level : 'P3',
        featured: Boolean(row.featured),
        commentsEnabled: Boolean(row.comments_enabled),
        likeCount: asNumber(row.like_count),
        favoriteCount: asNumber(row.favorite_count),
        shareCount: asNumber(row.share_count),
        commentCount: asNumber(row.comment_count),
        uniqueViewers: asNumber(row.unique_viewers),
        uniqueCommenters: asNumber(row.unique_commenters),
        publishedAt: asIso(row.published_at, asIso(row.created_at, nowIso())),
        createdAt: asIso(row.created_at, nowIso()),
        pinnedAt: row.pinned_at ? asIso(row.pinned_at) : undefined,
        likedBy: new Set<string>(),
        favoritedBy: new Set<string>(),
        heatScore: asNumber(row.heat_score)
      };
    });

    const [mediaRows] = await this.pool.query<any[]>(
      `SELECT id, public_id, post_id, owner_id, url, thumb_url, object_key, mime, width, height, size_bytes,
              storage, sort
       FROM post_media
       ORDER BY COALESCE(post_id, 0), sort, id`
    );
    const allMedia: Media[] = [];
    for (const row of mediaRows) {
      const publicId = asString(row.public_id);
      this.mediaIds.set(publicId, Number(row.id));
      this.mediaPostIds.set(publicId, row.post_id ? Number(row.post_id) : null);
      this.mediaSorts.set(publicId, asNumber(row.sort));
      const media: Media = {
        id: publicId,
        url: normalizeLocalMediaUrl(asString(row.url)),
        width: asNumber(row.width),
        height: asNumber(row.height),
        thumbUrl: row.thumb_url ? normalizeLocalMediaUrl(asString(row.thumb_url)) : undefined,
        objectKey: row.object_key || undefined,
        ownerId: row.owner_id ? this.publicIdForUser(Number(row.owner_id)) : undefined,
        storage: row.storage === 'cos' ? 'cos' : 'local'
      };
      allMedia.push(media);
      if (row.post_id) {
        const post = posts.find((item) => this.postIds.get(item.id) === Number(row.post_id));
        if (post) post.media.push(media);
      }
    }

    const [reactionRows] = await this.pool.query<any[]>(
      `SELECT user_id, target_id, kind FROM reactions WHERE target_type = 'post' ORDER BY id`
    );
    for (const row of reactionRows) {
      const post = posts.find((item) => this.postIds.get(item.id) === Number(row.target_id));
      if (!post) continue;
      const user = this.publicIdForUser(Number(row.user_id));
      if (row.kind === 'like') post.likedBy.add(user);
      if (row.kind === 'favorite') post.favoritedBy.add(user);
    }

    const [commentRows] = await this.pool.query<any[]>(
      `SELECT id, public_id, post_id, author_id, root_id, parent_id, reply_to_user_id, text,
              anonymity, anonymous_alias, status, risk_level, like_count, created_at
       FROM comments ORDER BY id`
    );
    const commentPublicById = new Map<number, string>();
    for (const row of commentRows) {
      const publicId = asString(row.public_id);
      this.commentIds.set(publicId, Number(row.id));
      commentPublicById.set(Number(row.id), publicId);
    }
    const comments: Comment[] = commentRows.map((row) => ({
      id: asString(row.public_id),
      postId: this.publicIdForPost(Number(row.post_id)),
      authorId: this.publicIdForUser(Number(row.author_id)),
      rootId: commentPublicById.get(Number(row.root_id)),
      parentId: commentPublicById.get(Number(row.parent_id)),
      replyToUserId: row.reply_to_user_id ? this.publicIdForUser(Number(row.reply_to_user_id)) : undefined,
      text: asString(row.text),
      anonymity: Boolean(row.anonymity),
      anonymousAlias: row.anonymous_alias || undefined,
      status: ['pending', 'published', 'hidden'].includes(row.status) ? row.status : 'pending',
      risk: ['P0', 'P1', 'P2', 'P3'].includes(row.risk_level) ? row.risk_level : 'P2',
      likeCount: asNumber(row.like_count),
      createdAt: asIso(row.created_at, nowIso())
    }));

    const [noticeRows] = await this.pool.query<any[]>(
      `SELECT id, public_id, source, type, title, body, pinned, effective_from, effective_to, status, created_at
       FROM notices ORDER BY id`
    );
    const notices: Notice[] = noticeRows.map((row) => {
      const publicId = asString(row.public_id);
      this.noticeIds.set(publicId, Number(row.id));
      return {
        id: publicId,
        title: asString(row.title),
        body: asString(row.body),
        type: row.type === 'emergency' ? 'emergency' : 'normal',
        source: asString(row.source),
        status: row.status === 'withdrawn' ? 'withdrawn' : 'published',
        pinned: Boolean(row.pinned),
        effectiveFrom: asIso(row.effective_from, nowIso()),
        effectiveTo: asIso(row.effective_to, nowIso()),
        createdAt: asIso(row.created_at, nowIso())
      };
    });

    const [reportRows] = await this.pool.query<any[]>(
      `SELECT id, public_id, reporter_id, target_type, target_id, reason_code, detail, status,
              ai_decision, ai_reason, ai_evidence, ai_confidence, ai_checked_at, handled_by, handled_at, created_at
       FROM reports ORDER BY id`
    );
    const reports: Report[] = reportRows.map((row) => {
      const publicId = asString(row.public_id);
      this.reportIds.set(publicId, Number(row.id));
      return {
        id: publicId,
        reporterId: this.publicIdForUser(Number(row.reporter_id)),
        targetType: ['post', 'comment', 'user'].includes(row.target_type) ? row.target_type : 'post',
        targetId: this.publicIdForTarget(row.target_type, Number(row.target_id)),
        reason: asString(row.reason_code),
        detail: row.detail || undefined,
        status: ['pending', 'resolved', 'rejected'].includes(row.status) ? row.status : 'pending',
        ai: asReportAi(row),
        handledById: row.handled_by ? String(row.handled_by) : undefined,
        handledAt: row.handled_at ? asIso(row.handled_at) : undefined,
        createdAt: asIso(row.created_at, nowIso())
      };
    });

    const [notificationRows] = await this.pool.query<any[]>(
      `SELECT id, public_id, user_id, type, title, body, link, read_at, created_at
       FROM notifications ORDER BY id`
    );
    const notifications: Notification[] = notificationRows.map((row) => {
      const publicId = asString(row.public_id);
      this.notificationIds.set(publicId, Number(row.id));
      return {
        id: publicId,
        userId: this.publicIdForUser(Number(row.user_id)),
        type: ['interaction', 'review', 'official'].includes(row.type) ? row.type : 'interaction',
        title: asString(row.title),
        body: asString(row.body),
        link: row.link || undefined,
        read: Boolean(row.read_at),
        createdAt: asIso(row.created_at, nowIso())
      };
    });

    const [caseRows] = await this.pool.query<any[]>(
      `SELECT id, public_id, target_type, target_id, status, priority, labels, evidence, reviews_json,
              reason_text, decided_by_label, decided_at, created_at
       FROM moderation_cases ORDER BY id`
    );
    const cases: ModerationCase[] = caseRows.map((row) => {
      const publicId = asString(row.public_id);
      this.caseIds.set(publicId, Number(row.id));
      return {
        id: publicId,
        targetType: row.target_type === 'comment' ? 'comment' : 'post',
        targetId: this.publicIdForTarget(row.target_type, Number(row.target_id)),
        risk: ['P0', 'P1', 'P2', 'P3'].includes(row.priority) ? row.priority : 'P3',
        labels: Array.isArray(asJson(row.labels)) ? asJson(row.labels) as string[] : [],
        evidence: Array.isArray(asJson(row.evidence)) ? asJson(row.evidence) as string[] : [],
        reason: asString(row.reason_text),
        status: ['pending', 'approved', 'rejected'].includes(row.status) ? row.status : 'pending',
        createdAt: asIso(row.created_at, nowIso()),
        decidedBy: row.decided_by_label || undefined,
        decidedAt: row.decided_at ? asIso(row.decided_at) : undefined,
        reviews: Array.isArray(asJson(row.reviews_json)) ? asJson(row.reviews_json) as ModerationCase['reviews'] : undefined
      };
    });

    const [appealRows] = await this.pool.query<any[]>(
      `SELECT id, public_id, user_id, target_type, target_id, reason, status,
              decision_reason, handled_by, handled_at, created_at
       FROM appeals ORDER BY id`
    );
    const appeals: Appeal[] = appealRows.map((row) => {
      const publicId = asString(row.public_id);
      this.appealIds.set(publicId, Number(row.id));
      return {
        id: publicId,
        userId: this.publicIdForUser(Number(row.user_id)),
        targetType: ['post', 'comment', 'user'].includes(row.target_type) ? row.target_type : 'post',
        targetId: this.publicIdForTarget(row.target_type, Number(row.target_id)),
        reason: asString(row.reason),
        status: ['pending', 'approved', 'rejected'].includes(row.status) ? row.status : 'pending',
        decisionReason: row.decision_reason || undefined,
        handledBy: row.handled_by || undefined,
        handledAt: row.handled_at ? asIso(row.handled_at) : undefined,
        createdAt: asIso(row.created_at, nowIso())
      };
    });

    const [officialRows] = await this.pool.query<any[]>(
      `SELECT oa.id, oa.public_id, oa.user_id, oa.org_name, oa.org_id, oa.school_id,
              oa.authorization_file_key, oa.authorization_file_name, oa.authorization_mime,
              oa.authorization_size, oa.authorization_requested_at, oa.scope, oa.status, oa.school_reviewed_by,
              oa.school_reviewed_at, oa.reviewed_by, oa.platform_reviewed_at,
              oa.effective_at, oa.expires_at, oa.created_at,
              COALESCE(su.display_name, su.email) AS school_reviewer_name,
              COALESCE(pu.display_name, pu.email) AS platform_reviewer_name
       FROM official_accounts oa
       LEFT JOIN admin_users su ON su.id = oa.school_reviewed_by
       LEFT JOIN admin_users pu ON pu.id = oa.reviewed_by
       ORDER BY oa.id`
    );
    const officialAccounts: OfficialAccount[] = officialRows.map((row) => {
      const publicId = asString(row.public_id);
      this.officialIds.set(publicId, Number(row.id));
      return {
        id: publicId,
        userId: this.publicIdForUser(Number(row.user_id)),
        orgName: asString(row.org_name),
        orgId: row.org_id || undefined,
        schoolId: asString(row.school_id) || 'campus',
        scope: Array.isArray(asJson(row.scope)) ? asJson(row.scope) as string[] : ['notice'],
        status: ['pending_school', 'pending_platform', 'active', 'suspended', 'expired'].includes(row.status)
          ? row.status
          : 'pending_school',
        authorizationFile: row.authorization_file_key || undefined,
        authorizationFileName: row.authorization_file_name || undefined,
        authorizationMime: row.authorization_mime || undefined,
        authorizationSize: row.authorization_size ? Number(row.authorization_size) : undefined,
        authorizationRequestedAt: row.authorization_requested_at ? asIso(row.authorization_requested_at) : undefined,
        schoolReviewedBy: row.school_reviewer_name || undefined,
        schoolReviewedById: row.school_reviewed_by ? Number(row.school_reviewed_by) : undefined,
        schoolReviewedAt: row.school_reviewed_at ? asIso(row.school_reviewed_at) : undefined,
        platformReviewedBy: row.platform_reviewer_name || undefined,
        platformReviewedById: row.reviewed_by ? Number(row.reviewed_by) : undefined,
        platformReviewedAt: row.platform_reviewed_at ? asIso(row.platform_reviewed_at) : undefined,
        effectiveAt: row.effective_at ? asIso(row.effective_at) : undefined,
        expiresAt: row.expires_at ? asIso(row.expires_at) : undefined,
        createdAt: asIso(row.created_at, nowIso())
      };
    });

    const [rankingRows] = await this.pool.query<any[]>('SELECT config FROM ranking_config WHERE id = 1');
    const rankingConfig = rankingRows.length && asJson(rankingRows[0].config)
      ? { ...this.getRankingConfig(), ...(asJson(rankingRows[0].config) as Partial<RankingConfig>) }
      : this.getRankingConfig();

    const [userSessionRows] = await this.pool.query<any[]>(
      `SELECT s.token_hash, u.public_id, s.expires_at
       FROM user_sessions s JOIN users u ON u.id = s.user_id`
    );
    const sessions: Array<[string, string]> = [];
    const sessionExpiry: Array<[string, number]> = [];
    for (const row of userSessionRows) {
      sessions.push([asString(row.token_hash), asString(row.public_id)]);
      sessionExpiry.push([asString(row.token_hash), new Date(row.expires_at).getTime()]);
    }

    const [adminSessionRows] = await this.pool.query<any[]>(
      'SELECT token_hash, subject, expires_at FROM admin_sessions'
    );
    const adminSessions: Array<[string, string]> = adminSessionRows.map((row) => [
      asString(row.token_hash),
      asString(row.subject, 'admin')
    ]);
    const adminSessionExpiry: Array<[string, number]> = adminSessionRows.map((row) => [
      asString(row.token_hash),
      new Date(row.expires_at).getTime()
    ]);

    const [viewerRows] = await this.pool.query<any[]>(
      `SELECT v.post_id, v.viewer_key FROM post_viewers v ORDER BY v.post_id, v.created_at`
    );
    const viewerMap = new Map<string, string[]>();
    for (const row of viewerRows) {
      const postId = this.publicIdForPost(Number(row.post_id));
      const list = viewerMap.get(postId) ?? [];
      list.push(asString(row.viewer_key));
      viewerMap.set(postId, list);
    }

    return {
      version: 1,
      users,
      posts: posts.map((post) => ({
        ...post,
        likedBy: [...post.likedBy],
        favoritedBy: [...post.favoritedBy]
      })),
      comments,
      media: allMedia,
      notices,
      reports,
      notifications,
      cases,
      topics,
      appeals,
      officialAccounts,
      rankingConfig,
      sessions,
      sessionExpiry,
      adminSessions,
      adminSessionExpiry,
      viewers: [...viewerMap.entries()]
    } as StoreSnapshot;
  }

  private publicIdForUser(dbId: number): string {
    for (const [publicId, id] of this.userIds) if (id === dbId) return publicId;
    return `u_deleted_${dbId}`;
  }

  private publicIdForPost(dbId: number): string {
    for (const [publicId, id] of this.postIds) if (id === dbId) return publicId;
    return `p_deleted_${dbId}`;
  }

  private publicIdForTarget(type: string, dbId: number): string {
    if (type === 'comment') {
      for (const [publicId, id] of this.commentIds) if (id === dbId) return publicId;
    } else if (type === 'user') {
      for (const [publicId, id] of this.userIds) if (id === dbId) return publicId;
    } else {
      for (const [publicId, id] of this.postIds) if (id === dbId) return publicId;
    }
    return `${type}_deleted_${dbId}`;
  }

  private async flush(): Promise<void> {
    if (!this.pool) {
      this.writeFileSnapshot();
      return;
    }
    if (this.flushing) {
      this.flushAgain = true;
      return this.flushing;
    }
    const current = cloneSnapshot(this.exportSnapshot());
    const previous = this.lastPersisted;
    this.flushing = this.persistSnapshot(current, previous)
      .then(() => {
        this.lastPersisted = current;
      })
      .catch((error) => {
        console.warn('MySQL persistence write failed:', (error as Error).message);
        throw error;
      })
      .finally(() => {
        this.flushing = null;
      });
    try {
      await this.flushing;
    } finally {
      if (this.flushAgain) {
        this.flushAgain = false;
        await this.flush();
      }
    }
  }

  private writeFileSnapshot(): void {
    const snapshot = JSON.stringify(this.exportSnapshot());
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, snapshot, 'utf8');
    renameSync(tmp, this.filePath);
  }

  private async persistSnapshot(snapshot: StoreSnapshot, previous: StoreSnapshot | null): Promise<void> {
    if (!this.pool) throw new Error('MYSQL_NOT_CONFIGURED');
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query("SET time_zone = '+00:00'");
      await this.syncUsers(connection, previous?.users, snapshot.users);
      await this.syncTopics(connection, previous?.topics, snapshot.topics);
      await this.syncPosts(connection, previous?.posts, snapshot.posts, snapshot.comments);
      await this.syncMedia(connection, previous?.media, snapshot.media, snapshot.posts);
      await this.syncComments(connection, previous?.comments, snapshot.comments);
      await this.syncReactions(connection, previous?.posts, snapshot.posts);
      await this.syncNotices(connection, previous?.notices, snapshot.notices);
      await this.syncReports(connection, previous?.reports, snapshot.reports);
      await this.syncNotifications(connection, previous?.notifications, snapshot.notifications);
      await this.syncCases(connection, previous?.cases, snapshot.cases);
      await this.syncAppeals(connection, previous?.appeals, snapshot.appeals);
      await this.syncOfficialAccounts(connection, previous?.officialAccounts, snapshot.officialAccounts);
      await this.syncRanking(connection, previous?.rankingConfig, snapshot.rankingConfig);
      await this.syncSessions(connection, previous, snapshot);
      await this.syncViewers(connection, previous?.viewers, snapshot.viewers);
      await connection.commit();
    } catch (error) {
      await connection.rollback().catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  private async syncUsers(connection: PoolConnection, previous: User[] | undefined, current: User[]): Promise<void> {
    const changed = this.changedById(previous, current);
    for (const user of changed) {
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO users (public_id, openid, nickname, avatar_url, role, level, is_official, official_org,
           official_base_role, official_base_level, status, muted_until, status_reason, deleted_at,
           school, school_selected_at, admitted_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), openid = VALUES(openid),
           nickname = VALUES(nickname), avatar_url = VALUES(avatar_url), role = VALUES(role),
           level = VALUES(level), is_official = VALUES(is_official), official_org = VALUES(official_org),
           official_base_role = VALUES(official_base_role), official_base_level = VALUES(official_base_level),
           status = VALUES(status), muted_until = VALUES(muted_until), status_reason = VALUES(status_reason),
           deleted_at = VALUES(deleted_at), school = VALUES(school),
           school_selected_at = VALUES(school_selected_at), admitted_at = VALUES(admitted_at)`,
        [
          user.id,
          user.openid || null,
          user.nickname || '',
          user.avatar || '',
          user.role || 'student',
          user.level || 'L1',
          user.isOfficial || user.role === 'official' ? 1 : 0,
          user.officialOrg || null,
          user.officialBaseRole || null,
          user.officialBaseLevel || null,
          user.status || 'active',
          asSqlDate(user.mutedUntil) || null,
          user.statusReason || null,
          asSqlDate(user.deletedAt) || null,
          user.school || null,
          asSqlDate(user.schoolSelectedAt) || null,
          asSqlDate(user.admittedAt) || null,
          asSqlDate(user.createdAt) || asSqlDate(nowIso())
        ]
      );
      this.userIds.set(user.id, Number(result.insertId));
    }
  }

  private async syncTopics(connection: PoolConnection, previous: Topic[] | undefined, current: Topic[]): Promise<void> {
    for (const topic of this.changedById(previous, current)) {
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO topics (public_id, name, emoji, count) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), name = VALUES(name), emoji = VALUES(emoji), count = VALUES(count)`,
        [topic.id, topic.name, topic.emoji || null, asNumber(topic.count)]
      );
      this.topicIds.set(topic.id, Number(result.insertId));
      this.topicIdsByName.set(topic.name, Number(result.insertId));
      this.topicPublicIdsByName.set(topic.name, topic.id);
    }
  }

  private async ensureLocation(connection: PoolConnection, name: string | undefined): Promise<number | null> {
    if (!name) return null;
    const existing = this.locationIds.get(name);
    if (existing) return existing;
    const [result] = await connection.query<ResultSetHeader>(
      'INSERT INTO locations (name) VALUES (?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)',
      [name]
    );
    const id = Number(result.insertId);
    this.locationIds.set(name, id);
    return id;
  }

  private async ensureTopic(connection: PoolConnection, name: string | undefined): Promise<number | null> {
    if (!name) return null;
    const existing = this.topicIdsByName.get(name);
    if (existing) return existing;
    const publicId = this.topicPublicIdsByName.get(name) || `topic_${createHash('sha1').update(name).digest('hex').slice(0, 16)}`;
    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO topics (public_id, name, emoji, count) VALUES (?, ?, NULL, 0)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [publicId, name]
    );
    const id = Number(result.insertId);
    this.topicIds.set(publicId, id);
    this.topicIdsByName.set(name, id);
    this.topicPublicIdsByName.set(name, publicId);
    return id;
  }

  private async syncPosts(
    connection: PoolConnection,
    previous: Array<Omit<Post, 'likedBy' | 'favoritedBy'> & { likedBy: string[]; favoritedBy: string[] }> | undefined,
    current: Array<Omit<Post, 'likedBy' | 'favoritedBy'> & { likedBy: string[]; favoritedBy: string[] }>,
    _comments: Comment[]
  ): Promise<void> {
    const previousMap = new Map((previous || []).map((post) => [post.id, post]));
    const currentMap = new Map(current.map((post) => [post.id, post]));
    for (const post of previous || []) {
      if (!currentMap.has(post.id)) await this.deletePostCascade(connection, post.id);
    }
    for (const post of current) {
      if (previousMap.has(post.id) && sameJson(previousMap.get(post.id), post)) continue;
      const authorId = this.userIds.get(post.authorId);
      if (!authorId) throw new Error(`MYSQL_POST_AUTHOR_MISSING:${post.id}`);
      const topicId = await this.ensureTopic(connection, post.topic);
      const locationId = await this.ensureLocation(connection, post.location);
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO posts (public_id, author_id, text, topic_id, location_id, latitude, longitude,
           anonymity, anonymous_alias, status, risk_level, featured, comments_enabled,
           like_count, favorite_count, share_count, comment_count,
           unique_viewers, unique_commenters, heat_score, published_at, pinned_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), author_id = VALUES(author_id), text = VALUES(text),
           topic_id = VALUES(topic_id), location_id = VALUES(location_id), latitude = VALUES(latitude),
           longitude = VALUES(longitude), anonymity = VALUES(anonymity),
           anonymous_alias = VALUES(anonymous_alias), status = VALUES(status), risk_level = VALUES(risk_level),
           featured = VALUES(featured), comments_enabled = VALUES(comments_enabled), like_count = VALUES(like_count),
           favorite_count = VALUES(favorite_count), share_count = VALUES(share_count), comment_count = VALUES(comment_count),
           unique_viewers = VALUES(unique_viewers), unique_commenters = VALUES(unique_commenters),
           heat_score = VALUES(heat_score), published_at = VALUES(published_at), pinned_at = VALUES(pinned_at)`,
        [
          post.id,
          authorId,
          post.text,
          topicId,
          locationId,
          post.latitude ?? null,
          post.longitude ?? null,
          post.anonymity ? 1 : 0,
          post.anonymousAlias || null,
          post.status,
          post.risk,
          post.featured ? 1 : 0,
          post.commentsEnabled ? 1 : 0,
          post.likeCount,
          post.favoriteCount,
          post.shareCount,
          post.commentCount,
          post.uniqueViewers,
          post.uniqueCommenters,
          post.heatScore,
          asSqlDate(post.publishedAt),
          asSqlDate(post.pinnedAt),
          asSqlDate(post.createdAt) || asSqlDate(nowIso())
        ]
      );
      const postId = Number(result.insertId);
      this.postIds.set(post.id, postId);
      await connection.query(
        `INSERT INTO post_metrics (post_id, unique_viewers, unique_commenters, heat_score, calculated_at)
         VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE unique_viewers = VALUES(unique_viewers),
           unique_commenters = VALUES(unique_commenters), heat_score = VALUES(heat_score),
           calculated_at = VALUES(calculated_at)`,
        [postId, post.uniqueViewers, post.uniqueCommenters, post.heatScore]
      );
    }
  }

  private async deletePostCascade(connection: PoolConnection, publicId: string): Promise<void> {
    const postId = this.postIds.get(publicId);
    if (!postId) return;
    await connection.query('DELETE FROM reactions WHERE target_type = ? AND target_id = ?', ['post', postId]);
    await connection.query('DELETE FROM post_viewers WHERE post_id = ?', [postId]);
    await connection.query('DELETE FROM post_metrics WHERE post_id = ?', [postId]);
    await connection.query('DELETE FROM post_media WHERE post_id = ?', [postId]);
    await connection.query('DELETE FROM comments WHERE post_id = ?', [postId]);
    await connection.query('DELETE FROM reports WHERE target_type = ? AND target_id = ?', ['post', postId]);
    await connection.query('DELETE FROM moderation_cases WHERE target_type = ? AND target_id = ?', ['post', postId]);
    await connection.query('DELETE FROM posts WHERE id = ?', [postId]);
    this.postIds.delete(publicId);
  }

  private async syncMedia(
    connection: PoolConnection,
    previous: Media[] | undefined,
    current: Media[],
    posts: Array<Omit<Post, 'likedBy' | 'favoritedBy'> & { likedBy: string[]; favoritedBy: string[] }>
  ): Promise<void> {
    const postByMedia = new Map<string, string>();
    for (const post of posts) for (const media of post.media || []) postByMedia.set(media.id, post.id);
    const changed = this.changedById(previous, current);
    const changedIds = new Set(changed.map((item) => item.id));
    const currentIds = new Set(current.map((item) => item.id));
    for (const media of previous || []) {
      if (currentIds.has(media.id)) continue;
      const dbId = this.mediaIds.get(media.id);
      if (dbId) await connection.query('DELETE FROM post_media WHERE id = ?', [dbId]);
      this.mediaIds.delete(media.id);
      this.mediaPostIds.delete(media.id);
      this.mediaSorts.delete(media.id);
    }
    for (const media of current) {
      const postPublicId = postByMedia.get(media.id);
      const postId = postPublicId ? this.postIds.get(postPublicId) ?? null : null;
      const sort = postPublicId
        ? Math.max(0, (posts.find((post) => post.id === postPublicId)?.media || []).findIndex((item) => item.id === media.id))
        : 0;
      const relationUnchanged = this.mediaPostIds.has(media.id)
        ? this.mediaPostIds.get(media.id) === postId && (this.mediaSorts.get(media.id) ?? 0) === sort
        : false;
      if (!changedIds.has(media.id) && relationUnchanged) continue;
      const ownerId = media.ownerId ? this.userIds.get(media.ownerId) ?? null : null;
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO post_media (public_id, post_id, owner_id, url, thumb_url, object_key, mime, width, height,
           sort, moderation_status, storage, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'image/jpeg', ?, ?, ?, 'approved', ?, UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), post_id = VALUES(post_id), owner_id = VALUES(owner_id),
           url = VALUES(url), thumb_url = VALUES(thumb_url), object_key = VALUES(object_key),
           width = VALUES(width), height = VALUES(height), sort = VALUES(sort), storage = VALUES(storage)`,
        [
          media.id,
          postId,
          ownerId,
          media.url || '',
          media.thumbUrl || null,
          media.objectKey || null,
          asNumber(media.width),
          asNumber(media.height),
          sort,
          media.storage || 'local'
        ]
      );
      this.mediaIds.set(media.id, Number(result.insertId));
      this.mediaPostIds.set(media.id, postId);
      this.mediaSorts.set(media.id, sort);
    }
  }

  private async syncComments(connection: PoolConnection, previous: Comment[] | undefined, current: Comment[]): Promise<void> {
    const changed = this.changedById(previous, current);
    const currentIds = new Set(current.map((item) => item.id));
    for (const comment of previous || []) {
      if (currentIds.has(comment.id)) continue;
      const dbId = this.commentIds.get(comment.id);
      if (dbId) {
        await connection.query('DELETE FROM reactions WHERE target_type = ? AND target_id = ?', ['comment', dbId]);
        await connection.query('DELETE FROM reports WHERE target_type = ? AND target_id = ?', ['comment', dbId]);
        await connection.query('DELETE FROM moderation_cases WHERE target_type = ? AND target_id = ?', ['comment', dbId]);
        await connection.query('DELETE FROM comments WHERE id = ?', [dbId]);
      }
      this.commentIds.delete(comment.id);
    }
    for (const comment of changed) {
      const postId = this.postIds.get(comment.postId);
      const authorId = this.userIds.get(comment.authorId);
      if (!postId || !authorId) throw new Error(`MYSQL_COMMENT_RELATION_MISSING:${comment.id}`);
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO comments (public_id, post_id, author_id, root_id, parent_id, reply_to_user_id, text,
           anonymity, anonymous_alias, status, risk_level, like_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), post_id = VALUES(post_id), author_id = VALUES(author_id),
           root_id = VALUES(root_id), parent_id = VALUES(parent_id), reply_to_user_id = VALUES(reply_to_user_id),
           text = VALUES(text), anonymity = VALUES(anonymity), anonymous_alias = VALUES(anonymous_alias),
           status = VALUES(status), risk_level = VALUES(risk_level), like_count = VALUES(like_count)`,
        [
          comment.id,
          postId,
          authorId,
          comment.rootId ? this.commentIds.get(comment.rootId) ?? null : null,
          comment.parentId ? this.commentIds.get(comment.parentId) ?? null : null,
          comment.replyToUserId ? this.userIds.get(comment.replyToUserId) ?? null : null,
          comment.text,
          comment.anonymity ? 1 : 0,
          comment.anonymousAlias || null,
          comment.status,
          comment.risk,
          comment.likeCount,
          asSqlDate(comment.createdAt) || asSqlDate(nowIso())
        ]
      );
      this.commentIds.set(comment.id, Number(result.insertId));
    }
  }

  private async syncReactions(
    connection: PoolConnection,
    previous: Array<Omit<Post, 'likedBy' | 'favoritedBy'> & { likedBy: string[]; favoritedBy: string[] }> | undefined,
    current: Array<Omit<Post, 'likedBy' | 'favoritedBy'> & { likedBy: string[]; favoritedBy: string[] }>
  ): Promise<void> {
    const previousMap = new Map((previous || []).map((post) => [post.id, post]));
    for (const post of current) {
      const postId = this.postIds.get(post.id);
      if (!postId) continue;
      const old = previousMap.get(post.id);
      if (old && sameJson(old, post)) continue;
      for (const [kind, field] of [['like', 'likedBy'], ['favorite', 'favoritedBy']] as const) {
        const oldSet = new Set((old?.[field] as string[] | undefined) || []);
        const newSet = new Set(post[field] as string[]);
        for (const userId of newSet) {
          if (oldSet.has(userId)) continue;
          const dbUserId = this.userIds.get(userId);
          if (dbUserId) {
            await connection.query(
              `INSERT IGNORE INTO reactions (user_id, target_type, target_id, kind) VALUES (?, 'post', ?, ?)`,
              [dbUserId, postId, kind]
            );
          }
        }
        for (const userId of oldSet) {
          if (newSet.has(userId)) continue;
          const dbUserId = this.userIds.get(userId);
          if (dbUserId) {
            await connection.query(
              `DELETE FROM reactions WHERE user_id = ? AND target_type = 'post' AND target_id = ? AND kind = ?`,
              [dbUserId, postId, kind]
            );
          }
        }
      }
    }
  }

  private async syncNotices(connection: PoolConnection, previous: Notice[] | undefined, current: Notice[]): Promise<void> {
    const changed = this.changedById(previous, current);
    const currentIds = new Set(current.map((item) => item.id));
    for (const notice of previous || []) {
      if (!currentIds.has(notice.id)) {
        const dbId = this.noticeIds.get(notice.id);
        if (dbId) await connection.query('DELETE FROM notices WHERE id = ?', [dbId]);
        this.noticeIds.delete(notice.id);
      }
    }
    for (const notice of changed) {
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO notices (public_id, publisher_id, source, type, title, body, pinned, priority,
           effective_from, effective_to, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), source = VALUES(source), type = VALUES(type),
           title = VALUES(title), body = VALUES(body), pinned = VALUES(pinned), priority = VALUES(priority),
           effective_from = VALUES(effective_from), effective_to = VALUES(effective_to), status = VALUES(status)`,
        [
          notice.id,
          this.adminUserId || 0,
          notice.source || '',
          notice.type,
          notice.title,
          notice.body,
          notice.pinned ? 1 : 0,
          notice.type === 'emergency' ? 1 : 5,
          asSqlDate(notice.effectiveFrom),
          asSqlDate(notice.effectiveTo),
          notice.status,
          asSqlDate(notice.createdAt) || asSqlDate(nowIso())
        ]
      );
      this.noticeIds.set(notice.id, Number(result.insertId));
    }
    const now = Date.now();
    const activeEmergency = current.find((notice) =>
      notice.type === 'emergency'
      && notice.status === 'published'
      && notice.pinned
      && (!notice.effectiveTo || new Date(notice.effectiveTo).getTime() > now)
    );
    const activeId = activeEmergency ? this.noticeIds.get(activeEmergency.id) ?? null : null;
    await connection.query(
      'UPDATE notice_slot SET active_notice_id = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = 1',
      [activeId]
    );
  }

  private async syncReports(connection: PoolConnection, previous: Report[] | undefined, current: Report[]): Promise<void> {
    const changed = this.changedById(previous, current);
    const currentIds = new Set(current.map((item) => item.id));
    for (const report of previous || []) {
      if (!currentIds.has(report.id)) {
        const dbId = this.reportIds.get(report.id);
        if (dbId) await connection.query('DELETE FROM reports WHERE id = ?', [dbId]);
        this.reportIds.delete(report.id);
      }
    }
    for (const report of changed) {
      const reporterId = this.userIds.get(report.reporterId);
      if (!reporterId) continue;
      const targetId = this.resolveTargetId(report.targetType, report.targetId);
      const ai = report.ai;
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO reports
           (public_id, reporter_id, target_type, target_id, reason_code, detail, status,
            ai_decision, ai_reason, ai_evidence, ai_confidence, ai_checked_at, handled_by, handled_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), reporter_id = VALUES(reporter_id),
           target_type = VALUES(target_type), target_id = VALUES(target_id), reason_code = VALUES(reason_code),
           detail = VALUES(detail), status = VALUES(status), ai_decision = VALUES(ai_decision),
           ai_reason = VALUES(ai_reason), ai_evidence = VALUES(ai_evidence),
           ai_confidence = VALUES(ai_confidence), ai_checked_at = VALUES(ai_checked_at),
           handled_by = VALUES(handled_by), handled_at = VALUES(handled_at)`,
        [
          report.id,
          reporterId,
          report.targetType,
          targetId,
          report.reason,
          report.detail || null,
          report.status,
          ai?.decision || null,
          ai?.reason?.slice(0, 500) || null,
          ai ? JSON.stringify(ai.evidence.slice(0, 8)) : null,
          ai ? ai.confidence : null,
          ai ? asSqlDate(ai.checkedAt) : null,
          report.handledById ? Number(report.handledById) : null,
          asSqlDate(report.handledAt),
          asSqlDate(report.createdAt) || asSqlDate(nowIso())
        ]
      );
      this.reportIds.set(report.id, Number(result.insertId));
    }
  }

  private async syncNotifications(
    connection: PoolConnection,
    previous: Notification[] | undefined,
    current: Notification[]
  ): Promise<void> {
    const changed = this.changedById(previous, current);
    const currentIds = new Set(current.map((item) => item.id));
    for (const notification of previous || []) {
      if (!currentIds.has(notification.id)) {
        const dbId = this.notificationIds.get(notification.id);
        if (dbId) await connection.query('DELETE FROM notifications WHERE id = ?', [dbId]);
        this.notificationIds.delete(notification.id);
      }
    }
    for (const notification of changed) {
      const userId = this.userIds.get(notification.userId);
      if (!userId) continue;
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO notifications (public_id, user_id, type, title, body, link, read_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), user_id = VALUES(user_id), type = VALUES(type),
           title = VALUES(title), body = VALUES(body), link = VALUES(link), read_at = VALUES(read_at)`,
        [
          notification.id,
          userId,
          notification.type,
          notification.title,
          notification.body,
          notification.link || null,
          notification.read ? asSqlDate(nowIso()) : null,
          asSqlDate(notification.createdAt) || asSqlDate(nowIso())
        ]
      );
      this.notificationIds.set(notification.id, Number(result.insertId));
    }
  }

  private async syncCases(
    connection: PoolConnection,
    previous: ModerationCase[] | undefined,
    current: ModerationCase[]
  ): Promise<void> {
    const changed = this.changedById(previous, current);
    const currentIds = new Set(current.map((item) => item.id));
    for (const item of previous || []) {
      if (!currentIds.has(item.id)) {
        const dbId = this.caseIds.get(item.id);
        if (dbId) await connection.query('DELETE FROM moderation_cases WHERE id = ?', [dbId]);
        this.caseIds.delete(item.id);
      }
    }
    for (const item of changed) {
      const targetId = this.resolveTargetId(item.targetType, item.targetId);
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO moderation_cases (public_id, target_type, target_id, status, priority, risk_score,
           machine_labels, labels, evidence, reviews_json, reason_text, decision, decided_by_label, decided_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), target_type = VALUES(target_type),
           target_id = VALUES(target_id), status = VALUES(status), priority = VALUES(priority),
           risk_score = VALUES(risk_score), machine_labels = VALUES(machine_labels), labels = VALUES(labels),
           evidence = VALUES(evidence), reviews_json = VALUES(reviews_json), reason_text = VALUES(reason_text),
           decision = VALUES(decision), decided_by_label = VALUES(decided_by_label), decided_at = VALUES(decided_at)`,
        [
          item.id,
          item.targetType,
          targetId,
          item.status,
          item.risk,
          riskScore(item.risk),
          JSON.stringify(item.labels),
          JSON.stringify(item.labels),
          JSON.stringify(item.evidence),
          item.reviews?.length ? JSON.stringify(item.reviews) : null,
          item.reason || null,
          item.status,
          item.decidedBy || null,
          asSqlDate(item.decidedAt),
          asSqlDate(item.createdAt) || asSqlDate(nowIso())
        ]
      );
      this.caseIds.set(item.id, Number(result.insertId));
    }
  }

  private async syncAppeals(
    connection: PoolConnection,
    previous: Appeal[] | undefined,
    current: Appeal[]
  ): Promise<void> {
    const changed = this.changedById(previous, current);
    const currentIds = new Set(current.map((item) => item.id));
    for (const item of previous || []) {
      if (!currentIds.has(item.id)) {
        const dbId = this.appealIds.get(item.id);
        if (dbId) await connection.query('DELETE FROM appeals WHERE id = ?', [dbId]);
        this.appealIds.delete(item.id);
      }
    }
    for (const item of changed) {
      const userId = this.userIds.get(item.userId);
      const targetId = this.resolveTargetId(item.targetType, item.targetId);
      if (!userId || !targetId) continue;
      const values = [
        item.id,
        userId,
        item.targetType,
        targetId,
        item.reason,
        item.status,
        item.decisionReason || null,
        item.handledBy || null,
        item.handledAt ? asSqlDate(item.handledAt) : null
      ];
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO appeals (public_id, user_id, target_type, target_id, reason, status,
          decision_reason, handled_by, handled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          reason = VALUES(reason), status = VALUES(status), decision_reason = VALUES(decision_reason),
          handled_by = VALUES(handled_by), handled_at = VALUES(handled_at)`,
        values
      );
      if (result.insertId) this.appealIds.set(item.id, Number(result.insertId));
    }
  }

  private async syncOfficialAccounts(
    connection: PoolConnection,
    previous: OfficialAccount[] | undefined,
    current: OfficialAccount[]
  ): Promise<void> {
    const changed = this.changedById(previous, current);
    const currentIds = new Set(current.map((item) => item.id));
    for (const item of previous || []) {
      if (!currentIds.has(item.id)) {
        const dbId = this.officialIds.get(item.id);
        if (dbId) await connection.query('DELETE FROM official_accounts WHERE id = ?', [dbId]);
        this.officialIds.delete(item.id);
      }
    }
    for (const item of changed) {
      const userId = this.userIds.get(item.userId);
      if (!userId) continue;
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO official_accounts (public_id, user_id, school_id, org_name, org_id,
           authorization_file_key, authorization_file_name, authorization_mime, authorization_size, authorization_requested_at,
           scope, status, school_reviewed_by, school_reviewed_at, reviewed_by, platform_reviewed_at,
           effective_at, expires_at, last_reviewed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), user_id = VALUES(user_id), org_name = VALUES(org_name),
           org_id = VALUES(org_id), authorization_file_key = VALUES(authorization_file_key),
           authorization_file_name = VALUES(authorization_file_name), authorization_mime = VALUES(authorization_mime),
           authorization_size = VALUES(authorization_size), authorization_requested_at = VALUES(authorization_requested_at),
           scope = VALUES(scope), status = VALUES(status),
           school_reviewed_by = VALUES(school_reviewed_by), school_reviewed_at = VALUES(school_reviewed_at),
           reviewed_by = VALUES(reviewed_by), platform_reviewed_at = VALUES(platform_reviewed_at),
           effective_at = VALUES(effective_at), expires_at = VALUES(expires_at),
           last_reviewed_at = VALUES(last_reviewed_at)`,
        [
          item.id,
          userId,
          item.schoolId || 'campus',
          item.orgName,
          item.orgId || null,
          item.authorizationFile || null,
          item.authorizationFileName || null,
          item.authorizationMime || null,
          item.authorizationSize || null,
          asSqlDate(item.authorizationRequestedAt) || null,
          JSON.stringify(item.scope),
          item.status,
          item.schoolReviewedById || null,
          asSqlDate(item.schoolReviewedAt) || null,
          item.platformReviewedById || null,
          asSqlDate(item.platformReviewedAt) || null,
          asSqlDate(item.effectiveAt) || null,
          asSqlDate(item.expiresAt) || null,
          asSqlDate(item.platformReviewedAt || item.schoolReviewedAt) || null,
          asSqlDate(item.createdAt) || asSqlDate(nowIso())
        ]
      );
      this.officialIds.set(item.id, Number(result.insertId));
    }
  }

  private async syncRanking(
    connection: PoolConnection,
    previous: RankingConfig | undefined,
    current: RankingConfig
  ): Promise<void> {
    if (previous && sameJson(previous, current)) return;
    await connection.query(
      `INSERT INTO ranking_config (id, config) VALUES (1, ?)
       ON DUPLICATE KEY UPDATE config = VALUES(config)`,
      [JSON.stringify(current)]
    );
  }

  private async syncSessions(
    connection: PoolConnection,
    previous: StoreSnapshot | null,
    current: StoreSnapshot
  ): Promise<void> {
    const previousSessions = new Map(previous?.sessions || []);
    const currentSessions = new Map(current.sessions || []);
    const currentExpiry = new Map(current.sessionExpiry || []);
    for (const [token, userId] of previousSessions) {
      if (currentSessions.has(token)) continue;
      await connection.query('DELETE FROM user_sessions WHERE token_hash = ?', [token]);
      void userId;
    }
    for (const [token, userId] of currentSessions) {
      if (previousSessions.get(token) === userId && previous?.sessionExpiry?.some(([key, value]) => key === token && value === currentExpiry.get(token))) continue;
      const dbUserId = this.userIds.get(userId);
      if (!dbUserId) continue;
      const expiresAt = currentExpiry.get(token) || Date.now() + 30 * 24 * 3600 * 1000;
      await connection.query(
        `INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), expires_at = VALUES(expires_at)`,
        [token, dbUserId, new Date(expiresAt).toISOString().slice(0, 23).replace('T', ' ')]
      );
    }
    await connection.query('DELETE FROM user_sessions WHERE expires_at <= UTC_TIMESTAMP(3)');

    const previousAdmin = new Map(previous?.adminSessions || []);
    const currentAdmin = new Map(current.adminSessions || []);
    const currentAdminExpiry = new Map(current.adminSessionExpiry || []);
    for (const [token] of previousAdmin) {
      if (currentAdmin.has(token)) continue;
      await connection.query('DELETE FROM admin_sessions WHERE token_hash = ?', [token]);
    }
    for (const [token, subject] of currentAdmin) {
      if (previousAdmin.get(token) === subject && previous?.adminSessionExpiry?.some(([key, value]) => key === token && value === currentAdminExpiry.get(token))) continue;
      const expiresAt = currentAdminExpiry.get(token) || Date.now() + 12 * 3600 * 1000;
      await connection.query(
        `INSERT INTO admin_sessions (token_hash, subject, expires_at) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE subject = VALUES(subject), expires_at = VALUES(expires_at)`,
        [token, subject, new Date(expiresAt).toISOString().slice(0, 23).replace('T', ' ')]
      );
    }
    await connection.query('DELETE FROM admin_sessions WHERE expires_at <= UTC_TIMESTAMP(3)');
  }

  private async syncViewers(
    connection: PoolConnection,
    previous: Array<[string, string[]]> | undefined,
    current: Array<[string, string[]]>
  ): Promise<void> {
    const previousMap = new Map((previous || []).map(([postId, viewers]) => [postId, new Set(viewers)]));
    const currentMap = new Map(current.map(([postId, viewers]) => [postId, new Set(viewers)]));
    for (const [postPublicId, viewers] of currentMap) {
      const postId = this.postIds.get(postPublicId);
      if (!postId) continue;
      const old = previousMap.get(postPublicId) ?? new Set<string>();
      for (const viewer of viewers) {
        if (old.has(viewer)) continue;
        await connection.query(
          'INSERT IGNORE INTO post_viewers (post_id, viewer_key) VALUES (?, ?)',
          [postId, String(viewer).slice(0, 191)]
        );
      }
      for (const viewer of old) {
        if (viewers.has(viewer)) continue;
        await connection.query('DELETE FROM post_viewers WHERE post_id = ? AND viewer_key = ?', [postId, String(viewer).slice(0, 191)]);
      }
    }
    for (const [postPublicId] of previousMap) {
      if (currentMap.has(postPublicId)) continue;
      const postId = this.postIds.get(postPublicId);
      if (postId) await connection.query('DELETE FROM post_viewers WHERE post_id = ?', [postId]);
    }
  }

  private resolveTargetId(targetType: string, publicId: string): number {
    if (targetType === 'comment') return this.commentIds.get(publicId) ?? 0;
    if (targetType === 'user') return this.userIds.get(publicId) ?? 0;
    return this.postIds.get(publicId) ?? 0;
  }

  private changedById<T extends { id: string }>(previous: T[] | undefined, current: T[]): T[] {
    const previousMap = new Map((previous || []).map((item) => [item.id, item]));
    return current.filter((item) => !previousMap.has(item.id) || !sameJson(previousMap.get(item.id), item));
  }
}
