#!/usr/bin/env node
/**
 * End-to-end persistence check for the normalized MySQL store.
 *
 * Usage (from apps/api):
 *   node scripts/e2e-mysql.mjs create
 *   # restart the API here
 *   node scripts/e2e-mysql.mjs verify-delete
 *   # restart the API here
 *   node scripts/e2e-mysql.mjs check-clean
 *
 * The created post is deliberately reviewed, liked, favorited, viewed,
 * commented, replied to, and reported so every normalized relation is
 * exercised. verify-delete deletes it and checks the cascade.
 */
import dotenv from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createPool } from 'mysql2/promise';
import { generateSync } from 'otplib';
import { createClient } from 'redis';

dotenv.config({ path: new URL('../.env', import.meta.url) });

const ROOT = 'http://127.0.0.1:3000';
const BASE = `${ROOT}/api/v1`;
const STATE_PATH = resolve(process.cwd(), 'data/e2e-state.json');
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const pool = createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'campus',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'campus',
  decimalNumbers: true
});

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

async function rows(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result;
}

async function api(path, options = {}) {
  const headers = {};
  if (options.token) headers['x-user-token'] = options.token;
  if (options.admin) headers['x-admin-token'] = options.admin;
  let body;
  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  const response = await fetch(`${BASE}${path}`, {
    method: options.method || 'GET',
    headers,
    body
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${options.method || 'GET'} ${path} returned non-JSON ${response.status}: ${text.slice(0, 300)}`);
  }
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${text.slice(0, 500)}`);
  }
  return payload.data;
}

async function waitFor(label, query, predicate = (value) => Boolean(value)) {
  let last;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    last = await query();
    if (predicate(last)) return last;
    await sleep(150);
  }
  throw new Error(`TIMEOUT: ${label}; last=${JSON.stringify(last)}`);
}

async function login() {
  return api('/auth/wechat/login', { method: 'POST', body: { code: `e2e-${Date.now()}` } });
}

async function clearThrottle() {
  if (process.env.REDIS_ENABLED !== 'true') return;
  const client = createClient({
    socket: {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT || 6379)
    },
    password: process.env.REDIS_PASSWORD || undefined
  });
  client.on('error', () => undefined);
  try {
    await client.connect();
    await client.del('throttle:admin:127.0.0.1');
    await client.del('throttle:user:127.0.0.1');
  } catch (error) {
    console.warn(`Redis throttle cleanup skipped: ${error.message}`);
  } finally {
    await client.quit().catch(() => undefined);
  }
}

async function adminLogin() {
  await clearThrottle();
  const totp = generateSync({ secret: process.env.ADMIN_TOTP_SECRET });
  return api('/admin/auth/login', {
    method: 'POST',
    body: {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      totp
    }
  });
}

async function uploadImage(token, relativePath) {
  const bytes = readFileSync(resolve(process.cwd(), relativePath));
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/jpeg' }), basename(relativePath));
  return api('/media', { method: 'POST', token, form });
}

async function createPhase() {
  const health = await fetch(`${ROOT}/healthz`).then((response) => response.json());
  assert(health.status === 'ok', 'API health check failed');
  const session = await login();
  assert(session.token && session.user?.id, 'demo login did not return a token/user');
  const token = session.token;

  const mediaA = await uploadImage(token, '../../apps/miniprogram/assets/images/post-1.jpg');
  const mediaB = await uploadImage(token, '../../apps/miniprogram/assets/images/post-2.jpg');
  assert(mediaA.id && mediaB.id, 'media upload did not return ids');

  const text = `E2E MySQL 持久化测试 ${new Date().toISOString()}`;
  const created = await api('/posts', {
    method: 'POST',
    token,
    body: {
      text,
      mediaIds: [mediaA.id, mediaB.id],
      topic: 'E2E 测试话题',
      location: 'E2E 测试地点',
      anonymity: false,
      commentsEnabled: true
    }
  });
  const postId = created.post.id;
  assert(postId, 'create post did not return id');
  assert(created.post.status === 'pending', `image post should be pending, got ${created.post.status}`);
  assert(created.moderation?.id, 'create post did not create a moderation case');

  const postMedia = await waitFor(
    'post_media rows',
    () => rows(
      `SELECT pm.public_id, pm.post_id, pm.sort, p.public_id AS post_public_id
       FROM post_media pm JOIN posts p ON p.id = pm.post_id
       WHERE p.public_id = ? ORDER BY pm.sort, pm.id`,
      [postId]
    ),
    (items) => items.length === 2
  );
  assert(postMedia[0].public_id === mediaA.id && postMedia[1].public_id === mediaB.id, 'post media sort/order is wrong');
  assert(Number(postMedia[0].sort) === 0 && Number(postMedia[1].sort) === 1, 'post media sort values are wrong');

  const admin = await adminLogin();
  assert(admin.token, 'admin login did not return a token');
  const approved = await api(`/admin/moderation/${created.moderation.id}/decision`, {
    method: 'POST',
    admin: admin.token,
    body: { decision: 'approved', reason: 'E2E approved' }
  });
  assert(approved.status === 'approved', 'moderation case was not approved');

  const published = await waitFor(
    'published post',
    () => api(`/posts/${postId}`, { token }),
    (item) => item?.post?.status === 'published'
  );
  assert(published.post.media.length === 2, 'approved post lost its media');
  assert(published.post.media[0].id === mediaA.id && published.post.media[1].id === mediaB.id, 'approved post media order is wrong');

  const comment = await api(`/posts/${postId}/comments`, {
    method: 'POST',
    token,
    body: { text: 'E2E 评论：测试评论持久化', anonymity: false }
  });
  assert(comment.comment?.id, 'comment was not created');
  assert(comment.comment.status === 'published', `safe comment should publish, got ${comment.comment.status}`);

  const reply = await api(`/posts/${postId}/comments`, {
    method: 'POST',
    token,
    body: { text: 'E2E 回复：测试父子关系', replyToCommentId: comment.comment.id, anonymity: false }
  });
  assert(reply.comment?.id, 'reply was not created');
  assert(reply.comment.rootId === comment.comment.id, 'reply rootId is wrong');
  assert(reply.comment.parentId === comment.comment.id, 'reply parentId is wrong');

  const liked = await api(`/posts/${postId}/like`, { method: 'POST', token });
  assert(liked.liked === true && liked.count === 1, 'like was not recorded');
  const favorited = await api(`/posts/${postId}/favorite`, { method: 'POST', token });
  assert(favorited.favorited === true && favorited.count === 1, 'favorite was not recorded');
  const viewed = await api(`/posts/${postId}/view`, { method: 'POST', token });
  assert(viewed.counted === true && viewed.uniqueViewers === 1, 'view was not recorded');

  const report = await api('/reports', {
    method: 'POST',
    token,
    body: { targetType: 'post', targetId: postId, reason: 'E2E 测试举报', detail: '自动化测试' }
  });
  assert(report.id, 'report was not created');

  const dbPost = await waitFor(
    'published DB post',
    () => rows('SELECT id, public_id, status FROM posts WHERE public_id = ?', [postId]),
    (items) => items.length === 1 && items[0].status === 'published'
  );
  const dbPostId = Number(dbPost[0].id);
  const dbComments = await waitFor(
    'comment rows flushed',
    () => rows(
      'SELECT id, public_id, root_id, parent_id, status FROM comments WHERE post_id = ? ORDER BY id',
      [dbPost[0].id]
    ),
    (items) => items.length === 2
  );
  assert(dbComments.length === 2, `expected 2 comments in MySQL, got ${dbComments.length}`);
  assert(dbComments[0].root_id === null && dbComments[0].parent_id === null, 'root comment relationships are wrong');
  assert(Number(dbComments[1].root_id) === Number(dbComments[0].id), 'reply root_id is wrong in MySQL');
  assert(Number(dbComments[1].parent_id) === Number(dbComments[0].id), 'reply parent_id is wrong in MySQL');
  const dbReactions = await rows(
    "SELECT user_id, target_type, target_id, kind FROM reactions WHERE target_type = 'post' AND target_id = ? ORDER BY kind",
    [dbPost[0].id]
  );
  assert(dbReactions.length === 2, `expected 2 reactions in MySQL, got ${dbReactions.length}`);
  const dbViewers = await rows('SELECT viewer_key FROM post_viewers WHERE post_id = ?', [dbPost[0].id]);
  assert(dbViewers.length === 1, `expected 1 viewer in MySQL, got ${dbViewers.length}`);
  const dbReports = await rows(
    "SELECT id, status FROM reports WHERE target_type = 'post' AND target_id = ?",
    [dbPostId]
  );
  assert(dbReports.length === 1, `expected 1 report in MySQL, got ${dbReports.length}`);
  const dbCase = await rows('SELECT id, status FROM moderation_cases WHERE target_type = ? AND target_id = ?', ['post', dbPostId]);
  assert(dbCase.length === 1 && dbCase[0].status === 'approved', 'approved moderation case is wrong in MySQL');

  const state = {
    postId,
    dbPostId,
    dbCommentIds: dbComments.map((item) => Number(item.id)),
    caseId: created.moderation.id,
    reportId: report.id,
    commentId: comment.comment.id,
    replyId: reply.comment.id,
    mediaIds: [mediaA.id, mediaB.id],
    mediaObjectKeys: [mediaA.objectKey, mediaB.objectKey].filter(Boolean),
    text,
    counts: { comments: 2, reactions: 2, viewers: 1, reports: 1 }
  };
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
  console.log(JSON.stringify({ phase: 'create', ok: true, postId, commentId: state.commentId, mediaIds: state.mediaIds }, null, 2));
}

function loadState() {
  if (!existsSync(STATE_PATH)) throw new Error(`Missing state file: ${STATE_PATH}`);
  return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
}

async function verifyState(state, token) {
  const detail = await api(`/posts/${state.postId}`, { token });
  assert(detail?.post, 'post is missing after restart');
  assert(detail.post.status === 'published', `post status after restart is ${detail.post.status}`);
  assert(detail.post.media.length === state.mediaIds.length, 'post media count after restart is wrong');
  assert(detail.post.media.map((item) => item.id).join(',') === state.mediaIds.join(','), 'post media order after restart is wrong');
  assert(detail.post.liked === true, 'like did not survive restart');
  assert(detail.post.favorited === true, 'favorite did not survive restart');
  assert(detail.post.commentCount === 2, `comment count after restart is ${detail.post.commentCount}`);
  assert(detail.comments.length === 2, `comments after restart is ${detail.comments.length}`);
  const reply = detail.comments.find((item) => item.id === state.replyId);
  assert(reply && reply.parentId === state.commentId, 'reply relationships did not survive restart');

  const dbPost = await rows('SELECT id, status FROM posts WHERE public_id = ?', [state.postId]);
  assert(dbPost.length === 1 && dbPost[0].status === 'published', 'post row missing after restart');
  const dbMedia = await rows(
    `SELECT pm.public_id, pm.sort FROM post_media pm WHERE pm.post_id = ? ORDER BY pm.sort, pm.id`,
    [dbPost[0].id]
  );
  assert(dbMedia.length === 2, 'media rows missing after restart');
  assert(dbMedia.map((item) => item.public_id).join(',') === state.mediaIds.join(','), 'media sort changed after restart');
  const dbComments = await rows('SELECT id, public_id, root_id, parent_id FROM comments WHERE post_id = ? ORDER BY id', [dbPost[0].id]);
  assert(dbComments.length === 2, 'comment rows missing after restart');
  const dbReply = dbComments.find((item) => item.public_id === state.replyId);
  assert(dbReply, 'reply row missing after restart');
  assert(Number(dbReply.root_id) === Number(dbComments[0].id), 'reply root_id changed after restart');
  assert(Number(dbReply.parent_id) === Number(dbComments[0].id), 'reply parent_id changed after restart');
  const dbReactions = await rows("SELECT kind FROM reactions WHERE target_type = 'post' AND target_id = ? ORDER BY kind", [dbPost[0].id]);
  assert(dbReactions.length === 2, `reaction rows after restart: ${dbReactions.length}`);
  const dbViewers = await rows('SELECT viewer_key FROM post_viewers WHERE post_id = ?', [dbPost[0].id]);
  assert(dbViewers.length === 1, `viewer rows after restart: ${dbViewers.length}`);
  const dbCase = await rows(
    "SELECT status FROM moderation_cases WHERE target_type = 'post' AND target_id = ?",
    [dbPost[0].id]
  );
  assert(dbCase.length === 1 && dbCase[0].status === 'approved', 'moderation case did not survive restart');
  const dbReport = await rows(
    "SELECT status FROM reports WHERE target_type = 'post' AND target_id = ?",
    [dbPost[0].id]
  );
  assert(
    dbReport.length === 1 && ['pending', 'rejected', 'resolved'].includes(dbReport[0].status),
    'report did not survive restart'
  );

  const favorites = await api('/me/favorites', { token });
  assert(
    favorites.some((item) => item.publicId === state.postId || item.id === state.postId),
    'favorite is missing from /me/favorites after restart'
  );
  console.log(JSON.stringify({ phase: 'verify', ok: true, postId: state.postId }, null, 2));
}

async function verifyDeletePhase() {
  const state = loadState();
  const session = await login();
  const token = session.token;
  await verifyState(state, token);

  const deleted = await api(`/posts/${state.postId}`, { method: 'DELETE', token });
  assert(deleted.deleted === true, 'delete post did not return deleted=true');

  const absent = await api(`/posts/${state.postId}`, { token });
  assert(absent === null || absent === undefined, 'deleted post is still readable');

  const dbPost = await waitFor(
    'post row deletion',
    () => rows('SELECT id FROM posts WHERE public_id = ?', [state.postId]),
    (items) => items.length === 0
  );
  assert(dbPost.length === 0, 'post row was not deleted');
  const dbMedia = await waitFor(
    'media row deletion',
    () => rows('SELECT id FROM post_media WHERE public_id IN (?, ?)', state.mediaIds),
    (items) => items.length === 0
  );
  assert(dbMedia.length === 0, 'media rows were not deleted');
  const dbComments = await waitFor(
    'comment row deletion',
    () => rows('SELECT id FROM comments WHERE public_id IN (?, ?)', [state.commentId, state.replyId]),
    (items) => items.length === 0
  );
  assert(dbComments.length === 0, 'comment rows were not deleted');
  const dbReactions = await waitFor(
    'post reaction deletion',
    () => rows("SELECT id FROM reactions WHERE target_type = 'post' AND target_id = ?", [state.dbPostId]),
    (items) => items.length === 0
  );
  assert(dbReactions.length === 0, 'reaction rows were not deleted');
  const dbViewers = await rows('SELECT viewer_key FROM post_viewers v JOIN posts p ON p.id = v.post_id WHERE p.public_id = ?', [state.postId]);
  assert(dbViewers.length === 0, 'viewer rows were not deleted');
  const dbCase = await waitFor(
    'moderation case deletion',
    () => rows("SELECT id FROM moderation_cases WHERE target_type = 'post' AND target_id = ?", [state.dbPostId]),
    (items) => items.length === 0
  );
  assert(dbCase.length === 0, 'moderation case was not deleted');
  const dbReports = await waitFor(
    'report deletion',
    () => rows("SELECT id FROM reports WHERE target_type = 'post' AND target_id = ?", [state.dbPostId]),
    (items) => items.length === 0
  );
  assert(dbReports.length === 0, 'report was not deleted');
  for (const objectKey of state.mediaObjectKeys) {
    const localPath = resolve(process.cwd(), 'uploads', objectKey);
    assert(!existsSync(localPath), `local media file was not deleted: ${objectKey}`);
  }
  await pool.query(
    "DELETE t FROM topics t LEFT JOIN posts p ON p.topic_id = t.id WHERE t.name = 'E2E 测试话题' AND p.id IS NULL"
  );
  await pool.query(
    "DELETE l FROM locations l LEFT JOIN posts p ON p.location_id = l.id WHERE l.name = 'E2E 测试地点' AND p.id IS NULL"
  );
  writeFileSync(STATE_PATH, JSON.stringify({ ...state, deletedAt: new Date().toISOString() }, null, 2), 'utf8');
  console.log(JSON.stringify({ phase: 'verify-delete', ok: true, postId: state.postId }, null, 2));
}

async function checkCleanPhase() {
  const state = loadState();
  const absent = await api(`/posts/${state.postId}`, {});
  assert(absent === null || absent === undefined, 'deleted post came back after restart');
  const dbPost = await rows('SELECT id FROM posts WHERE public_id = ?', [state.postId]);
  assert(dbPost.length === 0, 'deleted post row came back after restart');
  const dbComments = await rows('SELECT id FROM comments WHERE public_id IN (?, ?)', [state.commentId, state.replyId]);
  assert(dbComments.length === 0, 'deleted comment rows came back after restart');
  const dbMedia = await rows('SELECT id FROM post_media WHERE public_id IN (?, ?)', state.mediaIds);
  assert(dbMedia.length === 0, 'deleted media rows came back after restart');
  const dbCase = await rows(
    "SELECT id FROM moderation_cases WHERE target_type = 'post' AND target_id = ?",
    [state.dbPostId]
  );
  assert(dbCase.length === 0, 'deleted moderation case came back after restart');
  const dbReports = await rows(
    "SELECT id FROM reports WHERE target_type = 'post' AND target_id = ?",
    [state.dbPostId]
  );
  assert(dbReports.length === 0, 'deleted report came back after restart');
  console.log(JSON.stringify({ phase: 'check-clean', ok: true }, null, 2));
}

try {
  const phase = process.argv[2] || 'create';
  if (phase === 'create') await createPhase();
  else if (phase === 'verify-delete') await verifyDeletePhase();
  else if (phase === 'check-clean') await checkCleanPhase();
  else throw new Error(`Unknown phase: ${phase}`);
} catch (error) {
  console.error(`E2E FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => undefined);
}
