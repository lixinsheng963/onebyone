import type { Pool } from 'mysql2/promise';

/**
 * Canonical MySQL schema used by the API.
 *
 * The application keeps a small in-memory working set for rendering, but every
 * domain object is persisted in a normalized table. Public API ids are stored
 * in *_public_id columns; internal BIGINT ids are only used for joins.
 */
export const MYSQL_SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(64) NOT NULL,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (version)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS app_state (
    id TINYINT NOT NULL,
    snapshot JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id VARCHAR(96) NOT NULL,
    openid VARCHAR(191) NULL,
    unionid VARCHAR(191) NULL,
    nickname VARCHAR(64) NOT NULL DEFAULT '',
    avatar_url VARCHAR(1024) NOT NULL DEFAULT '',
    role VARCHAR(24) NOT NULL DEFAULT 'student',
    level VARCHAR(8) NOT NULL DEFAULT 'L1',
    is_official TINYINT(1) NOT NULL DEFAULT 0,
    official_org VARCHAR(128) NULL,
    official_base_role VARCHAR(24) NULL,
    official_base_level VARCHAR(8) NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    mobile VARCHAR(32) NULL,
    school VARCHAR(64) NULL,
    school_selected_at DATETIME(3) NULL,
    admitted_at DATETIME(3) NULL,
    verification_status VARCHAR(24) NOT NULL DEFAULT 'unverified',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_public_id (public_id),
    UNIQUE KEY uk_users_openid (openid),
    KEY idx_users_status (status, verification_status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS admin_users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id VARCHAR(96) NOT NULL,
    email VARCHAR(191) NOT NULL,
    display_name VARCHAR(64) NOT NULL DEFAULT '',
    password_hash VARCHAR(255) NOT NULL,
    totp_secret_enc VARCHAR(255) NULL,
    role VARCHAR(24) NOT NULL DEFAULT 'admin',
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    last_login_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_admin_public_id (public_id),
    UNIQUE KEY uk_admin_email (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS invite_codes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code_hash CHAR(64) NOT NULL,
    code VARCHAR(32) NULL,
    name VARCHAR(64) NULL,
    issuer_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    source VARCHAR(24) NOT NULL DEFAULT 'platform',
    max_uses INT NOT NULL DEFAULT 1,
    used_count INT NOT NULL DEFAULT 0,
    expires_at DATETIME(3) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_invite_hash (code_hash),
    KEY idx_invite_issuer (issuer_id, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS topics (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id VARCHAR(96) NOT NULL,
    name VARCHAR(64) NOT NULL,
    emoji VARCHAR(16) NULL,
    count INT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_topics_public_id (public_id),
    UNIQUE KEY uk_topics_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS locations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(128) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_locations_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS posts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id VARCHAR(96) NOT NULL,
    author_id BIGINT UNSIGNED NOT NULL,
    text TEXT NOT NULL,
    topic_id BIGINT UNSIGNED NULL,
    location_id BIGINT UNSIGNED NULL,
    latitude DECIMAL(10,6) NULL,
    longitude DECIMAL(10,6) NULL,
    anonymity TINYINT(1) NOT NULL DEFAULT 0,
    anonymous_alias VARCHAR(64) NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    risk_level VARCHAR(8) NOT NULL DEFAULT 'P3',
    featured TINYINT(1) NOT NULL DEFAULT 0,
    comments_enabled TINYINT(1) NOT NULL DEFAULT 1,
    like_count INT NOT NULL DEFAULT 0,
    favorite_count INT NOT NULL DEFAULT 0,
    share_count INT NOT NULL DEFAULT 0,
    comment_count INT NOT NULL DEFAULT 0,
    unique_viewers INT NOT NULL DEFAULT 0,
    unique_commenters INT NOT NULL DEFAULT 0,
    heat_score DECIMAL(14,4) NOT NULL DEFAULT 0,
    published_at DATETIME(3) NULL,
    pinned_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_posts_public_id (public_id),
    KEY idx_posts_feed (status, published_at, id),
    KEY idx_posts_author (author_id, created_at),
    KEY idx_posts_topic (topic_id, status, published_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS post_media (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id VARCHAR(96) NOT NULL,
    post_id BIGINT UNSIGNED NULL,
    owner_id BIGINT UNSIGNED NULL,
    url VARCHAR(1024) NOT NULL,
    thumb_url VARCHAR(1024) NULL,
    object_key VARCHAR(512) NULL,
    mime VARCHAR(64) NOT NULL DEFAULT 'image/jpeg',
    width INT NOT NULL DEFAULT 0,
    height INT NOT NULL DEFAULT 0,
    size_bytes BIGINT NULL,
    sort TINYINT NOT NULL DEFAULT 0,
    moderation_status VARCHAR(24) NOT NULL DEFAULT 'approved',
    trace_id VARCHAR(64) NULL,
    storage VARCHAR(16) NOT NULL DEFAULT 'local',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_media_public_id (public_id),
    KEY idx_media_post (post_id, sort),
    KEY idx_media_owner (owner_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS post_metrics (
    post_id BIGINT UNSIGNED NOT NULL,
    unique_viewers INT NOT NULL DEFAULT 0,
    unique_commenters INT NOT NULL DEFAULT 0,
    heat_score DECIMAL(14,4) NOT NULL DEFAULT 0,
    weight_factor DECIMAL(6,2) NOT NULL DEFAULT 1.00,
    calculated_at DATETIME(3) NULL,
    PRIMARY KEY (post_id),
    KEY idx_metrics_heat (heat_score)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS comments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id VARCHAR(96) NOT NULL,
    post_id BIGINT UNSIGNED NOT NULL,
    author_id BIGINT UNSIGNED NOT NULL,
    root_id BIGINT UNSIGNED NULL,
    parent_id BIGINT UNSIGNED NULL,
    reply_to_user_id BIGINT UNSIGNED NULL,
    text VARCHAR(500) NOT NULL,
    anonymity TINYINT(1) NOT NULL DEFAULT 1,
    anonymous_alias VARCHAR(64) NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    risk_level VARCHAR(8) NOT NULL DEFAULT 'P2',
    like_count INT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    deleted_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_comments_public_id (public_id),
    KEY idx_comments_post (post_id, status, root_id, created_at),
    KEY idx_comments_author (author_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS reactions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    target_type VARCHAR(16) NOT NULL,
    target_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(16) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_reaction (user_id, target_type, target_id, kind),
    KEY idx_reaction_target (target_type, target_id, kind)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS notices (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id VARCHAR(96) NOT NULL,
    publisher_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    source VARCHAR(64) NOT NULL DEFAULT '',
    type VARCHAR(16) NOT NULL DEFAULT 'normal',
    title VARCHAR(80) NOT NULL,
    body VARCHAR(1000) NOT NULL,
    pinned TINYINT(1) NOT NULL DEFAULT 0,
    priority TINYINT NOT NULL DEFAULT 5,
    effective_from DATETIME(3) NOT NULL,
    effective_to DATETIME(3) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'published',
    approved_by BIGINT UNSIGNED NULL,
    school_reviewed_by BIGINT UNSIGNED NULL,
    withdrawn_at DATETIME(3) NULL,
    withdraw_reason VARCHAR(200) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_notices_public_id (public_id),
    KEY idx_notices_active (type, status, effective_from, effective_to)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS notice_slot (
    id TINYINT NOT NULL,
    active_notice_id BIGINT UNSIGNED NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS reports (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id VARCHAR(96) NOT NULL,
    reporter_id BIGINT UNSIGNED NOT NULL,
    target_type VARCHAR(16) NOT NULL,
    target_id BIGINT UNSIGNED NOT NULL,
    reason_code VARCHAR(128) NOT NULL,
    detail VARCHAR(500) NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    ai_decision VARCHAR(16) NULL,
    ai_reason VARCHAR(500) NULL,
    ai_evidence JSON NULL,
    ai_confidence DECIMAL(4,2) NULL,
    ai_checked_at DATETIME(3) NULL,
    handled_by BIGINT UNSIGNED NULL,
    handled_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_reports_public_id (public_id),
    KEY idx_reports_status (status, created_at),
    KEY idx_reports_target (target_type, target_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS appeals (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id VARCHAR(96) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    target_type VARCHAR(16) NOT NULL,
    target_id BIGINT UNSIGNED NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    decision_reason VARCHAR(255) NULL,
    handled_by VARCHAR(128) NULL,
    handled_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_appeals_public_id (public_id),
    KEY idx_appeals_status (status, created_at),
    KEY idx_appeals_user (user_id, created_at),
    KEY idx_appeals_target (target_type, target_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS moderation_cases (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id VARCHAR(96) NOT NULL,
    target_type VARCHAR(16) NOT NULL,
    target_id BIGINT UNSIGNED NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    priority VARCHAR(8) NOT NULL DEFAULT 'P3',
    risk_score DECIMAL(6,2) NOT NULL DEFAULT 0,
    machine_labels JSON NULL,
    labels JSON NULL,
    evidence JSON NULL,
    reviews_json JSON NULL,
    reason_text VARCHAR(500) NULL,
    assigned_to BIGINT UNSIGNED NULL,
    decision VARCHAR(24) NULL,
    reason_code VARCHAR(64) NULL,
    notes VARCHAR(1000) NULL,
    decided_by BIGINT UNSIGNED NULL,
    decided_by_label VARCHAR(64) NULL,
    decided_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_cases_public_id (public_id),
    KEY idx_moderation_queue (status, priority, created_at),
    KEY idx_moderation_target (target_type, target_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS official_accounts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id VARCHAR(96) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    school_id VARCHAR(64) NOT NULL DEFAULT 'campus',
    org_name VARCHAR(128) NOT NULL,
    org_id VARCHAR(64) NULL,
    authorization_file_key VARCHAR(512) NULL,
    authorization_file_name VARCHAR(255) NULL,
    authorization_mime VARCHAR(100) NULL,
    authorization_size INT UNSIGNED NULL,
    authorization_requested_at DATETIME(3) NULL,
    scope JSON NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending_school',
    school_reviewed_by BIGINT UNSIGNED NULL,
    school_reviewed_at DATETIME(3) NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    platform_reviewed_at DATETIME(3) NULL,
    effective_at DATETIME(3) NULL,
    expires_at DATETIME(3) NULL,
    last_reviewed_at DATETIME(3) NULL,
    next_review_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_official_public_id (public_id),
    KEY idx_official_status (status, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id VARCHAR(96) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    type VARCHAR(32) NOT NULL,
    title VARCHAR(120) NOT NULL,
    body VARCHAR(500) NOT NULL,
    link VARCHAR(512) NULL,
    read_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_notifications_public_id (public_id),
    KEY idx_notifications_user (user_id, read_at, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS ranking_config (
    id TINYINT NOT NULL,
    config JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS user_sessions (
    token_hash CHAR(64) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (token_hash),
    KEY idx_user_sessions_expiry (expires_at),
    KEY idx_user_sessions_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash CHAR(64) NOT NULL,
    subject VARCHAR(64) NOT NULL DEFAULT 'admin',
    expires_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (token_hash),
    KEY idx_admin_sessions_expiry (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS post_viewers (
    post_id BIGINT UNSIGNED NOT NULL,
    viewer_key VARCHAR(191) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (post_id, viewer_key),
    KEY idx_post_viewers_created (post_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    actor_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    actor_type VARCHAR(16) NOT NULL DEFAULT 'admin',
    actor_role VARCHAR(24) NOT NULL DEFAULT 'admin',
    action VARCHAR(64) NOT NULL,
    target_type VARCHAR(16) NULL,
    target_id BIGINT UNSIGNED NULL,
    before_json JSON NULL,
    after_json JSON NULL,
    request_id VARCHAR(64) NULL,
    ip_hash CHAR(64) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_audit_actor (actor_id, created_at),
    KEY idx_audit_action (action, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS school_reviewers (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    admin_user_id BIGINT UNSIGNED NOT NULL,
    school_id VARCHAR(64) NOT NULL,
    org_id VARCHAR(64) NULL,
    authorized_by VARCHAR(128) NOT NULL,
    backup_admin_user_id BIGINT UNSIGNED NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_school_reviewer_status (status, school_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
];

export async function ensureMysqlSchema(pool: Pool): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.query("SET NAMES utf8mb4");
    for (const statement of MYSQL_SCHEMA_STATEMENTS) {
      await connection.query(statement);
    }
    await connection.query(
      'INSERT IGNORE INTO schema_migrations (version) VALUES (?)',
      ['2026-11-13-normalized-business-v1']
    );

    // Existing normalized deployments need additive upgrades; CREATE TABLE IF NOT EXISTS
    // does not add columns to a table that already exists.
    const columns: Array<[string, string, string]> = [
      ['invite_codes', 'code', '`code` VARCHAR(32) NULL AFTER `code_hash`'],
      ['invite_codes', 'name', '`name` VARCHAR(64) NULL AFTER `code`'],
      ['reports', 'ai_decision', '`ai_decision` VARCHAR(16) NULL AFTER `status`'],
      ['reports', 'ai_reason', '`ai_reason` VARCHAR(500) NULL AFTER `ai_decision`'],
      ['reports', 'ai_evidence', '`ai_evidence` JSON NULL AFTER `ai_reason`'],
      ['reports', 'ai_confidence', '`ai_confidence` DECIMAL(4,2) NULL AFTER `ai_evidence`'],
      ['reports', 'ai_checked_at', '`ai_checked_at` DATETIME(3) NULL AFTER `ai_confidence`'],
      ['moderation_cases', 'reviews_json', '`reviews_json` JSON NULL AFTER `evidence`'],
      ['admin_users', 'display_name', '`display_name` VARCHAR(64) NOT NULL DEFAULT \'\' AFTER `email`'],
      ['users', 'official_base_role', '`official_base_role` VARCHAR(24) NULL AFTER `official_org`'],
      ['users', 'official_base_level', '`official_base_level` VARCHAR(8) NULL AFTER `official_base_role`'],
      ['users', 'muted_until', '`muted_until` DATETIME(3) NULL AFTER `status`'],
      ['users', 'status_reason', '`status_reason` VARCHAR(255) NULL AFTER `muted_until`'],
      ['users', 'deleted_at', '`deleted_at` DATETIME(3) NULL AFTER `status_reason`'],
      ['users', 'mobile', '`mobile` VARCHAR(32) NULL AFTER `status`'],
      ['users', 'school', '`school` VARCHAR(64) NULL AFTER `mobile`'],
      ['users', 'school_selected_at', '`school_selected_at` DATETIME(3) NULL AFTER `school`'],
      ['users', 'admitted_at', '`admitted_at` DATETIME(3) NULL AFTER `school_selected_at`'],
      ['posts', 'latitude', '`latitude` DECIMAL(10,6) NULL AFTER `location_id`'],
      ['posts', 'longitude', '`longitude` DECIMAL(10,6) NULL AFTER `latitude`'],
      ['posts', 'share_count', '`share_count` INT NOT NULL DEFAULT 0 AFTER `favorite_count`'],
      ['official_accounts', 'org_id', '`org_id` VARCHAR(64) NULL AFTER `org_name`'],
      ['official_accounts', 'authorization_file_name', '`authorization_file_name` VARCHAR(255) NULL AFTER `authorization_file_key`'],
      ['official_accounts', 'authorization_mime', '`authorization_mime` VARCHAR(100) NULL AFTER `authorization_file_name`'],
      ['official_accounts', 'authorization_size', '`authorization_size` INT UNSIGNED NULL AFTER `authorization_mime`'],
      ['official_accounts', 'authorization_requested_at', '`authorization_requested_at` DATETIME(3) NULL AFTER `authorization_size`'],
      ['official_accounts', 'school_reviewed_at', '`school_reviewed_at` DATETIME(3) NULL AFTER `school_reviewed_by`'],
      ['official_accounts', 'platform_reviewed_at', '`platform_reviewed_at` DATETIME(3) NULL AFTER `reviewed_by`']
    ];
    for (const [table, column, definition] of columns) {
      const [existing] = await connection.query<any[]>(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
        [table, column]
      );
      if (!existing.length) await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
    }

    await connection.query(
      'INSERT IGNORE INTO schema_migrations (version) VALUES (?)',
      ['2026-11-13-reports-ai-invite-display-v2']
    );
    await connection.query(
      'INSERT IGNORE INTO schema_migrations (version) VALUES (?)',
      ['2026-11-16-admin-rbac-v3']
    );
    await connection.query(
      'INSERT IGNORE INTO schema_migrations (version) VALUES (?)',
      ['2026-11-16-official-authorization-v4']
    );
    await connection.query(
      'INSERT IGNORE INTO schema_migrations (version) VALUES (?)',
      ['2026-11-16-user-governance-v5']
    );
    await connection.query(
      'INSERT IGNORE INTO schema_migrations (version) VALUES (?)',
      ['2026-11-18-official-operator-base-v8']
    );
    await connection.query(
      'INSERT IGNORE INTO schema_migrations (version) VALUES (?)',
      ['2026-11-16-appeals-v6']
    );
    await connection.query(
      'INSERT IGNORE INTO schema_migrations (version) VALUES (?)',
      ['2026-11-16-double-review-v7']
    );
    // Repair seeded official accounts created before org_id was persisted.
    await connection.query(
      "UPDATE official_accounts SET org_id = 'org_library' WHERE org_id IS NULL AND org_name = '学校图书馆'"
    );
    await connection.query(
      "UPDATE official_accounts SET org_id = 'org_club' WHERE org_id IS NULL AND org_name = '话剧社'"
    );
    await connection.query(
      'INSERT IGNORE INTO schema_migrations (version) VALUES (?)',
      ['2026-11-18-official-org-backfill-v9']
    );
    await connection.query(
      'INSERT IGNORE INTO schema_migrations (version) VALUES (?)',
      ['2026-11-21-post-share-location-v10']
    );
    const [onboardingMigrated] = await connection.query<any[]>(
      'SELECT 1 FROM schema_migrations WHERE version = ? LIMIT 1',
      ['2026-11-22-user-onboarding-v11']
    );
    if (!onboardingMigrated.length) {
      // Existing accounts predate invite admission; keep them usable. New accounts stay unadmitted.
      await connection.query('UPDATE users SET admitted_at = created_at WHERE admitted_at IS NULL');
      await connection.query(
        'INSERT IGNORE INTO schema_migrations (version) VALUES (?)',
        ['2026-11-22-user-onboarding-v11']
      );
    }
    await connection.query(
      'INSERT IGNORE INTO schema_migrations (version) VALUES (?)',
      ['2026-11-23-official-authorization-reminder-v16']
    );

    await connection.query('INSERT IGNORE INTO notice_slot (id, active_notice_id) VALUES (1, NULL)');
  } finally {
    connection.release();
  }
}
