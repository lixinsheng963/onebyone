import 'dotenv/config';
import { generateSync } from 'otplib';

const base = process.env.LOAD_BASE || 'http://127.0.0.1:3001/api/v1';
const origin = process.env.LOAD_ORIGIN || base.replace(/\/api\/v1$/, '');
const total = Number(process.env.LOAD_TOTAL || 1000);
const concurrency = Number(process.env.LOAD_CONCURRENCY || 100);

async function request(path, { method = 'GET', token, adminToken, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers['x-user-token'] = token;
  if (adminToken) headers['x-admin-token'] = adminToken;
  const response = await fetch(`${path === '/healthz' ? origin : base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  return { status: response.status, text };
}

async function loginAdmin() {
  const result = await request('/admin/auth/login', {
    method: 'POST',
    body: {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      totp: generateSync({ secret: process.env.ADMIN_TOTP_SECRET })
    }
  });
  if (result.status !== 201) throw new Error(`admin login ${result.status}: ${result.text}`);
  return JSON.parse(result.text).data.token;
}

async function loginUser() {
  const result = await request('/auth/wechat/login', { method: 'POST', body: { code: 'load-test-1000' } });
  if (result.status !== 201) throw new Error(`user login ${result.status}: ${result.text}`);
  return JSON.parse(result.text).data.token;
}

async function createFixture(token, adminToken) {
  const created = await request('/posts', {
    method: 'POST',
    token,
    body: { text: '压力测试临时内容，请忽略。' }
  });
  const data = JSON.parse(created.text).data;
  let post = data.post;
  if (post.status !== 'published') {
    const queue = JSON.parse((await request('/admin/moderation/queue', { adminToken })).text).data;
    const target = queue.find((item) => item.targetType === 'post' && item.targetId === post.id);
    if (target) {
      await request(`/admin/moderation/${target.id}/decision`, {
        method: 'POST',
        adminToken,
        body: { decision: 'approved', reason: '压力测试 fixture' }
      });
    }
  }
  return post.id;
}

async function deleteFixture(id, token) {
  await request(`/posts/${id}`, { method: 'DELETE', token });
}

async function runOne(path, { method = 'GET', token, adminToken, body } = {}) {
  const durations = [];
  const statuses = new Map();
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= total) return;
      const started = performance.now();
      try {
        const result = await request(path, { method, token, adminToken, body });
        statuses.set(result.status, (statuses.get(result.status) || 0) + 1);
      } catch (error) {
        statuses.set('ERR', (statuses.get('ERR') || 0) + 1);
      }
      durations.push(performance.now() - started);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  durations.sort((a, b) => a - b);
  const pct = (p) => durations[Math.min(durations.length - 1, Math.floor((durations.length - 1) * p))];
  return {
    path: `${method} ${path}`,
    requests: durations.length,
    statuses: Object.fromEntries(statuses),
    p50: Number(pct(0.5).toFixed(1)),
    p95: Number(pct(0.95).toFixed(1)),
    p99: Number(pct(0.99).toFixed(1)),
    max: Number(durations[durations.length - 1].toFixed(1))
  };
}

const adminToken = await loginAdmin();
const userToken = await loginUser();
const fixtureId = await createFixture(userToken, adminToken);
const scenarios = [
  ['GET', '/healthz', {}],
  ['GET', '/feed?tab=latest', { token: userToken }],
  ['GET', '/feed?tab=hot', { token: userToken }],
  ['GET', '/feed?tab=featured', { token: userToken }],
  ['GET', '/topics', {}],
  ['GET', `/posts/${fixtureId}`, { token: userToken }],
  ['GET', '/me', { token: userToken }],
  ['GET', '/me/posts', { token: userToken }],
  ['GET', '/me/favorites', { token: userToken }],
  ['GET', '/me/comment-threads', { token: userToken }],
  ['GET', '/notifications', { token: userToken }],
  ['GET', '/notices', {}],
  ['GET', '/admin/dashboard', { adminToken }],
  ['GET', '/admin/official-accounts', { adminToken }],
  ['GET', '/admin/notices', { adminToken }],
  ['GET', '/admin/reports', { adminToken }],
  ['GET', '/admin/users', { adminToken }],
  ['GET', '/admin/operators', { adminToken }],
  ['GET', '/admin/audit-logs?limit=50', { adminToken }],
  ['POST', `/posts/${fixtureId}/view`, { token: userToken }],
  ['POST', `/posts/${fixtureId}/share`, {}]
];
const results = [];
for (const [method, path, options] of scenarios) {
  const result = await runOne(path, { method, ...options });
  results.push(result);
  console.log(JSON.stringify(result));
}
await deleteFixture(fixtureId, userToken);
console.log(JSON.stringify({ ok: true, fixtureId, total, concurrency, results }, null, 2));
