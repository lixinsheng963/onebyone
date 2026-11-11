/**
 * Non-destructive security smoke test.
 * Requires a running API. Uses the local demo login by default.
 *
 *   node tools/security-smoke.mjs
 */
const base = (process.env.CAMPUS_BASE_URL || 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const origin = process.env.CAMPUS_ADMIN_ORIGIN || 'http://127.0.0.1:5173';

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`ok - ${message}`);
}

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { response, body };
}

const json = (value) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value)
});

const health = await fetch(base.replace(/\/api\/v1$/, '') + '/healthz');
assert(health.status === 200, 'health endpoint is reachable');
assert(health.headers.get('x-content-type-options') === 'nosniff', 'security header X-Content-Type-Options');
assert(Boolean(health.headers.get('x-ratelimit-limit')), 'rate-limit header is present');

const evil = await fetch(base.replace(/\/api\/v1$/, '') + '/healthz', { headers: { Origin: 'https://evil.example' } });
const allowed = await fetch(base.replace(/\/api\/v1$/, '') + '/healthz', { headers: { Origin: origin } });
assert(!evil.headers.get('access-control-allow-origin'), 'untrusted origin gets no CORS allowance');
assert(allowed.headers.get('access-control-allow-origin') === origin, 'admin origin is allowed');

const unauthAdmin = await request('/admin/dashboard');
assert(unauthAdmin.response.status === 401, 'admin dashboard rejects anonymous access');

const unauthPost = await request('/posts', json({ text: 'security smoke unauth' }));
assert(unauthPost.response.status === 401, 'publishing requires authentication');

const unauthRead = await request('/notifications/noti1/read', { method: 'POST' });
assert(unauthRead.response.status === 401, 'notification read requires authentication');

const unauthAppeal = await request('/appeals', json({ reason: 'test' }));
assert(unauthAppeal.response.status === 401, 'appeal requires authentication');

const login = await request('/auth/wechat/login', json({ code: 'demo-code' }));
assert(login.response.status === 201 && login.body.data?.token, 'demo login works locally');
const userHeaders = { 'x-user-token': login.body.data.token };

const longText = await request('/posts', {
  ...json({ text: 'x'.repeat(3000) }),
  headers: { ...userHeaders, 'content-type': 'application/json' }
});
assert(longText.response.status === 400, 'oversized text is rejected');

const badFeed = await request('/feed?tab=../../etc/passwd');
assert(badFeed.response.status === 400, 'invalid feed query is rejected');

const traversal = await fetch(base.replace(/\/api\/v1$/, '') + '/uploads/../.env');
assert(traversal.status === 404, 'static path traversal is blocked');

const badForm = new FormData();
badForm.append('file', new Blob(['not-an-image'], { type: 'image/jpeg' }), 'bad.jpg');
const badUpload = await fetch(`${base}/media`, { method: 'POST', headers: userHeaders, body: badForm });
assert(badUpload.status === 400, 'non-image upload is rejected');

const created = await request('/posts', {
  ...json({ text: 'security smoke pending content 我要杀了你' }),
  headers: { ...userHeaders, 'content-type': 'application/json' }
});
assert(created.response.status === 201 && created.body.data?.post?.status === 'pending', 'threat content is held for review');
const postId = created.body.data.post.id;

const anonymousDetail = await request(`/posts/${postId}`);
assert(anonymousDetail.body.data === null, 'anonymous user cannot read pending content');
const ownerDetail = await request(`/posts/${postId}`, { headers: userHeaders });
assert(ownerDetail.body.data?.post?.publicId === postId, 'owner can read own pending content');

await request(`/posts/${postId}`, { method: 'DELETE', headers: userHeaders });
console.log('\nSecurity smoke passed.');
