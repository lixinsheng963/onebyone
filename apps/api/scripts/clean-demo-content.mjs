import 'dotenv/config';
import mysql from 'mysql2/promise';

/**
 * Removes the original demo/seed content that ships with the project.
 * It intentionally keeps:
 *   - real users (including Simon), their posts and comments
 *   - admins, invitations, notices, topics, ranking and audit history
 *
 * Default is a dry run. Pass --apply to delete the demo rows.
 */

const SEED_USERS = ['u_me', 'u_lin', 'u_cat', 'u_rain', 'u_official'];
const SEED_POSTS = [
  'p_sunset', 'p_food', 'p_cat', 'p_rain', 'p_club',
  'p_library', 'p_morning', 'p_grad', 'p_pending_1', 'p_pending_2'
];
const SEED_OFFICIALS = ['oa_library', 'oa_club'];
const testRollback = process.argv.includes('--test-rollback');
const apply = process.argv.includes('--apply') || testRollback;
const mode = testRollback ? 'test-rollback' : apply ? 'apply' : 'dry-run';

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE
});

const [userRows] = await connection.query(
  'SELECT id, public_id FROM users WHERE public_id IN (?)',
  [SEED_USERS]
);
const userIds = userRows.map((row) => row.id);
const [postRows] = await connection.query(
  'SELECT id, public_id, author_id FROM posts WHERE public_id IN (?) OR author_id IN (?)',
  [SEED_POSTS, userIds.length ? userIds : [0]]
);
const postIds = postRows.map((row) => row.id);
const [commentRows] = postIds.length
  ? await connection.query(
      'SELECT id FROM comments WHERE post_id IN (?) OR author_id IN (?)',
      [postIds, userIds.length ? userIds : [0]]
    )
  : [[]];
const commentIds = commentRows.map((row) => row.id);

const summary = {
  mode,
  seedUsers: userRows.length,
  seedPosts: postRows.length,
  seedComments: commentIds.length,
  seedOfficialAccounts: SEED_OFFICIALS.length
};

if (!apply) {
  console.log(JSON.stringify({ ...summary, hint: 'Run with --apply to delete the demo rows.' }, null, 2));
  await connection.end();
  process.exit(0);
}

await connection.beginTransaction();
try {
  if (commentIds.length) {
    await connection.query(
      "DELETE FROM reactions WHERE (target_type='comment' AND target_id IN (?)) OR (target_type='post' AND target_id IN (?)) OR user_id IN (?)",
      [commentIds, postIds, userIds]
    );
  } else {
    await connection.query(
      "DELETE FROM reactions WHERE (target_type='post' AND target_id IN (?)) OR user_id IN (?)",
      [postIds, userIds]
    );
  }

  if (postIds.length) {
    await connection.query(
      "DELETE FROM reports WHERE (target_type='post' AND target_id IN (?)) OR (target_type='comment' AND target_id IN (?))",
      [postIds, commentIds.length ? commentIds : [0]]
    );
    await connection.query(
      "DELETE FROM moderation_cases WHERE (target_type='post' AND target_id IN (?)) OR (target_type='comment' AND target_id IN (?))",
      [postIds, commentIds.length ? commentIds : [0]]
    );
    await connection.query(
      "DELETE FROM appeals WHERE (target_type='post' AND target_id IN (?)) OR (target_type='comment' AND target_id IN (?))",
      [postIds, commentIds.length ? commentIds : [0]]
    );
    await connection.query('DELETE FROM post_viewers WHERE post_id IN (?)', [postIds]);
    await connection.query('DELETE FROM post_media WHERE post_id IN (?) OR owner_id IN (?)', [postIds, userIds]);
    await connection.query('DELETE FROM post_metrics WHERE post_id IN (?)', [postIds]);
    await connection.query('DELETE FROM comments WHERE post_id IN (?) OR author_id IN (?)', [postIds, userIds]);
    await connection.query('DELETE FROM posts WHERE id IN (?)', [postIds]);
  }

  for (const postId of SEED_POSTS) {
    await connection.query('DELETE FROM notifications WHERE link LIKE ?', [`%${postId}%`]);
  }
  if (userIds.length) {
    await connection.query('DELETE FROM notifications WHERE user_id IN (?)', [userIds]);
    await connection.query('DELETE FROM user_sessions WHERE user_id IN (?)', [userIds]);
  }
  await connection.query('DELETE FROM official_accounts WHERE public_id IN (?) OR user_id IN (?)', [SEED_OFFICIALS, userIds.length ? userIds : [0]]);
  if (userIds.length) await connection.query('DELETE FROM users WHERE id IN (?)', [userIds]);

  if (testRollback) {
    await connection.rollback();
    console.log(JSON.stringify({ ...summary, ok: true, rolledBack: true }, null, 2));
  } else {
    await connection.commit();
    console.log(JSON.stringify({ ...summary, ok: true }, null, 2));
  }
} catch (error) {
  await connection.rollback();
  console.error(JSON.stringify({ ...summary, ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
} finally {
  await connection.end();
}
