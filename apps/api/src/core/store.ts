import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { verifySync } from 'otplib';
import type {
  Comment,
  FeedItem,
  Media,
  ModerationCase,
  Notice,
  Notification,
  OfficialAccount,
  Post,
  RankingConfig,
  Report,
  Risk,
  Topic,
  User
} from '../types';
import { comments as seedComments, moderationCases as seedCases, notices as seedNotices, notifications as seedNotifications, posts as seedPosts, reports as seedReports, topics as seedTopics, users as seedUsers } from '../data/seed';
import { computeHeat } from './heat';
import { mergeModeration, moderateText, type ModerationResult } from './moderation';

const nowIso = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export interface CreatePostInput {
  text: string;
  media?: Media[];
  topic?: string;
  location?: string;
  anonymity?: boolean;
  commentsEnabled?: boolean;
  mediaIds?: string[];
}

export interface StoreSnapshot {
  version: number;
  users: User[];
  posts: Array<Omit<Post, 'likedBy' | 'favoritedBy'> & { likedBy: string[]; favoritedBy: string[] }>;
  comments: Comment[];
  media: Media[];
  notices: Notice[];
  reports: Report[];
  notifications: Notification[];
  cases: ModerationCase[];
  topics: Topic[];
  officialAccounts: OfficialAccount[];
  rankingConfig: RankingConfig;
  sessions: Array<[string, string]>;
  sessionExpiry?: Array<[string, number]>;
  adminSessions: Array<[string, string]>;
  adminSessionExpiry?: Array<[string, number]>;
  viewers: Array<[string, string[]]>;
}

export interface AdminCaseView extends ModerationCase {
  post?: Post;
  author?: User;
}

export class CampusStore {
  private users: User[] = [...seedUsers];
  private posts: Post[] = [...seedPosts];
  private comments: Comment[] = [...seedComments];
  private media: Media[] = [];
  private notices: Notice[] = [...seedNotices];
  private reports: Report[] = [...seedReports];
  private notifications: Notification[] = [...seedNotifications];
  private cases: ModerationCase[] = [...seedCases];
  private topics: Topic[] = [...seedTopics];
  private sessions = new Map<string, string>();
  private sessionExpiry = new Map<string, number>();
  private readonly tokenPepper = process.env.SESSION_PEPPER || 'campus-local-session-pepper';
  private adminSessions = new Map<string, string>();
  private adminSessionExpiry = new Map<string, number>();
  private viewers = new Map<string, Set<string>>();
  private rankingConfig: RankingConfig = {
    likeWeight: 0.6,
    commentWeight: 0.3,
    favoriteWeight: 0.2,
    viewWeight: 0.3,
    coldStart: 3,
    coldDecayHours: 6,
    timeOffsetHours: 6,
    timeExponent: 1.2,
    windowDays: 7,
    snapshotSize: 100,
    maxPerAuthorTop20: 2
  };
  private officialAccounts: OfficialAccount[] = [
    {
      id: 'oa_library',
      userId: 'u_official',
      orgName: '学校图书馆',
      scope: ['notice'],
      status: 'active',
      authorizationFile: '授权文件已留档',
      createdAt: nowIso()
    },
    {
      id: 'oa_club',
      userId: 'u_cat',
      orgName: '话剧社',
      scope: ['notice'],
      status: 'pending_school',
      createdAt: nowIso()
    }
  ];

  private changeHook?: () => void;

  constructor() {
    this.recomputeHeat();
  }

  setChangeHook(hook?: () => void): void {
    this.changeHook = hook;
  }

  exportSnapshot(): StoreSnapshot {
    return {
      version: 1,
      users: this.users,
      posts: this.posts.map((post) => {
        const { likedBy, favoritedBy, ...rest } = post;
        return { ...rest, likedBy: [...likedBy], favoritedBy: [...favoritedBy] };
      }),
      comments: this.comments,
      media: this.media,
      notices: this.notices,
      reports: this.reports,
      notifications: this.notifications,
      cases: this.cases,
      topics: this.topics,
      officialAccounts: this.officialAccounts,
      rankingConfig: this.rankingConfig,
      sessions: [...this.sessions.entries()],
      sessionExpiry: [...this.sessionExpiry.entries()],
      adminSessions: [...this.adminSessions.entries()],
      adminSessionExpiry: [...this.adminSessionExpiry.entries()],
      viewers: [...this.viewers.entries()].map(([key, value]) => [key, [...value]])
    };
  }

  importSnapshot(snapshot: Partial<StoreSnapshot> | null | undefined): void {
    if (!snapshot || snapshot.version !== 1) return;
    if (Array.isArray(snapshot.users)) this.users = snapshot.users;
    if (Array.isArray(snapshot.posts)) {
      this.posts = snapshot.posts.map((post) => ({
        ...post,
        likedBy: new Set(post.likedBy || []),
        favoritedBy: new Set(post.favoritedBy || [])
      }));
    }
    if (Array.isArray(snapshot.comments)) this.comments = snapshot.comments;
    if (Array.isArray(snapshot.media)) this.media = snapshot.media;
    if (Array.isArray(snapshot.notices)) this.notices = snapshot.notices;
    if (Array.isArray(snapshot.reports)) this.reports = snapshot.reports;
    if (Array.isArray(snapshot.notifications)) this.notifications = snapshot.notifications;
    if (Array.isArray(snapshot.cases)) this.cases = snapshot.cases;
    if (Array.isArray(snapshot.topics)) this.topics = snapshot.topics;
    if (Array.isArray(snapshot.officialAccounts)) this.officialAccounts = snapshot.officialAccounts;
    if (snapshot.rankingConfig) this.rankingConfig = snapshot.rankingConfig;
    if (Array.isArray(snapshot.sessions)) {
      this.sessions = new Map(snapshot.sessions.map(([token, userId]) => [this.normalizeTokenKey(token), userId]));
      const now = Date.now();
      const expiry = snapshot.sessionExpiry?.length
        ? snapshot.sessionExpiry.map(([token, expiresAt]) => [this.normalizeTokenKey(token), expiresAt] as [string, number])
        : [...this.sessions.keys()].map((token) => [token, now + this.userSessionTtl()] as [string, number]);
      this.sessionExpiry = new Map(expiry);
    }
    if (Array.isArray(snapshot.adminSessions)) {
      this.adminSessions = new Map(snapshot.adminSessions.map(([token, value]) => [this.normalizeTokenKey(token), value]));
      const now = Date.now();
      const expiry = snapshot.adminSessionExpiry?.length
        ? snapshot.adminSessionExpiry.map(([token, expiresAt]) => [this.normalizeTokenKey(token), expiresAt] as [string, number])
        : [...this.adminSessions.keys()].map((token) => [token, now + this.adminSessionTtl()] as [string, number]);
      this.adminSessionExpiry = new Map(expiry);
    }
    if (Array.isArray(snapshot.viewers)) {
      this.viewers = new Map(snapshot.viewers.map(([key, value]) => [key, new Set(value)]));
    }
    this.recomputeHeat();
  }

  markDirty(): void {
    this.changed();
  }

  private changed(): void {
    this.changeHook?.();
  }

  recheckPublishedSafety(): void {
    let touched = false;
    for (const post of this.posts) {
      if (post.authorId !== 'u_me' || post.status !== 'published') continue;
      const result = moderateText(post.text);
      if (result.risk === 'P3') continue;
      post.status = 'pending';
      post.risk = result.risk;
      const existing = this.cases.find((c) => c.targetType === 'post' && c.targetId === post.id && c.status === 'pending');
      if (!existing) {
        this.cases.unshift({
          id: id('mc'),
          targetType: 'post',
          targetId: post.id,
          risk: result.risk,
          labels: result.labels,
          evidence: result.evidence,
          reason: result.reason,
          status: 'pending',
          createdAt: nowIso()
        });
      }
      this.notifyReview(post.authorId, '你的内容需要重新审核', '系统发现风险内容，已先下架等待人工复核。', `/pages/post/detail?id=${post.id}`);
      touched = true;
    }
    if (touched) this.changed();
  }

  private userSessionTtl(): number {
    const days = Number(process.env.USER_SESSION_TTL_DAYS || 30);
    return (Number.isFinite(days) && days > 0 ? days : 30) * 24 * 3600 * 1000;
  }

  private adminSessionTtl(): number {
    const hours = Number(process.env.ADMIN_SESSION_HOURS || 12);
    return (Number.isFinite(hours) && hours > 0 ? hours : 12) * 3600 * 1000;
  }

  private safeEqual(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private hashToken(token: string): string {
    return createHmac('sha256', this.tokenPepper).update(token).digest('hex');
  }

  private normalizeTokenKey(key: string): string {
    return /^[a-f0-9]{64}$/.test(key) ? key : this.hashToken(key);
  }

  login(code: string): { token: string; user: User } {
    const token = `demo_${randomUUID()}`;
    const sessionKey = this.hashToken(token);
    this.sessions.set(sessionKey, 'u_me');
    this.sessionExpiry.set(sessionKey, Date.now() + this.userSessionTtl());
    const user = this.users.find((u) => u.id === 'u_me')!;
    this.changed();
    return { token, user };
  }

  logout(token?: string): void {
    if (!token) return;
    const sessionKey = this.hashToken(token);
    this.sessions.delete(sessionKey);
    this.sessionExpiry.delete(sessionKey);
    this.changed();
  }

  loginWithOpenId(openid: string): { token: string; user: User } {
    let user = this.users.find((item) => item.openid === openid);
    if (!user) {
      const userId = `u_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      user = {
        id: userId,
        publicId: userId,
        openid,
        nickname: '校园同学',
        avatar: '',
        role: 'student',
        level: 'L1',
        isOfficial: false,
        createdAt: nowIso()
      };
      this.users.push(user);
    }
    const token = `wx_${randomUUID()}`;
    const sessionKey = this.hashToken(token);
    this.sessions.set(sessionKey, user.id);
    this.sessionExpiry.set(sessionKey, Date.now() + this.userSessionTtl());
    this.changed();
    return { token, user };
  }

  redeemInvite(code: string, token?: string): { ok: boolean; message: string; user?: User } {
    const expected = process.env.INVITE_CODE || (process.env.NODE_ENV === 'production' ? '' : 'CAMPUS');
    if (!expected || !this.safeEqual(code.trim().toUpperCase(), expected.toUpperCase())) {
      return { ok: false, message: '邀请码无效或已使用' };
    }
    const user = this.getUserByToken(token) || this.users.find((u) => u.id === 'u_me')!;
    this.changed();
    return { ok: true, message: '认证成功', user };
  }

  addMedia(media: Omit<Media, 'id'> & { id?: string }): Media {
    const item: Media = {
      ...media,
      id: media.id || id('media')
    };
    this.media.push(item);
    this.changed();
    return item;
  }

  getMedia(mediaId: string): Media | undefined {
    return this.media.find((item) => item.id === mediaId);
  }

  getUserByToken(token?: string): User | undefined {
    if (!token) return undefined;
    const sessionKey = this.hashToken(token);
    const expiry = this.sessionExpiry.get(sessionKey);
    if (expiry !== undefined && expiry <= Date.now()) {
      this.sessions.delete(sessionKey);
      this.sessionExpiry.delete(sessionKey);
      this.changed();
      return undefined;
    }
    const userId = this.sessions.get(sessionKey);
    return userId ? this.users.find((u) => u.id === userId) : undefined;
  }

  getMe(token?: string): User | undefined {
    return this.getUserByToken(token);
  }

  getTopics(): Topic[] {
    return this.topics;
  }

  getFeed(tab: string, token?: string): FeedItem[] {
    const viewer = this.getUserByToken(token);
    const published = this.posts.filter((p) => p.status === 'published');
    const withHeat = published.map((p) => ({ ...p, heatScore: this.computePostHeat(p) }));

    let ordered: Post[];
    if (tab === 'hot') {
      ordered = withHeat.sort((a, b) => b.heatScore - a.heatScore);
    } else if (tab === 'featured') {
      ordered = withHeat.filter((p) => p.featured).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    } else {
      ordered = withHeat.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    }

    const seenAuthors = new Map<string, number>();
    const diversified: Post[] = [];
    for (const post of ordered) {
      const count = seenAuthors.get(post.authorId) ?? 0;
      if (tab === 'hot' && count >= this.rankingConfig.maxPerAuthorTop20 && diversified.length < 20) {
        continue;
      }
      seenAuthors.set(post.authorId, count + 1);
      diversified.push(post);
    }

    return diversified.slice(0, 60).map((post, index) => this.toFeedItem(post, viewer, tab === 'hot' ? index + 1 : undefined));
  }

  getPost(publicId: string, token?: string): { post: FeedItem; comments: unknown[] } | undefined {
    const post = this.posts.find((p) => p.id === publicId);
    if (!post) return undefined;
    const viewer = this.getUserByToken(token);
    if (post.status !== 'published' && viewer?.id !== post.authorId) return undefined;
    return {
      post: this.toFeedItem(post, viewer),
      comments: this.getComments(publicId, viewer)
    };
  }

  getComments(postId: string, viewer?: User): unknown[] {
    const post = this.posts.find((p) => p.id === postId);
    if (!post) return [];
    if (post.status !== 'published' && viewer?.id !== post.authorId) return [];
    return this.comments
      .filter((c) => c.postId === postId && c.status === 'published')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((comment) => this.toCommentView(comment));
  }

  createPost(input: CreatePostInput, token?: string, aiModeration?: ModerationResult | null): { post: Post; moderation: ModerationCase | null; message: string } {
    const user = this.getUserByToken(token);
    if (!user) throw new Error('AUTH_REQUIRED');
    const rawText = String(input.text || '');
    const ruleModeration = moderateText(rawText);
    const moderation = aiModeration ? mergeModeration(ruleModeration, aiModeration) : ruleModeration;
    const selectedMedia = (input.mediaIds || [])
      .map((mediaId) => this.media.find((item) => item.id === mediaId && item.ownerId === user.id))
      .filter((item): item is Media => Boolean(item));
    const hasMedia = selectedMedia.length > 0;
    const risk: Risk = hasMedia && moderation.risk === 'P3' ? 'P2' : moderation.risk;
    // 图片审核尚未接入前，含图片内容一律先人工复核，绝不自动发布。
    const autoPublish = process.env.AUTO_PUBLISH_SAFE === 'true' && risk === 'P3' && !hasMedia && !moderation.needsHuman;
    const post: Post = {
      id: id('p'),
      authorId: user.id,
      text: rawText.trim(),
      media: selectedMedia.length ? selectedMedia : input.media ?? [],
      topic: input.topic,
      location: input.location,
      anonymity: Boolean(input.anonymity),
      anonymousAlias: input.anonymity ? this.aliasFor(user.id, `draft_${Date.now()}`) : undefined,
      status: autoPublish ? 'published' : 'pending',
      risk,
      featured: false,
      commentsEnabled: input.commentsEnabled !== false,
      likeCount: 0,
      favoriteCount: 0,
      commentCount: 0,
      uniqueViewers: 0,
      uniqueCommenters: 0,
      publishedAt: nowIso(),
      createdAt: nowIso(),
      likedBy: new Set(),
      favoritedBy: new Set(),
      heatScore: 0
    };
    this.posts.unshift(post);
    const moderationCase: ModerationCase = {
      id: id('mc'),
      targetType: 'post',
      targetId: post.id,
      risk,
      labels: hasMedia ? Array.from(new Set([...moderation.labels, 'image_review'])) : moderation.labels,
      evidence: moderation.evidence,
      reason: hasMedia && risk === 'P2' ? '含图片内容，等待人工复核' : moderation.reason,
      status: autoPublish ? 'approved' : 'pending',
      createdAt: nowIso(),
      decidedBy: autoPublish ? 'AI 初筛' : undefined,
      decidedAt: autoPublish ? nowIso() : undefined
    };
    this.cases.unshift(moderationCase);
    if (autoPublish) {
      post.heatScore = this.computePostHeat(post);
      this.noticesForAuthor(user.id, '你的分享已通过审核', '内容已自动发布到首页。', post.id);
    } else {
      this.noticesForAuthor(user.id, '你的分享已提交审核', '通过后会出现在首页。', post.id);
    }
    this.changed();
    return {
      post,
      moderation: moderationCase,
      message: autoPublish ? '已通过安全筛选，已自动发布' : '已提交审核，通常 30 分钟内完成'
    };
  }

  createComment(postId: string, text: string, token?: string, parentId?: string, anonymity = true, aiModeration?: ModerationResult | null): { comment: Comment; message: string } {
    const user = this.getUserByToken(token);
    if (!user) throw new Error('AUTH_REQUIRED');
    const post = this.posts.find((p) => p.id === postId);
    if (!post || post.status !== 'published') throw new Error('NOT_FOUND');
    if (!post.commentsEnabled) throw new Error('COMMENTS_CLOSED');
    const parent = parentId ? this.comments.find((c) => c.id === parentId) : undefined;
    const rawText = String(text || '');
    const ruleModeration = moderateText(rawText);
    const moderation = aiModeration ? mergeModeration(ruleModeration, aiModeration) : ruleModeration;
    const comment: Comment = {
      id: id('c'),
      postId,
      authorId: user.id,
      rootId: parent ? (parent.rootId ?? parent.id) : undefined,
      parentId: parent?.id,
      replyToUserId: parent?.authorId,
      text: rawText.trim(),
      anonymity,
      anonymousAlias: anonymity ? this.aliasFor(user.id, postId) : undefined,
      status: moderation.risk === 'P3' ? 'published' : 'pending',
      risk: moderation.risk,
      likeCount: 0,
      createdAt: nowIso()
    };
    this.comments.push(comment);
    if (comment.status === 'published') {
      post.commentCount += 1;
      const unique = new Set(
        this.comments
          .filter((c) => c.postId === postId && c.status === 'published' && c.authorId !== post.authorId)
          .map((c) => c.authorId)
      );
      post.uniqueCommenters = unique.size;
    } else {
      this.cases.unshift({
        id: id('mc'),
        targetType: 'comment',
        targetId: comment.id,
        risk: moderation.risk,
        labels: moderation.labels,
        evidence: moderation.evidence,
        reason: moderation.reason,
        status: 'pending',
        createdAt: nowIso()
      });
    }
    this.changed();
    return { comment, message: comment.status === 'published' ? '已发布' : '已提交审核' };
  }

  setLike(postId: string, token: string | undefined, liked: boolean): { liked: boolean; count: number } {
    const user = this.getUserByToken(token);
    if (!user) throw new Error('AUTH_REQUIRED');
    const post = this.findPost(postId);
    if (post.status !== 'published') throw new Error('NOT_FOUND');
    const current = post.likedBy.has(user.id);
    if (liked && !current) {
      post.likedBy.add(user.id);
      post.likeCount += 1;
    } else if (!liked && current) {
      post.likedBy.delete(user.id);
      post.likeCount = Math.max(0, post.likeCount - 1);
    }
    this.changed();
    return { liked: post.likedBy.has(user.id), count: post.likeCount };
  }

  setFavorite(postId: string, token: string | undefined, favorited: boolean): { favorited: boolean; count: number } {
    const user = this.getUserByToken(token);
    if (!user) throw new Error('AUTH_REQUIRED');
    const post = this.findPost(postId);
    if (post.status !== 'published') throw new Error('NOT_FOUND');
    const current = post.favoritedBy.has(user.id);
    if (favorited && !current) {
      post.favoritedBy.add(user.id);
      post.favoriteCount += 1;
    } else if (!favorited && current) {
      post.favoritedBy.delete(user.id);
      post.favoriteCount = Math.max(0, post.favoriteCount - 1);
    }
    this.changed();
    return { favorited: post.favoritedBy.has(user.id), count: post.favoriteCount };
  }

  recordView(postId: string, viewerKey: string): { counted: boolean; uniqueViewers: number } {
    const post = this.findPost(postId);
    if (post.status !== 'published') throw new Error('NOT_FOUND');
    const viewers = this.viewers.get(postId) ?? new Set<string>();
    if (viewers.has(viewerKey)) return { counted: false, uniqueViewers: post.uniqueViewers };
    viewers.add(viewerKey);
    this.viewers.set(postId, viewers);
    post.uniqueViewers += 1;
    this.changed();
    return { counted: true, uniqueViewers: post.uniqueViewers };
  }

  getNotices(): Notice[] {
    const now = Date.now();
    return this.notices.filter((n) => n.status === 'published' && new Date(n.effectiveTo).getTime() > now);
  }

  getEmergency(): Notice | null {
    return this.getNotices().find((n) => n.type === 'emergency' && n.pinned) ?? null;
  }

  getNotice(noticeId: string): Notice | undefined {
    return this.notices.find((n) => n.id === noticeId);
  }

  getNotifications(token?: string): Notification[] {
    const user = this.getUserByToken(token);
    if (!user) throw new Error('AUTH_REQUIRED');
    return this.notifications.filter((n) => n.userId === user.id);
  }

  markNotificationRead(notificationId: string, token?: string): boolean {
    const user = this.getUserByToken(token);
    if (!user) throw new Error('AUTH_REQUIRED');
    const item = this.notifications.find((n) => n.id === notificationId && n.userId === user.id);
    if (!item) return false;
    item.read = true;
    this.changed();
    return true;
  }

  createReport(input: { targetType: 'post' | 'comment' | 'user'; targetId: string; reason: string; detail?: string }, token?: string): Report {
    const user = this.getUserByToken(token);
    if (!user) throw new Error('AUTH_REQUIRED');
    const targetExists = input.targetType === 'post'
      ? this.posts.some((post) => post.id === input.targetId)
      : input.targetType === 'comment'
        ? this.comments.some((comment) => comment.id === input.targetId)
        : this.users.some((item) => item.id === input.targetId);
    if (!targetExists) throw new Error('NOT_FOUND');
    const report: Report = {
      id: id('r'),
      reporterId: user.id,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      detail: input.detail,
      status: 'pending',
      createdAt: nowIso()
    };
    this.reports.unshift(report);
    this.changed();
    return report;
  }

  getMyPosts(token?: string): Post[] {
    const user = this.getUserByToken(token);
    if (!user) throw new Error('AUTH_REQUIRED');
    return this.posts
      .filter((p) => p.authorId === user.id)
      .sort((a, b) => {
        const pinA = a.pinnedAt || '';
        const pinB = b.pinnedAt || '';
        return pinB.localeCompare(pinA) || b.createdAt.localeCompare(a.createdAt);
      });
  }

  setPinned(publicId: string, token: string | undefined, pinned: boolean): Post {
    const user = this.getUserByToken(token);
    if (!user) throw new Error('AUTH_REQUIRED');
    const post = this.findPost(publicId);
    if (post.authorId !== user.id) throw new Error('FORBIDDEN');
    if (pinned && !post.pinnedAt) {
      const pinnedCount = this.posts.filter((p) => p.authorId === user.id && p.pinnedAt).length;
      if (pinnedCount >= 5) throw new Error('PIN_LIMIT');
    }
    post.pinnedAt = pinned ? nowIso() : undefined;
    this.changed();
    return post;
  }

  deletePost(publicId: string, token: string | undefined): Media[] {
    const user = this.getUserByToken(token);
    if (!user) throw new Error('AUTH_REQUIRED');
    const post = this.findPost(publicId);
    if (post.authorId !== user.id) throw new Error('FORBIDDEN');
    const removedMedia = post.media || [];
    const commentIds = new Set(this.comments.filter((c) => c.postId === publicId).map((c) => c.id));
    this.posts = this.posts.filter((p) => p.id !== publicId);
    this.comments = this.comments.filter((c) => c.postId !== publicId);
    this.media = this.media.filter((m) => !removedMedia.some((item) => item.id === m.id));
    this.cases = this.cases.filter((c) => !(c.targetType === 'post' && c.targetId === publicId) && !(c.targetType === 'comment' && commentIds.has(c.targetId)));
    this.reports = this.reports.filter((r) => !(r.targetType === 'post' && r.targetId === publicId) && !(r.targetType === 'comment' && commentIds.has(r.targetId)));
    this.viewers.delete(publicId);
    this.changed();
    return removedMedia;
  }

  getMyComments(token?: string): Comment[] {
    const user = this.getUserByToken(token);
    if (!user) throw new Error('AUTH_REQUIRED');
    return this.comments.filter((c) => c.authorId === user.id);
  }

  getMyFavorites(token?: string): Post[] {
    const user = this.getUserByToken(token);
    if (!user) throw new Error('AUTH_REQUIRED');
    return this.posts.filter((p) => p.status === 'published' && p.favoritedBy.has(user.id));
  }

  adminLogin(email: string, password: string, totp: string): { token: string; user: string } {
    const expectedEmail = process.env.ADMIN_EMAIL || '';
    const expectedPassword = process.env.ADMIN_PASSWORD || '';
    const expectedTotp = process.env.ADMIN_TOTP || '';
    const totpSecret = process.env.ADMIN_TOTP_SECRET || '';
    if (!expectedEmail || !expectedPassword || (!expectedTotp && !totpSecret)) {
      throw new Error('ADMIN_AUTH_NOT_CONFIGURED');
    }
    let validTotp = false;
    if (totpSecret) {
      try {
        const result = verifySync({ token: totp, secret: totpSecret, epochTolerance: 30 });
        validTotp = result.valid;
      } catch {
        validTotp = false;
      }
    } else {
      validTotp = this.safeEqual(totp, expectedTotp);
    }
    const valid = this.safeEqual(email, expectedEmail)
      && this.safeEqual(password, expectedPassword)
      && validTotp;
    if (!valid) throw new Error('ADMIN_AUTH_FAILED');
    const token = `admin_${randomUUID()}`;
    const sessionKey = this.hashToken(token);
    this.adminSessions.set(sessionKey, 'admin');
    this.adminSessionExpiry.set(sessionKey, Date.now() + this.adminSessionTtl());
    this.changed();
    return { token, user: '平台管理员' };
  }

  adminLogout(token?: string): void {
    if (!token) return;
    const sessionKey = this.hashToken(token);
    this.adminSessions.delete(sessionKey);
    this.adminSessionExpiry.delete(sessionKey);
    this.changed();
  }

  isAdmin(token?: string): boolean {
    if (!token) return false;
    const sessionKey = this.hashToken(token);
    const expiry = this.adminSessionExpiry.get(sessionKey);
    if (expiry !== undefined && expiry <= Date.now()) {
      this.adminSessions.delete(sessionKey);
      this.adminSessionExpiry.delete(sessionKey);
      this.changed();
      return false;
    }
    return this.adminSessions.has(sessionKey);
  }

  adminStats(): unknown {
    const published = this.posts.filter((p) => p.status === 'published');
    return {
      registered: 1286,
      dau: 318,
      postsToday: published.filter((p) => p.publishedAt.slice(0, 10) === nowIso().slice(0, 10)).length + 18,
      pending: this.cases.filter((c) => c.status === 'pending').length,
      reports: this.reports.filter((r) => r.status === 'pending').length,
      officialAccounts: this.officialAccounts.filter((a) => a.status === 'active').length,
      officialPending: this.officialAccounts.filter((a) => a.status !== 'active').length,
      p0: 0,
      p1: 2,
      reviewSla: '98%',
      weekPosts: [32, 28, 41, 36, 52, 44, 61],
      weekLabels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
      hot: this.getFeed('hot').slice(0, 5)
    };
  }

  adminQueue(risk?: string): AdminCaseView[] {
    return this.cases
      .filter((c) => !risk || c.risk === risk)
      .sort((a, b) => {
        const order: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
        if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
        return (order[a.risk] ?? 9) - (order[b.risk] ?? 9) || b.createdAt.localeCompare(a.createdAt);
      })
      .map((c) => {
        const comment = c.targetType === 'comment' ? this.comments.find((item) => item.id === c.targetId) : undefined;
        const post = comment
          ? this.posts.find((item) => item.id === comment.postId)
          : this.posts.find((item) => item.id === c.targetId);
        const authorId = comment ? comment.authorId : post?.authorId;
        return {
          ...c,
          post: post
            ? { ...post, text: comment ? comment.text : post.text }
            : undefined,
          author: this.users.find((u) => u.id === authorId)
        };
      });
  }

  decideCase(caseId: string, decision: 'approved' | 'rejected', reason?: string): ModerationCase | undefined {
    const item = this.cases.find((c) => c.id === caseId);
    if (!item) return undefined;
    item.status = decision;
    item.reason = reason || item.reason;
    item.decidedBy = '平台管理员';
    item.decidedAt = nowIso();
    if (item.targetType === 'comment') {
      const comment = this.comments.find((c) => c.id === item.targetId);
      if (comment) {
        comment.status = decision === 'approved' ? 'published' : 'hidden';
        if (decision === 'approved') {
          const post = this.posts.find((p) => p.id === comment.postId);
          if (post) {
            post.commentCount += 1;
            post.uniqueCommenters = new Set(
              this.comments
                .filter((c) => c.postId === post.id && c.status === 'published' && c.authorId !== post.authorId)
                .map((c) => c.authorId)
            ).size;
          }
        }
        this.notifyReview(
          comment.authorId,
          decision === 'approved' ? '你的评论已通过审核' : '你的评论未通过审核',
          decision === 'approved' ? '评论已显示。' : (reason || '内容不符合社区公约。'),
          `/pages/post/detail?id=${comment.postId}`
        );
      }
      this.changed();
      return item;
    }
    const post = this.posts.find((p) => p.id === item.targetId);
    if (post) {
      post.status = decision === 'approved' ? 'published' : 'rejected';
      if (decision === 'approved') {
        post.publishedAt = nowIso();
        post.heatScore = this.computePostHeat(post);
      }
      this.notifyReview(
        post.authorId,
        decision === 'approved' ? '你的分享已通过审核' : '你的分享未通过审核',
        decision === 'approved' ? '内容已出现在首页。' : (reason || '内容不符合社区公约。'),
        `/pages/post/detail?id=${post.id}`
      );
    }
    this.changed();
    return item;
  }

  private notifyReview(userId: string, title: string, body: string, link: string): void {
    this.notifications.unshift({
      id: id('noti'),
      userId,
      type: 'review',
      title,
      body,
      link,
      read: false,
      createdAt: nowIso()
    });
  }

  getOfficialAccounts(): OfficialAccount[] {
    return this.officialAccounts;
  }

  reviewOfficialAccount(accountId: string, status: OfficialAccount['status']): OfficialAccount | undefined {
    const item = this.officialAccounts.find((a) => a.id === accountId);
    if (!item) return undefined;
    item.status = status;
    this.changed();
    return item;
  }

  getAdminNotices(): Notice[] {
    return this.notices;
  }

  createNotice(input: { title: string; body: string; type: 'normal' | 'emergency'; source: string; effectiveTo: string }): Notice {
    const notice: Notice = {
      id: id('n'),
      title: input.title,
      body: input.body,
      type: input.type,
      source: input.source,
      status: 'published',
      pinned: input.type === 'emergency',
      effectiveFrom: nowIso(),
      effectiveTo: input.effectiveTo,
      createdAt: nowIso()
    };
    this.notices.unshift(notice);
    this.changed();
    return notice;
  }

  getReports(): Report[] {
    return this.reports;
  }

  resolveReport(reportId: string, status: 'resolved' | 'rejected'): Report | undefined {
    const report = this.reports.find((r) => r.id === reportId);
    if (!report) return undefined;
    report.status = status;
    this.changed();
    return report;
  }

  getRankingConfig(): RankingConfig {
    return this.rankingConfig;
  }

  updateRankingConfig(patch: Partial<RankingConfig>): RankingConfig {
    this.rankingConfig = { ...this.rankingConfig, ...patch };
    this.recomputeHeat();
    this.changed();
    return this.rankingConfig;
  }

  private findPost(postId: string): Post {
    const post = this.posts.find((p) => p.id === postId);
    if (!post) throw new Error('NOT_FOUND');
    return post;
  }

  private computePostHeat(post: Post): number {
    return computeHeat(
      {
        likeCount: post.likeCount,
        uniqueCommenters: post.uniqueCommenters,
        favoriteCount: post.favoriteCount,
        uniqueViewers: post.uniqueViewers,
        publishedAt: post.publishedAt
      },
      Date.now(),
      this.rankingConfig
    );
  }

  private recomputeHeat(): void {
    for (const post of this.posts) post.heatScore = this.computePostHeat(post);
  }

  private aliasFor(userId: string, salt: string): string {
    const words = ['银杏', '梧桐', '青柠', '木棉', '晚风', '橘子', '纸飞机', '小满'];
    let hash = 0;
    for (const char of `${userId}:${salt}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return `匿名同学·${words[hash % words.length]}`;
  }

  private toFeedItem(post: Post, viewer?: User, rank?: number): FeedItem {
    const author = this.users.find((u) => u.id === post.authorId)!;
    const isAnonymous = post.anonymity;
    return {
      publicId: post.id,
      text: post.text,
      media: post.media,
      topic: post.topic,
      location: post.location,
      author: {
        nickname: isAnonymous ? '匿名同学' : author.nickname,
        avatar: isAnonymous ? '' : author.avatar,
        isAnonymous,
        alias: isAnonymous ? post.anonymousAlias : undefined,
        isOfficial: author.isOfficial
      },
      publishedAt: post.publishedAt,
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      favoriteCount: post.favoriteCount,
      liked: Boolean(viewer && post.likedBy.has(viewer.id)),
      favorited: Boolean(viewer && post.favoritedBy.has(viewer.id)),
      commentsEnabled: post.commentsEnabled,
      featured: post.featured,
      status: post.status,
      rank,
      heatScore: post.heatScore,
      isMine: viewer?.id === post.authorId,
      pinnedAt: post.pinnedAt
    };
  }

  private toCommentView(comment: Comment): unknown {
    const author = this.users.find((u) => u.id === comment.authorId)!;
    const replyTo = comment.replyToUserId ? this.users.find((u) => u.id === comment.replyToUserId) : undefined;
    const parent = comment.parentId ? this.comments.find((c) => c.id === comment.parentId) : undefined;
    const replyToAnonymous = Boolean(parent && parent.anonymity);
    return {
      id: comment.id,
      postId: comment.postId,
      rootId: comment.rootId,
      parentId: comment.parentId,
      text: comment.text,
      author: {
        nickname: comment.anonymity ? '匿名同学' : author.nickname,
        alias: comment.anonymity ? comment.anonymousAlias : undefined,
        isAnonymous: comment.anonymity,
        isOfficial: author.isOfficial
      },
      replyToNickname: replyTo ? (replyToAnonymous ? '匿名同学' : replyTo.nickname) : undefined,
      likeCount: comment.likeCount,
      createdAt: comment.createdAt
    };
  }

  private noticesForAuthor(userId: string, title: string, body: string, postId: string): void {
    this.notifications.unshift({
      id: id('noti'),
      userId,
      type: 'review',
      title,
      body,
      link: `/pages/post/detail?id=${postId}`,
      read: false,
      createdAt: nowIso()
    });
  }
}
