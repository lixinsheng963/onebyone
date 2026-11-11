export type Risk = 'P0' | 'P1' | 'P2' | 'P3';

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

export interface Report {
  id: string;
  reporterId: string;
  targetType: 'post' | 'comment' | 'user';
  targetId: string;
  reason: string;
  detail?: string;
  status: 'pending' | 'resolved' | 'rejected';
  createdAt: string;
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
  scope: string[];
  status: 'pending_school' | 'pending_platform' | 'active' | 'suspended';
  authorizationFile?: string;
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
