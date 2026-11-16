export type Risk = 'P0' | 'P1' | 'P2' | 'P3';

export type AdminRole = 'platform_admin' | 'content_reviewer' | 'school_reviewer';

export interface AdminIdentity {
  id: number;
  publicId?: string;
  email: string;
  displayName: string;
  role: AdminRole;
  status: 'active' | 'disabled';
  schoolId?: string;
  orgId?: string;
}

export interface User {
  id: string;
  publicId: string;
  openid?: string;
  nickname: string;
  avatar: string;
  role: 'student' | 'creator' | 'official';
  level: 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
  isOfficial: boolean;
  officialOrg?: string;
  status?: 'active' | 'muted' | 'banned' | 'deleted';
  mutedUntil?: string;
  statusReason?: string;
  deletedAt?: string;
  createdAt: string;
}

export interface AdminUserView {
  id: string;
  nickname: string;
  avatar: string;
  role: User['role'];
  level: User['level'];
  isOfficial: boolean;
  officialOrg?: string;
  status: 'active' | 'muted' | 'banned' | 'deleted';
  mutedUntil?: string;
  statusReason?: string;
  createdAt: string;
  postCount: number;
  commentCount: number;
}

export interface Appeal {
  id: string;
  userId: string;
  targetType: 'post' | 'comment' | 'user';
  targetId: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  decisionReason?: string;
  handledBy?: string;
  handledAt?: string;
  createdAt: string;
}


export interface Media {
  id: string;
  url: string;
  width: number;
  height: number;
  thumbUrl?: string;
  objectKey?: string;
  ownerId?: string;
  storage?: 'local' | 'cos';
  safetyStatus?: 'safe' | 'blocked' | 'unchecked';
  safetyLabel?: string;
  safetyTraceId?: string;
}

export interface Post {
  id: string;
  authorId: string;
  text: string;
  media: Media[];
  topic?: string;
  location?: string;
  anonymity: boolean;
  anonymousAlias?: string;
  status: 'pending' | 'published' | 'rejected' | 'hidden';
  risk: Risk;
  featured: boolean;
  commentsEnabled: boolean;
  likeCount: number;
  favoriteCount: number;
  commentCount: number;
  uniqueViewers: number;
  uniqueCommenters: number;
  publishedAt: string;
  createdAt: string;
  pinnedAt?: string;
  likedBy: Set<string>;
  favoritedBy: Set<string>;
  heatScore: number;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  rootId?: string;
  parentId?: string;
  replyToUserId?: string;
  text: string;
  anonymity: boolean;
  anonymousAlias?: string;
  status: 'pending' | 'published' | 'hidden';
  risk: Risk;
  likeCount: number;
  createdAt: string;
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  type: 'normal' | 'emergency';
  source: string;
  status: 'published' | 'withdrawn';
  pinned: boolean;
  effectiveFrom: string;
  effectiveTo: string;
  createdAt: string;
}

export interface ReportAi {
  decision: 'reject' | 'uphold' | 'needs_human';
  reason: string;
  evidence: string[];
  confidence: number;
  checkedAt: string;
}

export interface ReportTargetView {
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
  reporterId: string;
  targetType: 'post' | 'comment' | 'user';
  targetId: string;
  reason: string;
  detail?: string;
  status: 'pending' | 'resolved' | 'rejected';
  ai?: ReportAi;
  handledById?: string;
  handledAt?: string;
  createdAt: string;
}

export interface AdminReport extends Report {
  reporterName: string;
  target: ReportTargetView;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'interaction' | 'review' | 'official';
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface ModerationReview {
  reviewerId: string;
  reviewerName: string;
  decision: 'approved' | 'rejected';
  reason?: string;
  createdAt: string;
}

export interface ModerationCase {
  id: string;
  targetType: 'post' | 'comment';
  targetId: string;
  risk: Risk;
  labels: string[];
  evidence: string[];
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  decidedBy?: string;
  decidedAt?: string;
  reviews?: ModerationReview[];
  reviewConflict?: boolean;
}

export interface Topic {
  id: string;
  name: string;
  emoji?: string;
  count: number;
}

export interface OfficialAccount {
  id: string;
  userId: string;
  orgName: string;
  orgId?: string;
  schoolId: string;
  scope: string[];
  status: 'pending_school' | 'pending_platform' | 'active' | 'suspended' | 'expired';
  authorizationFile?: string;
  authorizationFileName?: string;
  authorizationMime?: string;
  authorizationSize?: number;
  schoolReviewedBy?: string;
  schoolReviewedById?: number;
  schoolReviewedAt?: string;
  platformReviewedBy?: string;
  platformReviewedById?: number;
  platformReviewedAt?: string;
  effectiveAt?: string;
  expiresAt?: string;
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

export interface FeedItem {
  publicId: string;
  text: string;
  media: Media[];
  topic?: string;
  location?: string;
  author: {
    nickname: string;
    avatar: string;
    isAnonymous: boolean;
    alias?: string;
    isOfficial: boolean;
  };
  publishedAt: string;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  favoriteCount: number;
  liked: boolean;
  favorited: boolean;
  commentsEnabled: boolean;
  featured: boolean;
  status: Post['status'];
  rank?: number;
  heatScore?: number;
  isMine?: boolean;
  pinnedAt?: string;
}

export interface CommentThreadPost {
  publicId: string;
  text: string;
  media: Media[];
  topic?: string;
  location?: string;
  authorNickname: string;
  createdAt: string;
  isMine: boolean;
}

export interface CommentThreadItem {
  id: string;
  text: string;
  createdAt: string;
  author: {
    nickname: string;
    alias?: string;
    isAnonymous: boolean;
    isOfficial: boolean;
  };
  replyToNickname?: string;
  mine: boolean;
  replyToMe: boolean;
  onMyPost: boolean;
  context: boolean;
}

export interface CommentThread {
  post: CommentThreadPost;
  comments: CommentThreadItem[];
  label: string;
  latestAt: string;
}
