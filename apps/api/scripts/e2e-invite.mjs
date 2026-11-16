import 'dotenv/config';
import { existsSync } from 'node:fs';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { generateSync } from 'otplib';

const base = 'http://127.0.0.1:3000/api/v1';
const statePath = 'data/e2e-invite-state.json';
const phase = process.argv[2] || 'create';

async function api(path, { method = 'GET', adminToken, token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (adminToken) headers['x-admin-token'] = adminToken;
  if (token) headers['x-user-token'] = token;
  const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json();
  return { status: response.status, payload };
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

async function waitFor(check, message, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`ASSERT timeout: ${message}`);
}

async function adminToken() {
  const response = await api('/admin/auth/login', {
    method: 'POST',
    body: {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      totp: generateSync({ secret: process.env.ADMIN_TOTP_SECRET })
    }
  });
  assert(response.status === 201, `admin login ${response.status}`);
  return response.payload.data.token;
}

async function userToken() {
  const response = await api('/auth/wechat/login', {
    method: 'POST',
    body: { code: 'e2e-invite' }
  });
  assert(response.status === 201, `user login ${response.status}`);
  return response.payload.data.token;
}

const db = await mysql.createConnection({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'campus',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'campus'
});

try {
  if (phase === 'create') {
    const admin = await adminToken();
    const user = await userToken();
    const stamp = Date.now().toString(36).toUpperCase();
    const code = `E2E-${stamp}`;
    const revokeCode = `REV-${stamp}`;
    const created = await api('/admin/invite-codes', { method: 'POST', adminToken: admin, body: { code, maxUses: 1 } });
    assert(created.status === 201, `create invite ${created.status}`);
    const createdRevoke = await api('/admin/invite-codes', { method: 'POST', adminToken: admin, body: { code: revokeCode, maxUses: 1 } });
    assert(createdRevoke.status === 201, `create revoke invite ${createdRevoke.status}`);

    const first = await api('/auth/invite/redeem', { method: 'POST', token: user, body: { code } });
    assert(first.status === 201 && first.payload.data.ok === true, 'first redeem succeeds');
    const second = await api('/auth/invite/redeem', { method: 'POST', token: user, body: { code } });
    assert(second.payload.data.ok === false, 'second redeem fails');

    const revoke = await api(`/admin/invite-codes/${createdRevoke.payload.data.id}/revoke`, { method: 'POST', adminToken: admin });
    assert(revoke.status === 201 && revoke.payload.data.status === 'revoked', 'revoke succeeds');
    const revokedRedeem = await api('/auth/invite/redeem', { method: 'POST', token: user, body: { code: revokeCode } });
    assert(revokedRedeem.payload.data.ok === false, 'revoked redeem fails');

    await waitFor(async () => {
      const [rows] = await db.query('SELECT id, max_uses, used_count, status FROM invite_codes WHERE id IN (?, ?) ORDER BY id', [created.payload.data.id, createdRevoke.payload.data.id]);
      return rows.length === 2 && Number(rows[0].used_count) === 1 && rows[0].status === 'used' && rows[1].status === 'revoked';
    }, 'invite rows persisted');

    const audits = await api('/admin/audit-logs?limit=20', { adminToken: admin });
    const actions = audits.payload.data.map((item) => item.action);
    assert(actions.includes('invite_code.create'), 'audit create exists');
    assert(actions.includes('invite_code.revoke'), 'audit revoke exists');

    await writeFile(statePath, JSON.stringify({
      code,
      revokeCode,
      createdId: created.payload.data.id,
      revokeId: createdRevoke.payload.data.id,
      createdAt: new Date().toISOString()
    }, null, 2));
    console.log(JSON.stringify({ phase: 'create', ok: true, createdId: created.payload.data.id, revokeId: createdRevoke.payload.data.id }));
  } else if (phase === 'verify-clean') {
    assert(existsSync(statePath), 'invite state file exists');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    const admin = await adminToken();
    const user = await userToken();
    const list = await api('/admin/invite-codes', { adminToken: admin });
    assert(list.status === 200, `list ${list.status}`);
    const row = list.payload.data.find((item) => item.id === state.createdId);
    assert(row && row.usedCount === 1 && row.status === 'used', 'used invite restored after restart');
    const revokeRow = list.payload.data.find((item) => item.id === state.revokeId);
    assert(revokeRow && revokeRow.status === 'revoked', 'revoked invite restored after restart');
    const replay = await api('/auth/invite/redeem', { method: 'POST', token: user, body: { code: state.code } });
    assert(replay.payload.data.ok === false, 'used invite still fails after restart');

    await db.query('DELETE FROM invite_codes WHERE id IN (?, ?)', [state.createdId, state.revokeId]);
    await unlink(statePath).catch(() => undefined);
    console.log(JSON.stringify({ phase: 'verify-clean', ok: true }));
  } else {
    throw new Error(`unknown phase: ${phase}`);
  }
} finally {
  await db.end();
}
