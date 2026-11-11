-- 校园日常分享小程序（单校版）MySQL 8.0 初始化脚本
-- 说明：本地 API 默认内存模式；生产可按本脚本接 MySQL/Kysely。
-- 原则：公开 ID 用 CHAR(26) ULID；内部主键 BIGINT；时间统一 UTC；软删除保留审计。

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id CHAR(26) NOT NULL,
  openid VARCHAR(64) NOT NULL,
  unionid VARCHAR(64) NULL,
  nickname VARCHAR(32) NULL,
  avatar_url VARCHAR(512) NULL,
  role VARCHAR(24) NOT NULL DEFAULT 'student',
  level VARCHAR(8) NOT NULL DEFAULT 'L1',
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  verification_status VARCHAR(24) NOT NULL DEFAULT 'unverified',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_public_id (public_id),
  UNIQUE KEY uk_users_openid (openid),
  KEY idx_users_status (status, verification_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS admin_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id CHAR(26) NOT NULL,
  email VARCHAR(128) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  totp_secret_enc VARCHAR(255) NULL,
  role VARCHAR(24) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_admin_public_id (public_id),
  UNIQUE KEY uk_admin_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS invite_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code_hash CHAR(64) NOT NULL,
  issuer_id BIGINT UNSIGNED NOT NULL,
  source VARCHAR(24) NOT NULL DEFAULT 'platform',
  max_uses INT NOT NULL DEFAULT 1,
  used_count INT NOT NULL DEFAULT 0,
  expires_at DATETIME(3) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_invite_hash (code_hash),
  KEY idx_invite_issuer (issuer_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS posts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id CHAR(26) NOT NULL,
  author_id BIGINT UNSIGNED NOT NULL,
  text VARCHAR(2000) NOT NULL,
  topic_id BIGINT UNSIGNED NULL,
  location_id BIGINT UNSIGNED NULL,
  anonymity TINYINT(1) NOT NULL DEFAULT 0,
  anonymous_alias VARCHAR(32) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending_machine',
  risk_level VARCHAR(8) NOT NULL DEFAULT 'P3',
  comments_enabled TINYINT(1) NOT NULL DEFAULT 1,
  like_count INT NOT NULL DEFAULT 0,
  favorite_count INT NOT NULL DEFAULT 0,
  comment_count INT NOT NULL DEFAULT 0,
  published_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_posts_public_id (public_id),
  KEY idx_posts_feed (status, published_at, id),
  KEY idx_posts_author (author_id, created_at),
  KEY idx_posts_topic (topic_id, status, published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS post_media (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id BIGINT UNSIGNED NOT NULL,
  object_key VARCHAR(512) NOT NULL,
  mime VARCHAR(64) NOT NULL,
  width INT NULL,
  height INT NULL,
  size_bytes INT NULL,
  sort TINYINT NOT NULL DEFAULT 0,
  moderation_status VARCHAR(24) NOT NULL DEFAULT 'pending',
  trace_id VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_media_post (post_id, sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS post_metrics (
  post_id BIGINT UNSIGNED NOT NULL,
  unique_viewers INT NOT NULL DEFAULT 0,
  unique_commenters INT NOT NULL DEFAULT 0,
  heat_score DECIMAL(12,4) NOT NULL DEFAULT 0,
  weight_factor DECIMAL(3,2) NOT NULL DEFAULT 1.00,
  calculated_at DATETIME(3) NULL,
  PRIMARY KEY (post_id),
  KEY idx_metrics_heat (heat_score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS comments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id CHAR(26) NOT NULL,
  post_id BIGINT UNSIGNED NOT NULL,
  author_id BIGINT UNSIGNED NOT NULL,
  root_id BIGINT UNSIGNED NULL,
  parent_id BIGINT UNSIGNED NULL,
  reply_to_user_id BIGINT UNSIGNED NULL,
  text VARCHAR(400) NOT NULL,
  anonymity TINYINT(1) NOT NULL DEFAULT 1,
  anonymous_alias VARCHAR(32) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  risk_level VARCHAR(8) NOT NULL DEFAULT 'P2',
  like_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_comments_public_id (public_id),
  KEY idx_comments_post (post_id, status, root_id, created_at),
  KEY idx_comments_author (author_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS reactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  target_type VARCHAR(16) NOT NULL,
  target_id BIGINT UNSIGNED NOT NULL,
  kind VARCHAR(16) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_reaction (user_id, target_type, target_id, kind),
  KEY idx_reaction_target (target_type, target_id, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS notices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id CHAR(26) NOT NULL,
  publisher_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(16) NOT NULL DEFAULT 'normal',
  title VARCHAR(60) NOT NULL,
  body VARCHAR(400) NOT NULL,
  pinned TINYINT(1) NOT NULL DEFAULT 0,
  priority TINYINT NOT NULL DEFAULT 5,
  effective_from DATETIME(3) NOT NULL,
  effective_to DATETIME(3) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  approved_by BIGINT UNSIGNED NULL,
  school_reviewed_by BIGINT UNSIGNED NULL,
  withdrawn_at DATETIME(3) NULL,
  withdraw_reason VARCHAR(200) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_notices_public_id (public_id),
  KEY idx_notices_active (type, status, effective_from, effective_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS notice_slot (
  id TINYINT NOT NULL,
  active_notice_id BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reporter_id BIGINT UNSIGNED NOT NULL,
  target_type VARCHAR(16) NOT NULL,
  target_id BIGINT UNSIGNED NOT NULL,
  reason_code VARCHAR(32) NOT NULL,
  detail VARCHAR(500) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  handled_by BIGINT UNSIGNED NULL,
  handled_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_reports_status (status, created_at),
  KEY idx_reports_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS moderation_cases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  target_type VARCHAR(16) NOT NULL,
  target_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'queued',
  priority VARCHAR(8) NOT NULL DEFAULT 'P3',
  risk_score DECIMAL(5,2) NOT NULL DEFAULT 0,
  machine_labels JSON NULL,
  assigned_to BIGINT UNSIGNED NULL,
  decision VARCHAR(24) NULL,
  reason_code VARCHAR(32) NULL,
  notes VARCHAR(1000) NULL,
  decided_by BIGINT UNSIGNED NULL,
  decided_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_moderation_queue (status, priority, created_at),
  KEY idx_moderation_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS official_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  school_id VARCHAR(64) NOT NULL,
  org_name VARCHAR(128) NOT NULL,
  authorization_file_key VARCHAR(512) NULL,
  scope JSON NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending_school',
  school_reviewed_by BIGINT UNSIGNED NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  effective_at DATETIME(3) NULL,
  expires_at DATETIME(3) NULL,
  last_reviewed_at DATETIME(3) NULL,
  next_review_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_official_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS school_reviewers (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id BIGINT UNSIGNED NOT NULL,
  actor_type VARCHAR(16) NOT NULL DEFAULT 'admin',
  actor_role VARCHAR(24) NOT NULL,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(16) NULL,
  target_id BIGINT UNSIGNED NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  request_id VARCHAR(64) NULL,
  ip_hash CHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_actor (actor_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(32) NOT NULL,
  title VARCHAR(120) NOT NULL,
  body VARCHAR(500) NOT NULL,
  link VARCHAR(512) NULL,
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_notifications_user (user_id, read_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 单实例持久化快照：当前 API 用 MySQL 快照保证重启后会话/内容不丢。
-- 数据量上来后，再把 snapshot 拆成 users/posts/comments 等业务表查询。
CREATE TABLE IF NOT EXISTS app_state (
  id TINYINT NOT NULL,
  snapshot JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 审计日志只允许 INSERT；生产账号不要授予 UPDATE/DELETE。
INSERT IGNORE INTO notice_slot (id, active_notice_id) VALUES (1, NULL);
