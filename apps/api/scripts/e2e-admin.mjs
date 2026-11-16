import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { generateSync } from 'otplib';

const BASE = process.env.API_BASE || 'http://127.0.0.1:3000/api/v1';
const STATE_PATH = path.join(process.cwd(), 'data', 'e2e-admin-state.json');
const phase = process.argv[2] || 'create';

const db = await mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'campus',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'campus',
  connectionLimit: 4
});

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

function readState() {
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function writeState(value) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(value, null, 2));
}

async function api(endpoint, { method = 'GET', token, adminToken, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers['x-user-token'] = token;
  if (adminToken) headers['x-admin-token'] = adminToken;
  const response = await fetch(`${BASE}${endpoint}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) {
    throw new Error(`${method} ${endpoint} -> ${response.status}: ${text.slice(0, 500)}`);
  }
  return payload;
}

async function loginUser() {
  const result = await api('/auth/wechat/login', { method: 'POST', body: { code: 'e2e-admin-user' } });
  return result.data.token;
}

async function loginAdmin() {
  const secret = process.env.ADMIN_TOTP_SECRET;
  const totp = secret
    ? generateSync({ secret })
    : (process.env.ADMIN_TOTP || '');
  const result = await api('/admin/auth/login', {
    method: 'POST',
    body: {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      totp
    }
  });
  return result.data.token;
}

async function waitFor(label, fn, timeout = 8000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`TIMEOUT: ${label}${lastError ? ` (${lastError.message})` : ''}`);
}

async function one(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows[0];
}

async function createPhase() {
  if (fs.existsSync(STATE_PATH)) throw new Error(`state exists: ${STATE_PATH}; run check-clean/verify first`);

  const adminToken = await loginAdmin();
  const userToken = await loginUser();
  const dashboard = (await api('/admin/dashboard', { adminToken })).data;
  const userCount = Number((await one('SELECT COUNT(*) AS n FROM users')).n);
  assert(dashboard.registered === userCount, `dashboard registered ${dashboard.registered} != users ${userCount}`);

  const created = (await api('/posts', {
    method: 'POST', token: userToken,
    body: { text: `E2E 管理业务测试 ${new Date().toISOString()}`, anonymity: false, commentsEnabled: true }
  })).data;
  const postId = created.post.id;
  if (created.post.status !== 'published') {
    const queue = (await api('/admin/moderation/queue', { adminToken })).data;
    const postCase = queue.find((item) => item.targetType === 'post' && item.targetId === postId && item.status === 'pending');
    assert(!!postCase, `pending post has no moderation case (${created.post.status})`);
    await api(`/admin/moderation/${postCase.id}/decision`, {
      method: 'POST', adminToken,
      body: { decision: 'approved', reason: 'E2E 管理测试：测试帖审核通过' }
    });
    const detail = (await api(`/posts/${postId}`, { token: userToken })).data;
    assert(detail.post?.status === 'published', `approved post status ${detail.post?.status}`);
  }

  const risky = (await api(`/posts/${postId}/comments`, {
    method: 'POST', token: userToken,
    body: { text: '我要杀了你', anonymity: false }
  })).data;
  const commentId = risky.comment.id;
  assert(risky.comment.status === 'pending', `risky comment status ${risky.comment.status}`);

  const queue = (await api('/admin/moderation/queue', { adminToken })).data;
  const moderationCase = queue.find((item) => item.targetType === 'comment' && item.targetId === commentId && item.status === 'pending');
  assert(!!moderationCase, 'risky comment case not in queue');
  await api(`/admin/moderation/${moderationCase.id}/decision`, {
    method: 'POST', adminToken,
    body: { decision: 'rejected', reason: 'E2E 管理测试：评论内容违规' }
  });

  const report = (await api('/reports', {
    method: 'POST', token: userToken,
    body: { targetType: 'post', targetId: postId, reason: 'E2E 管理测试举报', detail: '自动化测试数据' }
  })).data;
  const reportId = report.id;
  const reportStatus = report.status;

  const notice = (await api('/admin/notices', {
    method: 'POST', adminToken,
    body: {
      title: `E2E 管理通知 ${Date.now()}`,
      body: '这是一条自动化测试通知，验证 MySQL 持久化。',
      type: 'normal',
      source: 'E2E测试',
      effectiveTo: new Date(Date.now() + 86400000).toISOString()
    }
  })).data;

  const officialList = (await api('/admin/official-accounts', { adminToken })).data;
  const official = officialList.find((item) => item.id === 'oa_club') || officialList[0];
  assert(!!official, 'official account missing');
  const originalOfficialStatus = official.status;
  await api(`/admin/official-accounts/${official.id}/review`, {
    method: 'POST', adminToken, body: { status: 'active' }
  });

  const originalRanking = (await api('/admin/ranking/config', { adminToken })).data;
  const modifiedRanking = { ...originalRanking, likeWeight: Number((Number(originalRanking.likeWeight) + 0.01).toFixed(4)) };
  await api('/admin/ranking/config', { method: 'PUT', adminToken, body: { likeWeight: modifiedRanking.likeWeight } });

  const noticeRow = await waitFor('notice row', async () => one('SELECT id,status FROM notices WHERE public_id = ?', [notice.id]));
  assert(noticeRow.status === 'published', `notice status ${noticeRow.status}`);
  const caseRow = await waitFor('moderation case row', async () => one('SELECT id,status FROM moderation_cases WHERE public_id = ?', [moderationCase.id]));
  assert(caseRow.status === 'rejected', `case status ${caseRow.status}`);
  const reportRow = await waitFor('report row', async () => one('SELECT id,status FROM reports WHERE public_id = ?', [reportId]));
  assert(reportRow.status === reportStatus, `report status ${reportRow.status}`);
  const commentRow = await waitFor('comment row', async () => one('SELECT status FROM comments WHERE public_id = ?', [commentId]));
  assert(commentRow.status === 'hidden', `comment status ${commentRow.status}`);
  const officialRow = await waitFor('official active', async () => {
    const row = await one('SELECT status FROM official_accounts WHERE public_id = ?', [official.id]);
    return row?.status === 'active' ? row : null;
  });
  assert(officialRow.status === 'active', `official status ${officialRow.status}`);
  const rankingRow = await waitFor('ranking persisted', async () => {
    const row = await one('SELECT config FROM ranking_config WHERE id = 1');
    const stored = typeof row?.config === 'string' ? JSON.parse(row.config) : row?.config;
    return Number(stored?.likeWeight) === modifiedRanking.likeWeight ? row : null;
  });
  const storedRanking = typeof rankingRow.config === 'string' ? JSON.parse(rankingRow.config) : rankingRow.config;
  assert(Number(storedRanking.likeWeight) === modifiedRanking.likeWeight, 'ranking config not persisted');

  if (reportStatus === 'pending') {
    const resolved = (await api(`/admin/reports/${reportId}/decision`, {
      method: 'POST', adminToken, body: { status: 'resolved' }
    })).data;
    assert(resolved.status === 'resolved', `resolved status ${resolved.status}`);
    await waitFor('report resolved', async () => {
      const row = await one('SELECT status FROM reports WHERE public_id = ?', [reportId]);
      return row.status === 'resolved';
    });
  }

  writeState({
    postId,
    commentId,
    caseId: moderationCase.id,
    reportId,
    reportStatus,
    noticeId: notice.id,
    officialId: official.id,
    originalOfficialStatus,
    originalRanking,
    modifiedRanking,
    createdAt: new Date().toISOString()
  });
  console.log(JSON.stringify({ phase: 'create', ok: true, postId, commentId, caseId: moderationCase.id, reportId, noticeId: notice.id }));
}

async function verifyPhase() {
  const state = readState();
  const adminToken = await loginAdmin();
  const userToken = await loginUser();

  const dashboard = (await api('/admin/dashboard', { adminToken })).data;
  assert(dashboard.registered === Number((await one('SELECT COUNT(*) AS n FROM users')).n), 'dashboard registered mismatch');

  const notices = (await api('/admin/notices', { adminToken })).data;
  assert(notices.some((item) => item.id === state.noticeId), 'notice missing after restart');

  const ranking = (await api('/admin/ranking/config', { adminToken })).data;
  const rankingMatchesModified = Number(ranking.likeWeight) === Number(state.modifiedRanking.likeWeight);
  const rankingMatchesOriginal = Number(ranking.likeWeight) === Number(state.originalRanking.likeWeight);
  assert(rankingMatchesModified || rankingMatchesOriginal, 'ranking state unexpected after restart');

  const officialList = (await api('/admin/official-accounts', { adminToken })).data;
  const official = officialList.find((item) => item.id === state.officialId);
  assert(official?.status === 'active' || official?.status === state.originalOfficialStatus, 'official state unexpected after restart');

  const queue = (await api('/admin/moderation/queue', { adminToken })).data;
  const moderationCase = queue.find((item) => item.id === state.caseId);
  assert(moderationCase?.status === 'rejected', 'moderation case missing after restart');

  const reports = (await api('/admin/reports', { adminToken })).data;
  const report = reports.find((item) => item.id === state.reportId);
  assert(report?.status === state.reportStatus, 'report status changed after restart');

  const comment = await one('SELECT status FROM comments WHERE public_id = ?', [state.commentId]);
  assert(comment?.status === 'hidden', 'comment not hidden after restart');

  const post = await one('SELECT status FROM posts WHERE public_id = ?', [state.postId]);
  assert(post?.status === 'published', 'test post missing after restart');

  await api('/admin/ranking/config', { method: 'PUT', adminToken, body: state.originalRanking });
  await api(`/admin/official-accounts/${state.officialId}/review`, {
    method: 'POST', adminToken, body: { status: state.originalOfficialStatus }
  });
  await api(`/posts/${state.postId}`, { method: 'DELETE', token: userToken });
  await db.query('DELETE FROM notices WHERE public_id = ?', [state.noticeId]);

  await waitFor('test post deleted', async () => !(await one('SELECT id FROM posts WHERE public_id = ?', [state.postId])));
  await waitFor('test case deleted', async () => !(await one('SELECT id FROM moderation_cases WHERE public_id = ?', [state.caseId])));
  await waitFor('test report deleted', async () => !(await one('SELECT id FROM reports WHERE public_id = ?', [state.reportId])));
  await waitFor('notice deleted', async () => !(await one('SELECT id FROM notices WHERE public_id = ?', [state.noticeId])));
  const rankingBack = await one('SELECT config FROM ranking_config WHERE id = 1');
  const stored = typeof rankingBack.config === 'string' ? JSON.parse(rankingBack.config) : rankingBack.config;
  assert(Number(stored.likeWeight) === Number(state.originalRanking.likeWeight), 'ranking restore failed');
  const officialBack = await one('SELECT status FROM official_accounts WHERE public_id = ?', [state.officialId]);
  assert(officialBack.status === state.originalOfficialStatus, 'official restore failed');

  state.cleanedAt = new Date().toISOString();
  writeState(state);
  console.log(JSON.stringify({ phase: 'verify', ok: true, cleaned: true }));
}

async function checkCleanPhase() {
  const state = readState();
  const adminToken = await loginAdmin();
  const notices = (await api('/admin/notices', { adminToken })).data;
  assert(!notices.some((item) => item.id === state.noticeId), 'notice still present');
  const post = await one('SELECT id FROM posts WHERE public_id = ?', [state.postId]);
  assert(!post, 'post still present');
  const moderationCase = await one('SELECT id FROM moderation_cases WHERE public_id = ?', [state.caseId]);
  assert(!moderationCase, 'case still present');
  const report = await one('SELECT id FROM reports WHERE public_id = ?', [state.reportId]);
  assert(!report, 'report still present');
  const comment = await one('SELECT id FROM comments WHERE public_id = ?', [state.commentId]);
  assert(!comment, 'comment still present');
  const notice = await one('SELECT id FROM notices WHERE public_id = ?', [state.noticeId]);
  assert(!notice, 'notice still present in db');
  const ranking = (await api('/admin/ranking/config', { adminToken })).data;
  assert(Number(ranking.likeWeight) === Number(state.originalRanking.likeWeight), 'ranking not restored');
  const officialList = (await api('/admin/official-accounts', { adminToken })).data;
  assert(officialList.find((item) => item.id === state.officialId)?.status === state.originalOfficialStatus, 'official not restored');
  fs.unlinkSync(STATE_PATH);
  console.log(JSON.stringify({ phase: 'check-clean', ok: true }));
}

try {
  if (phase === 'create') await createPhase();
  else if (phase === 'verify') await verifyPhase();
  else if (phase === 'check-clean') await checkCleanPhase();
  else throw new Error(`unknown phase: ${phase}`);
} finally {
  await db.end();
}
