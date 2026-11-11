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

export interface Report {
  id: string;
  target: string;
  targetType: '帖子' | '评论' | '账号';
  reason: string;
  reporter: string;
  status: 'pending' | 'resolved' | 'rejected';
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
