export type Risk = 'P0' | 'P1' | 'P2' | 'P3';

export interface CasePost {
  id: string;
  author: string;
  alias?: string;
  text: string;
  cover: string;
  topic?: string;
  location?: string;
  createdAt: string;
}

export interface ModerationCase {
  id: string;
  risk: Risk;
  labels: string[];
  reason: string;
  evidence: string[];
  status: 'pending' | 'approved' | 'rejected';
  post: CasePost;
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  type: 'normal' | 'emergency';
  source: string;
  status: 'published' | 'draft' | 'withdrawn';
  effectiveTo: string;
  createdAt: string;
}

export interface OfficialAccount {
  id: string;
  orgName: string;
  owner: string;
  scope: string[];
  status: 'active' | 'pending_school' | 'pending_platform' | 'suspended';
  authorization: string;
}

export interface ReportAi {
  decision: 'reject' | 'uphold' | 'needs_human';
  reason: string;
  evidence: string[];
  confidence: number;
  checkedAt: string;
}

export interface ReportTarget {
  type: 'post' | 'comment' | 'user';
  id: string;
  exists: boolean;
  status?: string;
  text?: string;
  authorName?: string;
  authorId?: string;
  media?: string[];
  postId?: string;
  postText?: string;
  nickname?: string;
  avatar?: string;
  createdAt?: string;
}

export interface Report {
  id: string;
  target: ReportTarget;
  targetType: '帖子' | '评论' | '账号';
  reason: string;
  detail?: string;
  reporter: string;
  status: 'pending' | 'resolved' | 'rejected';
  ai?: ReportAi;
  handledAt?: string;
  createdAt: string;
}

export interface HotItem {
  id: string;
  title: string;
  author: string;
  score: number;
  likes: number;
  comments: number;
  cover: string;
}

export interface InviteCode {
  id: number;
  code: string | null;
  name: string;
  issuerId: number;
  source: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string;
  status: 'active' | 'used' | 'revoked' | 'expired';
  createdAt: string;
}

export interface AuditLog {
  id: number;
  actorId: number;
  actorType: string;
  actorRole: string;
  action: string;
  targetType?: string;
  targetId?: number;
  before?: unknown;
  after?: unknown;
  requestId?: string;
  ipHash?: string;
  createdAt: string;
}

export interface RankingConfig {
  likeWeight: number;
  commentWeight: number;
  favoriteWeight: number;
  viewWeight: number;
  coldStart: number;
  coldDecayHours: number;
  timeOffsetHours: number;
  timeExponent: number;
  windowDays: number;
  snapshotSize: number;
  maxPerAuthorTop20: number;
}
