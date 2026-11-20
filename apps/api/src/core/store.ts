import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { verifySync } from 'otplib';
import type {
  AdminReport,
  AdminUserView,
  Appeal,
  Comment,
  CommentThread,
  CommentThreadItem,
  FeedItem,
  Media,
  ModerationCase,
  Notice,
  Notification,
  OfficialAccount,
  Post,
  RankingConfig,
  Report,
  ReportAi,
  ReportTargetView,
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
  appeals: Appeal[];
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
  private appeals: Appeal[] = [];
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
      orgId: 'org_library',
      schoolId: 'campus',
      scope: ['notice'],
      status: 'active',
      effectiveAt: nowIso(),
      createdAt: nowIso()
    },
    {
      id: 'oa_club',
      userId: 'u_cat',
      orgName: '话剧社',
      orgId: 'org_club',
      schoolId: 'campus',
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
      appeals: this.appeals,
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
    if (Array.isArray(snapshot.appeals)) this.appeals = snapshot.appeals;
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
    const existing = this.users.find((u) => u.id === 'u_me')!;
    this.assertAccountUsable(existing);
    const token = `demo_${randomUUID()}`;
    const sessionKey = this.hashToken(token);
    this.sessions.set(sessionKey, 'u_me');
    this.sessionExpiry.set(sessionKey, Date.now() + this.userSessionTtl());
    this.changed();
    return { token, user: existing };
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
    if (user) this.assertAccountUsable(user);
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

  async redeemInvite(code: string, token?: string): Promise<{ ok: boolean; message: string; user?: User }> {
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

  private assertAccountUsable(user: User): void {
    if (user.status === 'banned' || user.status === 'deleted') throw new Error('ACCOUNT_DISABLED');
    if (user.status === 'muted' && user.mutedUntil && new Date(user.mutedUntil).getTime() <= Date.now()) {
      user.status = 'active';
      user.mutedUntil = undefined;
      user.statusReason = undefined;
      this.changed();
    }
    if (user.status === 'muted') throw new Error('ACCOUNT_MUTED');
  }

  private revokeUserSessions(userId: string): void {
    for (const [key, owner] of [...this.sessions.entries()]) {
      if (owner !== userId) continue;
      this.sessions.delete(key);
      this.sessionExpiry.delete(key);
    }
  }

  deleteMyAccount(token?: string): void {
    const user = this.getUserByToken(token);
    if (!user) throw new Error('AUTH_REQUIRED');
    user.status = 'deleted';
    user.deletedAt = nowIso();
    user.statusReason = undefined;
    user.nickname = '已注销用户';
    user.avatar = '';
    user.openid = undefined;
    this.revokeUserSessions(user.id);
    this.changed();
  }

  listAdminUsers(): AdminUserView[] {
    const pendingOfficialUserIds = new Set(
      this.officialAccounts
        .filter((account) => account.status === 'pending_school' || account.status === 'pending_platform')
        .map((account) => account.userId)
    );
    return this.users
      .filter((user) => !/^u_official(_|$)/.test(user.id) && !pendingOfficialUserIds.has(user.id))
      .map((user) => {
        const relatedReports = this.reports
          .filter((report) => report.status === 'resolved' && this.reportTargetUserId(report) === user.id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const latest = relatedReports[0];
        return {
          id: user.id,
          nickname: user.nickname,
          avatar: user.avatar,
          role: user.role,
          level: user.level,
          isOfficial: user.isOfficial,
          officialOrg: user.officialOrg,
          status: user.status || 'active',
          mutedUntil: user.mutedUntil,
          statusReason: user.statusReason,
          createdAt: user.createdAt,
          postCount: this.posts.filter((post) => post.authorId === user.id).length,
          commentCount: this.comments.filter((comment) => comment.authorId === user.id).length,
          lastReportReason: latest?.reason,
          lastReportDetail: latest?.detail,
          lastReportAt: latest?.createdAt,
          lastReportTargetType: latest?.targetType
        };
      });
  }

  private reportTargetUserId(report: Report): string | undefined {
    if (report.targetType === 'user') return report.targetId;
    if (report.targetType === 'post') return this.posts.find((post) => post.id === report.targetId)?.authorId;
    return this.comments.find((comment) => comment.id === report.targetId)?.authorId;
  }

  setUserStatus(userId: string, status: 'active' | 'muted' | 'banned' | 'deleted', options: { mutedUntil?: string; reason?: string } = {}): User {
    const user = this.users.find((item) => item.id === userId);
    if (!user) throw new Error('NOT_FOUND');
    user.status = status;
    user.mutedUntil = status === 'muted' ? options.mutedUntil : undefined;
    user.statusReason = options.reason;
    user.deletedAt = status === 'deleted' ? nowIso() : undefined;
    if (status === 'banned' || status === 'deleted') this.revokeUserSessions(user.id);
    if (status === 'deleted') {
      user.nickname = '已注销用户';
      user.avatar = '';
      user.openid = undefined;
    } else {
      const title = status === 'active'
        ? '账号已恢复正常'
        : status === 'muted' ? '你的账号已被禁言' : '你的账号已被封禁';
      const body = status === 'active'
        ? '你现在可以正常发布和互动了，请遵守社区公约。'
        : `${options.reason || '请遵守社区公约。'}${status === 'muted' && options.mutedUntil ? `（截止 ${options.mutedUntil}）` : ''}`;
      this.notificationForUser(user.id, title, body, '/pages/notifications/index');
    }
    this.changed();
    return user;
  }

  getMe(token?: string): User | undefined {
    return this.getUserByToken(token);
  }

  updateMyProfile(token: string | undefined, patch: { nickname?: string; avatar?: string }): User {
    const user = this.getUserByToken(token);
    if (!user) throw new Error('AUTH_REQUIRED');
    if (patch.nickname !== undefined) {
      const nickname = patch.nickname.trim();
      if (nickname.length < 1 || nickname.length > 16) throw new Error('NICKNAME_INVALID');
      user.nickname = nickname;
    }
    if (patch.avatar !== undefined) {
      const avatar = patch.avatar.trim();
      if (avatar && !/^(https?:\/\/|\/uploads\/)/.test(avatar)) throw new Error('AVATAR_INVALID');
      user.avatar = avatar;
    }
    this.changed();
    return user;
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
      .map((comment) => this.toCommentView(comment, viewer));
  }

  createPost(input: CreatePostInput, token?: string, aiModeration?: ModerationResult | null): { post: Post; moderation: ModerationCase | null; message: string } {
    const user = this.getUserByToken(token);
    if (!user) throw new Error('AUTH_REQUIRED');
    this.assertAccountUsable(user);
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
    this.assertAccountUsable(user);
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
    this.assertAccountUsable(user);
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
    this.assertAccountUsable(user);
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
    this.assertAccountUsable(user);
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

  getMyPosts(token?: string): FeedItem[] {
    const user = this.getUserByToken(token);
    if (!user) throw new Error('AUTH_REQUIRED');
    return this.posts
      .filter((p) => p.authorId === user.id)
      .sort((a, b) => {
        const pinA = a.pinnedAt || '';
        const pinB = b.pinnedAt || '';
        return pinB.localeCompare(pinA) || b.createdAt.localeCompare(a.createdAt);
      })
      .map((post) => this.toFeedItem(post, user));
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

  getMyFavorites(token?: string): FeedItem[] {
    const user = this.getUserByToken(token);
    if (!user) throw new Error('AUTH_REQUIRED');
    return this.posts
      .filter((p) => p.status === 'published' && p.favoritedBy.has(user.id))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .map((post) => this.toFeedItem(post, user));
  }

  getMyCommentThreads(token?: string): CommentThread[] {
    const user = this.getUserByToken(token);
    if (!user) throw new Error('AUTH_REQUIRED');
    const publishedPosts = this.posts.filter((p) => p.status === 'published');
    const threads: CommentThread[] = [];

    for (const post of publishedPosts) {
      const postComments = this.comments
        .filter((c) => c.postId === post.id && c.status === 'published')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      if (!postComments.length) continue;

      const byId = new Map(postComments.map((c) => [c.id, c]));
      const onMyPost = post.authorId === user.id;
      const isRelevant = (comment: Comment) => {
        if (onMyPost || comment.authorId === user.id || comment.replyToUserId === user.id) return true;
        let parentId = comment.parentId;
        while (parentId) {
          const parent = byId.get(parentId);
          if (!parent) break;
          if (parent.authorId === user.id) return true;
          parentId = parent.parentId;
        }
        const root = comment.rootId ? byId.get(comment.rootId) : undefined;
        return Boolean(root && root.authorId === user.id);
      };
      const relevantIds = new Set(postComments.filter(isRelevant).map((c) => c.id));
      if (!relevantIds.size) continue;

      // 把被回复的上级评论一并带上，保证“谁回复谁”在页面上有上下文。
      const selected = new Set(relevantIds);
      for (const comment of postComments) {
        if (!relevantIds.has(comment.id)) continue;
        let parentId = comment.parentId;
        while (parentId) {
          const parent = byId.get(parentId);
          if (!parent || selected.has(parent.id)) break;
          selected.add(parent.id);
          parentId = parent.parentId;
        }
      }

      const items = postComments
        .filter((c) => selected.has(c.id))
        .map((comment) => this.toMyCommentThreadItem(comment, user, byId, onMyPost));
      if (!items.length) continue;

      const latestAt = items.reduce((latest, item) => item.createdAt > latest ? item.createdAt : latest, items[0].createdAt);
      const incoming = items.some((item) => item.replyToMe);
      const othersOnMyPost = items.some((item) => item.onMyPost);
      const label = incoming
        ? '有人回复了你的评论'
        : othersOnMyPost
          ? '有人评论了你的分享'
          : '你参与过的评论';

      threads.push({
        post: {
          publicId: post.id,
          text: post.text,
          media: post.media,
          topic: post.topic,
          location: post.location,
          authorNickname: post.anonymity ? (post.anonymousAlias || '匿名同学') : (this.users.find((u) => u.id === post.authorId)?.nickname || '同学'),
          createdAt: post.createdAt,
          isMine: onMyPost
        },
        comments: items,
        label,
        latestAt
      });
    }

    return threads
      .sort((a, b) => b.latestAt.localeCompare(a.latestAt))
      .slice(0, 60);
  }

  private toMyCommentThreadItem(
    comment: Comment,
    viewer: User,
    byId: Map<string, Comment>,
    onMyPost: boolean
  ): CommentThreadItem {
    const author = this.users.find((u) => u.id === comment.authorId);
    const parent = comment.parentId ? byId.get(comment.parentId) : undefined;
    const parentAuthor = parent ? this.users.find((u) => u.id === parent.authorId) : undefined;
    const replyTo = comment.replyToUserId
      ? this.users.find((u) => u.id === comment.replyToUserId)
      : parentAuthor;
    const replyToAnonymous = Boolean(parent && parent.anonymity);
    const mine = comment.authorId === viewer.id;
    const replyToMe = !mine && (
      comment.replyToUserId === viewer.id || Boolean(parent && parent.authorId === viewer.id)
    );
    return {
      id: comment.id,
      text: comment.text,
      createdAt: comment.createdAt,
      author: {
        nickname: comment.anonymity ? '匿名同学' : (author?.nickname || '同学'),
        alias: comment.anonymity ? comment.anonymousAlias : undefined,
        isAnonymous: comment.anonymity,
        isOfficial: Boolean(author?.isOfficial)
      },
      replyToNickname: replyTo
        ? (replyToAnonymous ? (parent?.anonymousAlias || '匿名同学') : replyTo.nickname)
        : undefined,
      mine,
      replyToMe,
      onMyPost: onMyPost && !mine,
      context: !mine && !replyToMe && !(onMyPost && !mine)
    };
  }

  protected issueAdminSession(subject: string, displayName: string): { token: string; user: string } {
    const token = `admin_${randomUUID()}`;
    const sessionKey = this.hashToken(token);
    this.adminSessions.set(sessionKey, subject);
    this.adminSessionExpiry.set(sessionKey, Date.now() + this.adminSessionTtl());
    this.changed();
    return { token, user: displayName };
  }

  protected adminSessionSubject(token?: string): string | undefined {
    if (!token) return undefined;
    const sessionKey = this.hashToken(token);
    const expiry = this.adminSessionExpiry.get(sessionKey);
    if (expiry !== undefined && expiry <= Date.now()) {
      this.adminSessions.delete(sessionKey);
      this.adminSessionExpiry.delete(sessionKey);
      this.changed();
      return undefined;
    }
    return this.adminSessions.get(sessionKey);
  }

  protected revokeAdminSubject(subject: string): void {
    let touched = false;
    for (const [sessionKey, current] of this.adminSessions) {
      if (current !== subject) continue;
      this.adminSessions.delete(sessionKey);
      this.adminSessionExpiry.delete(sessionKey);
      touched = true;
    }
    if (touched) this.changed();
  }

  adminLogin(email: string, password: string, totp: string): { token: string; user: string; role?: string } {
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
    return { ...this.issueAdminSession('env:platform_admin', '平台管理员'), role: 'platform_admin' };
  }

  adminLogout(token?: string): void {
    if (!token) return;
    const sessionKey = this.hashToken(token);
    this.adminSessions.delete(sessionKey);
    this.adminSessionExpiry.delete(sessionKey);
    this.changed();
  }

  isAdmin(token?: string): boolean {
    return this.adminSessionSubject(token) !== undefined;
  }

  adminStats(): unknown {
    const published = this.posts.filter((p) => p.status === 'published');
    const dayKey = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const postDay = (iso?: string) => {
      if (!iso) return '';
      const date = new Date(iso);
      return Number.isNaN(date.getTime()) ? '' : dayKey(date);
    };
    const today = new Date();
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - index));
      return date;
    });
    const weekPosts = days.map((day) => published.filter((post) => postDay(post.publishedAt) === dayKey(day)).length);
    const todayCases = this.cases.filter((item) => postDay(item.createdAt) === dayKey(today));
    const decidedToday = todayCases.filter((item) => item.status !== 'pending').length;
    return {
      registered: this.users.length,
      dau: new Set(this.sessions.values()).size,
      postsToday: published.filter((post) => postDay(post.publishedAt) === dayKey(today)).length,
      pending: this.cases.filter((c) => c.status === 'pending').length,
      reports: this.reports.filter((r) => r.status === 'pending').length,
      officialAccounts: this.officialAccounts.filter((a) => a.status === 'active').length,
      officialPending: this.officialAccounts.filter((a) => a.status !== 'active').length,
      p0: this.cases.filter((c) => c.risk === 'P0' && c.status === 'pending').length,
      p1: this.cases.filter((c) => c.risk === 'P1' && c.status === 'pending').length,
      reviewSla: todayCases.length ? `${Math.round((decidedToday / todayCases.length) * 100)}%` : '—',
      weekPosts,
      weekLabels: days.map((day) => ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][day.getDay()]),
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

  decideCase(
    caseId: string,
    decision: 'approved' | 'rejected',
    reason?: string,
    reviewer?: { id: string; name: string; role?: string }
  ): ModerationCase | undefined {
    const item = this.cases.find((c) => c.id === caseId);
    if (!item) return undefined;
    if (item.status !== 'pending') throw new Error('CASE_CLOSED');

    // 所有风险等级均由一名审核员直接终审；保留 reviews 作为操作留痕。
    item.reviews ||= [];
    item.reviews.push({
      reviewerId: reviewer?.id || 'platform',
      reviewerName: reviewer?.name || '平台管理员',
      decision,
      reason,
      createdAt: nowIso()
    });
    item.reviewConflict = false;
    item.decidedBy = reviewer?.name || '平台管理员';

    item.status = decision;
    item.reason = reason || item.reason;
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
    this.refreshOfficialExpiry();
    this.decorateOfficialOperators();
    return this.officialAccounts;
  }

  getOfficialAccount(accountId: string): OfficialAccount | undefined {
    this.refreshOfficialExpiry();
    const item = this.officialAccounts.find((a) => a.id === accountId);
    if (item) this.decorateOfficialOperator(item);
    return item;
  }

  private activateOfficial(user: User, orgName: string): void {
    if (user.role !== 'official') {
      user.officialBaseRole = user.role === 'creator' ? 'creator' : 'student';
      user.officialBaseLevel = user.level === 'L4' ? 'L1' : user.level;
    }
    user.isOfficial = true;
    user.role = 'official';
    user.level = 'L4';
    user.officialOrg = orgName;
  }

  private deactivateOfficial(user: User): void {
    if (!user.isOfficial && user.role !== 'official') return;
    user.isOfficial = false;
    user.role = user.officialBaseRole || 'student';
    user.level = user.officialBaseLevel || 'L1';
    user.officialOrg = undefined;
  }

  private decorateOfficialOperator(item: OfficialAccount): void {
    const operator = this.users.find((u) => u.id === item.userId);
    const bound = Boolean(operator && !/^u_official(_|$)/.test(operator.id));
    item.operatorUserId = bound ? operator!.publicId : undefined;
    item.operatorNickname = bound ? operator!.nickname : undefined;
  }

  private decorateOfficialOperators(): void {
    for (const item of this.officialAccounts) this.decorateOfficialOperator(item);
  }

  isOfficialOperatorBound(accountId: string): boolean {
    const item = this.officialAccounts.find((a) => a.id === accountId);
    if (!item) return false;
    const operator = this.users.find((u) => u.id === item.userId);
    return Boolean(operator && !/^u_official(_|$)/.test(operator.id) && operator.status !== 'deleted' && operator.status !== 'banned');
  }

  bindOfficialOperator(accountId: string, userPublicId: string): OfficialAccount {
    const item = this.officialAccounts.find((a) => a.id === accountId);
    if (!item) throw new Error('OFFICIAL_ACCOUNT_NOT_FOUND');
    const target = this.users.find((u) => u.publicId === userPublicId || u.id === userPublicId);
    if (!target) throw new Error('OFFICIAL_OPERATOR_NOT_FOUND');
    if (/^u_official(_|$)/.test(target.id)) throw new Error('OFFICIAL_OPERATOR_PLACEHOLDER');
    if (target.status === 'deleted' || target.status === 'banned') throw new Error('OFFICIAL_OPERATOR_DISABLED');
    if (target.status === 'muted' && target.mutedUntil && new Date(target.mutedUntil).getTime() > Date.now()) {
      throw new Error('OFFICIAL_OPERATOR_MUTED');
    }
    if (this.officialAccounts.some((a) => a.id !== accountId && a.userId === target.id)) {
      throw new Error('OFFICIAL_OPERATOR_ALREADY_BOUND');
    }
    const previousId = item.userId;
    item.userId = target.id;
    item.operatorNickname = target.nickname;
    if (item.status === 'active') {
      this.activateOfficial(target, item.orgName);
      const previous = this.users.find((u) => u.id === previousId);
      const stillBound = this.officialAccounts.some((a) => a.userId === previousId);
      if (previous && previous.id !== target.id && !stillBound) this.deactivateOfficial(previous);
    }
    this.changed();
    return item;
  }

  unbindOfficialOperator(accountId: string): OfficialAccount {
    const item = this.officialAccounts.find((a) => a.id === accountId);
    if (!item) throw new Error('OFFICIAL_ACCOUNT_NOT_FOUND');
    const previous = this.users.find((user) => user.id === item.userId);
    if (previous && !/^u_official(_|$)/.test(previous.id)) this.deactivateOfficial(previous);
    const placeholderId = id('u_official');
    this.users.push({
      id: placeholderId,
      publicId: placeholderId,
      nickname: item.orgName,
      avatar: '',
      role: 'student',
      level: 'L1',
      isOfficial: false,
      officialOrg: item.orgName,
      createdAt: nowIso()
    });
    item.userId = placeholderId;
    item.operatorUserId = undefined;
    item.operatorNickname = undefined;
    this.changed();
    return item;
  }

  createOfficialAccount(input: {
    orgName: string;
    orgId?: string;
    scope: string[];
    expiresAt: string;
  }): OfficialAccount {
    const orgId = input.orgId?.trim();
    if (orgId && this.officialAccounts.some((account) => account.orgId?.toLowerCase() === orgId.toLowerCase())) {
      throw new Error('ORG_ID_EXISTS');
    }
    const userId = id('u_official');
    const user: User = {
      id: userId,
      publicId: userId,
      nickname: input.orgName,
      avatar: '',
      role: 'official',
      level: 'L4',
      isOfficial: false,
      officialOrg: input.orgName,
      createdAt: nowIso()
    };
    this.users.push(user);
    const account: OfficialAccount = {
      id: id('oa'),
      userId,
      orgName: input.orgName,
      orgId,
      schoolId: 'campus',
      scope: input.scope,
      status: 'pending_school',
      expiresAt: input.expiresAt,
      createdAt: nowIso()
    };
    this.officialAccounts.unshift(account);
    this.changed();
    return account;
  }

  updateOfficialAccount(accountId: string, patch: { orgName?: string; orgId?: string; scope?: string[]; expiresAt?: string }): OfficialAccount | undefined {
    const item = this.officialAccounts.find((a) => a.id === accountId);
    if (!item) return undefined;
    const nextOrgId = patch.orgId?.trim();
    if (nextOrgId && this.officialAccounts.some((a) => a.id !== accountId && a.orgId?.toLowerCase() === nextOrgId.toLowerCase())) {
      throw new Error('ORG_ID_EXISTS');
    }
    if (patch.orgName !== undefined) {
      item.orgName = patch.orgName;
      const owner = this.users.find((user) => user.id === item.userId);
      if (owner && /^u_official(_|$)/.test(owner.id)) owner.nickname = patch.orgName;
    }
    if (patch.orgId !== undefined) item.orgId = nextOrgId;
    if (patch.scope !== undefined) item.scope = patch.scope;
    if (patch.expiresAt !== undefined) item.expiresAt = patch.expiresAt;
    this.changed();
    return item;
  }

  attachOfficialAuthorization(accountId: string, file: { key: string; name: string; mime: string; size: number }): OfficialAccount | undefined {
    const item = this.officialAccounts.find((a) => a.id === accountId);
    if (!item) return undefined;
    item.authorizationFile = file.key;
    item.authorizationFileName = file.name;
    item.authorizationMime = file.mime;
    item.authorizationSize = file.size;
    this.changed();
    return item;
  }

  reviewOfficialAccount(
    accountId: string,
    status: OfficialAccount['status'],
    reviewer?: { id: number; role: 'platform_admin' | 'content_reviewer' | 'school_reviewer'; displayName: string }
  ): OfficialAccount | undefined {
    const item = this.officialAccounts.find((a) => a.id === accountId);
    if (!item) return undefined;
    const now = nowIso();
    item.status = status;
    if (status === 'pending_platform') {
      item.schoolReviewedBy = reviewer?.displayName || '学校审核人';
      item.schoolReviewedById = reviewer?.id;
      item.schoolReviewedAt = now;
    }
    if (status === 'active' || status === 'suspended') {
      item.platformReviewedBy = reviewer?.displayName || '平台管理员';
      item.platformReviewedById = reviewer?.id;
      item.platformReviewedAt = now;
    }
    if (status === 'active') {
      item.effectiveAt = now;
      if (item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now()) {
        item.status = 'expired';
      }
    }
    const owner = this.users.find((u) => u.id === item.userId);
    if (owner) {
      if (item.status === 'active') this.activateOfficial(owner, item.orgName);
      else if (item.status === 'suspended' || item.status === 'expired') this.deactivateOfficial(owner);
    }
    this.changed();
    return item;
  }

  private refreshOfficialExpiry(): void {
    let dirty = false;
    for (const item of this.officialAccounts) {
      if (item.status === 'active' && item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now()) {
        item.status = 'expired';
        const owner = this.users.find((u) => u.id === item.userId);
        if (owner) this.deactivateOfficial(owner);
        dirty = true;
      }
    }
    if (dirty) this.changed();
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

  getReport(reportId: string): Report | undefined {
    return this.reports.find((r) => r.id === reportId);
  }

  createAppeal(
    token: string | undefined,
    input: { targetType: 'post' | 'comment' | 'user'; targetId: string; reason: string }
  ): Appeal {
    const user = this.getUserByToken(token);
    if (!user) throw new Error('AUTH_REQUIRED');
    let targetId = input.targetId;
    if (input.targetType === 'post') {
      const post = this.posts.find((item) => item.id === targetId);
      if (!post) throw new Error('NOT_FOUND');
      if (post.authorId !== user.id) throw new Error('FORBIDDEN');
      if (post.status !== 'hidden' && post.status !== 'rejected') throw new Error('NOT_APPEALABLE');
      targetId = post.id;
    } else if (input.targetType === 'comment') {
      const comment = this.comments.find((item) => item.id === targetId);
      if (!comment) throw new Error('NOT_FOUND');
      if (comment.authorId !== user.id) throw new Error('FORBIDDEN');
      if (comment.status !== 'hidden') throw new Error('NOT_APPEALABLE');
      targetId = comment.id;
    } else {
      if (user.id !== targetId) throw new Error('FORBIDDEN');
      if (user.status === 'active') throw new Error('NOT_APPEALABLE');
      targetId = user.id;
    }
    const existing = this.appeals.find(
      (item) => item.userId === user.id && item.targetType === input.targetType && item.targetId === targetId && item.status === 'pending'
    );
    if (existing) throw new Error('APPEAL_DUPLICATE');
    const appeal: Appeal = {
      id: id('appeal'),
      userId: user.id,
      targetType: input.targetType,
      targetId,
      reason: input.reason,
      status: 'pending',
      createdAt: nowIso()
    };
    this.appeals.unshift(appeal);
    this.changed();
    return appeal;
  }

  getMyAppeals(token?: string): Appeal[] {
    const user = this.getUserByToken(token);
    if (!user) throw new Error('AUTH_REQUIRED');
    return this.appeals.filter((item) => item.userId === user.id);
  }

  getAdminAppeals(): Array<Appeal & { user?: User; targetText?: string; targetStatus?: string }> {
    return this.appeals.map((appeal) => {
      const user = this.users.find((item) => item.id === appeal.userId);
      let targetText = '';
      let targetStatus = '';
      if (appeal.targetType === 'post') {
        const post = this.posts.find((item) => item.id === appeal.targetId);
        targetText = post?.text || '';
        targetStatus = post?.status || 'missing';
      } else if (appeal.targetType === 'comment') {
        const comment = this.comments.find((item) => item.id === appeal.targetId);
        targetText = comment?.text || '';
        targetStatus = comment?.status || 'missing';
      } else {
        const target = this.users.find((item) => item.id === appeal.targetId);
        targetText = target ? `${target.nickname}（${target.publicId}）` : '';
        targetStatus = target?.status || 'missing';
      }
      return { ...appeal, user, targetText, targetStatus };
    });
  }

  resolveAppeal(
    appealId: string,
    status: 'approved' | 'rejected',
    options: { reason?: string; handledBy?: string; reviewerId?: string } = {}
  ): Appeal | undefined {
    const appeal = this.appeals.find((item) => item.id === appealId);
    if (!appeal) return undefined;
    if (appeal.status !== 'pending') throw new Error('APPEAL_CLOSED');
    if (options.reviewerId) {
      const reviewerId = String(options.reviewerId);
      const handledReport = this.reports.some((report) =>
        report.targetType === appeal.targetType
        && report.targetId === appeal.targetId
        && report.status === 'resolved'
        && String(report.handledById || '') === reviewerId
      );
      const reviewedCase = this.cases.some((item) =>
        item.targetType === appeal.targetType
        && item.targetId === appeal.targetId
        && (item.reviews || []).some((review) => String(review.reviewerId) === reviewerId)
      );
      if (handledReport || reviewedCase) throw new Error('APPEAL_SELF_REVIEW');
    }
    appeal.status = status;
    appeal.decisionReason = options.reason;
    appeal.handledBy = options.handledBy;
    appeal.handledAt = nowIso();
    if (status === 'approved') {
      if (appeal.targetType === 'post') {
        const post = this.posts.find((item) => item.id === appeal.targetId);
        if (post) {
          post.status = 'published';
          post.publishedAt = nowIso();
          post.heatScore = this.computePostHeat(post);
        }
      } else if (appeal.targetType === 'comment') {
        const comment = this.comments.find((item) => item.id === appeal.targetId);
        if (comment) comment.status = 'published';
      } else {
        const user = this.users.find((item) => item.id === appeal.targetId);
        if (user && user.status !== 'deleted') {
          user.status = 'active';
          user.mutedUntil = undefined;
          user.statusReason = undefined;
        }
      }
    }
    this.notifyReview(
      appeal.userId,
      status === 'approved' ? '你的申诉已通过' : '你的申诉未通过',
      options.reason || (status === 'approved' ? '相关内容已恢复，请遵守社区公约。' : '复核维持原处理结果。'),
      '/pages/notifications/index'
    );
    this.changed();
    return appeal;
  }



  getAdminReports(): AdminReport[] {
    return this.reports.map((report) => this.toAdminReport(report));
  }

  getAdminReport(reportId: string): AdminReport | undefined {
    const report = this.reports.find((item) => item.id === reportId);
    return report ? this.toAdminReport(report) : undefined;
  }

  private toAdminReport(report: Report): AdminReport {
    return {
      ...report,
      reporterName: this.users.find((user) => user.id === report.reporterId)?.nickname || '用户',
      target: this.reportTargetView(report)
    };
  }

  private reportTargetView(report: Report): ReportTargetView {
    if (report.targetType === 'post') {
      const post = this.posts.find((item) => item.id === report.targetId);
      if (!post) return { type: 'post', id: report.targetId, exists: false };
      const author = this.users.find((user) => user.id === post.authorId);
      return {
        type: 'post',
        id: post.id,
        exists: true,
        status: post.status,
        text: post.text,
        authorName: post.anonymity ? (post.anonymousAlias || '匿名同学') : (author?.nickname || '同学'),
        authorId: post.anonymity ? undefined : post.authorId,
        media: post.media.map((media) => media.url),
        createdAt: post.createdAt
      };
    }
    if (report.targetType === 'comment') {
      const comment = this.comments.find((item) => item.id === report.targetId);
      if (!comment) return { type: 'comment', id: report.targetId, exists: false };
      const author = this.users.find((user) => user.id === comment.authorId);
      const post = this.posts.find((item) => item.id === comment.postId);
      return {
        type: 'comment',
        id: comment.id,
        exists: true,
        status: comment.status,
        text: comment.text,
        authorName: comment.anonymity ? (comment.anonymousAlias || '匿名同学') : (author?.nickname || '同学'),
        authorId: comment.anonymity ? undefined : comment.authorId,
        postId: comment.postId,
        postText: post?.text,
        createdAt: comment.createdAt
      };
    }
    const user = this.users.find((item) => item.id === report.targetId);
    return user
      ? { type: 'user', id: user.id, exists: true, nickname: user.nickname, avatar: user.avatar, createdAt: user.createdAt }
      : { type: 'user', id: report.targetId, exists: false };
  }

  setReportAi(reportId: string, ai: ReportAi): Report | undefined {
    const report = this.reports.find((item) => item.id === reportId);
    if (!report) return undefined;
    report.ai = ai;
    this.changed();
    return report;
  }

  resolveReport(
    reportId: string,
    status: 'resolved' | 'rejected',
    options: { ai?: ReportAi; hide?: boolean; handledBy?: string; handledById?: string } = {}
  ): Report | undefined {
    const report = this.reports.find((r) => r.id === reportId);
    if (!report) return undefined;
    const wasPending = report.status === 'pending';
    report.status = status;
    if (options.ai) report.ai = options.ai;
    report.handledById = options.handledById;
    report.handledAt = nowIso();
    if (wasPending && status === 'resolved' && options.hide !== false) {
      this.hideReportedTarget(report);
    }
    if (wasPending) {
      this.notificationForUser(
        report.reporterId,
        status === 'resolved' ? '你的举报已处理' : '你的举报未通过复核',
        status === 'resolved' ? '经复核，被举报内容已处理。' : '经复核，当前证据不足以认定违规。',
        '/pages/notifications/index'
      );
    }
    this.changed();
    return report;
  }

  private hideReportedTarget(report: Report): void {
    if (report.targetType === 'post') {
      const post = this.posts.find((item) => item.id === report.targetId);
      if (!post) return;
      post.status = 'hidden';
      this.notifyReview(
        post.authorId,
        '你的分享因举报被隐藏',
        report.ai?.reason || '经复核，内容不符合社区公约，已暂时隐藏。',
        `/pages/post/detail?id=${post.id}`
      );
      return;
    }
    if (report.targetType === 'comment') {
      const comment = this.comments.find((item) => item.id === report.targetId);
      if (!comment) return;
      const wasPublished = comment.status === 'published';
      comment.status = 'hidden';
      const post = this.posts.find((item) => item.id === comment.postId);
      if (wasPublished && post) {
        post.commentCount = Math.max(0, post.commentCount - 1);
      }
      this.notifyReview(
        comment.authorId,
        '你的评论因举报被隐藏',
        report.ai?.reason || '经复核，内容不符合社区公约，已暂时隐藏。',
        comment.postId ? `/pages/post/detail?id=${comment.postId}` : '/pages/me/list?type=comments'
      );
    }
  }

  private notificationForUser(userId: string, title: string, body: string, link: string): void {
    if (!userId) return;
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
      createdAt: post.createdAt,
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

  private toCommentView(comment: Comment, viewer?: User): unknown {
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
      createdAt: comment.createdAt,
      isMine: Boolean(viewer && viewer.id === comment.authorId)
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
