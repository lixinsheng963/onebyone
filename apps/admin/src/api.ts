import type { AdminIdentity, AdminOperator, AdminUser, Appeal, AuditLog, HotItem, InviteCode, ModerationCase, Notice, OfficialAccount, RankingConfig, Report } from './types';

const BASE = import.meta.env.VITE_API_BASE || '/api/v1';
const TOKEN_KEY = 'campus_admin_token';

export function hasToken() {
  return Boolean(sessionStorage.getItem(TOKEN_KEY));
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const isForm = options.body instanceof FormData;
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(isForm ? {} : { 'content-type': 'application/json' }),
      ...(token ? { 'x-admin-token': token } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.code !== 'OK') {
    if (response.status === 401) clearToken();
    throw new Error(payload?.message || `请求失败（${response.status}）`);
  }
  return payload.data as T;
}

export async function adminLogout() {
  try {
    await request('/admin/auth/logout', { method: 'POST' });
  } finally {
    clearToken();
  }
}

export async function adminLogin(email: string, password: string, totp: string) {
  const data = await request<{ token: string; user: string; role: AdminIdentity['role']; schoolId?: string; orgId?: string }>('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, totp })
  });
  sessionStorage.setItem(TOKEN_KEY, data.token);
  return data;
}

export async function getAdminMe(): Promise<AdminIdentity> {
  return request<AdminIdentity>('/admin/me');
}

export async function getOperators(): Promise<AdminOperator[]> {
  return request<AdminOperator[]>('/admin/operators');
}

export async function createOperator(input: {
  email: string;
  password: string;
  displayName?: string;
  role: 'school_reviewer' | 'content_reviewer';
  schoolId?: string;
  orgId?: string;
}) {
  return request<AdminOperator>('/admin/operators', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function revokeOperator(id: number) {
  return request<AdminOperator>(`/admin/operators/${id}/revoke`, { method: 'POST' });
}

export async function getUsers(): Promise<AdminUser[]> {
  return request<AdminUser[]>('/admin/users');
}

export async function setUserStatus(
  userId: string,
  status: AdminUser['status'],
  input: { mutedUntil?: string; reason?: string } = {}
) {
  return request<AdminUser>(`/admin/users/${encodeURIComponent(userId)}/status`, {
    method: 'POST',
    body: JSON.stringify({ status, ...input })
  });
}

export async function getAppeals(): Promise<Appeal[]> {
  return request<Appeal[]>('/admin/appeals');
}

export async function decideAppeal(appealId: string, status: 'approved' | 'rejected', reason?: string) {
  return request<Appeal>(`/admin/appeals/${encodeURIComponent(appealId)}/decision`, {
    method: 'POST',
    body: JSON.stringify({ status, reason })
  });
}

function clock(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function background(url?: string) {
  return url ? `center/cover url("${url}")` : 'linear-gradient(135deg,#d8c8ad,#8f7c66)';
}

function mapHot(item: any, index: number): HotItem {
  return {
    id: item.publicId,
    title: item.text,
    author: item.author?.isAnonymous ? item.author.alias || '匿名同学' : item.author?.nickname || '同学',
    score: item.heatScore ?? 0,
    likes: item.likeCount ?? 0,
    comments: item.commentCount ?? 0,
    cover: background(item.media?.[0]?.url)
  };
}

export async function getDashboard(): Promise<{ stats: any; hot: HotItem[] }> {
  const data = await request<any>('/admin/dashboard');
  return { stats: data, hot: (data.hot || []).map(mapHot) };
}

function mapCase(item: any): ModerationCase {
  const post = item.post || {};
  return {
    id: item.id,
    risk: item.risk,
    labels: item.labels || [],
    reason: item.reason || '',
    evidence: item.evidence || [],
    status: item.status === 'pending' ? 'pending' : item.status,
    post: {
      id: post.id || item.targetId,
      author: post.anonymity
        ? post.anonymousAlias || '匿名同学'
        : post.displayAuthor || item.author?.nickname || '同学',
      displayAuthor: post.anonymity ? post.anonymousAlias || '匿名同学' : post.displayAuthor,
      avatar: post.anonymity ? '' : post.avatar,
      alias: post.anonymousAlias,
      text: post.text || '（评论内容）',
      cover: background(post.media?.[0]?.url),
      topic: post.topic,
      location: post.location,
      createdAt: clock(post.createdAt || item.createdAt)
    }
  };
}

export async function getQueue(risk?: string): Promise<ModerationCase[]> {
  const query = risk && risk !== 'all' ? `?risk=${encodeURIComponent(risk)}` : '';
  const data = await request<any[]>(`/admin/moderation/queue${query}`);
  return data.map(mapCase);
}

export async function decideCase(caseId: string, decision: 'approved' | 'rejected', reason: string) {
  return request<ModerationCase>(`/admin/moderation/${caseId}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, reason })
  });
}

function mapOfficial(item: any): OfficialAccount {
  return {
    id: item.id,
    orgName: item.orgName,
    orgId: item.orgId,
    owner: item.userId || '未绑定',
    operatorUserId: item.operatorUserId,
    operatorNickname: item.operatorNickname,
    operatorAvatar: item.operatorAvatar,
    scope: Array.isArray(item.scope) ? item.scope : [],
    status: item.status,
    authorization: item.authorizationFile ? (item.authorizationFileName || '授权文件已上传') : '授权文件待上传',
    authorizationFileName: item.authorizationFileName,
    authorizationMime: item.authorizationMime,
    authorizationSize: item.authorizationSize,
    expiresAt: item.expiresAt,
    effectiveAt: item.effectiveAt,
    schoolReviewedBy: item.schoolReviewedBy,
    platformReviewedBy: item.platformReviewedBy
  };
}

export async function getOfficialAccounts(): Promise<OfficialAccount[]> {
  const data = await request<any[]>('/admin/official-accounts');
  return data.map(mapOfficial);
}

export async function bindOfficialOperator(accountId: string, userId: string) {
  return request(`/admin/official-accounts/${accountId}/operator`, {
    method: 'POST',
    body: JSON.stringify({ userId })
  });
}

export async function reviewOfficial(accountId: string, status: string) {
  return request(`/admin/official-accounts/${accountId}/review`, {
    method: 'POST',
    body: JSON.stringify({ status })
  });
}

export async function createOfficialAccount(input: { orgName: string; orgId?: string; scope: string[]; expiresAt: string }) {
  return request('/admin/official-accounts', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateOfficialAccount(accountId: string, input: { orgName?: string; orgId?: string; scope?: string[]; expiresAt?: string }) {
  return request(`/admin/official-accounts/${accountId}`, { method: 'PUT', body: JSON.stringify(input) });
}

export async function uploadOfficialAuthorization(accountId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  return request(`/admin/official-accounts/${accountId}/authorization`, { method: 'POST', body: form });
}

export async function downloadOfficialAuthorization(accountId: string): Promise<Blob> {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${BASE}/admin/official-accounts/${accountId}/authorization`, {
    headers: token ? { 'x-admin-token': token } : {}
  });
  if (!response.ok) throw new Error(`授权文件下载失败（${response.status}）`);
  return response.blob();
}

function mapNotice(item: any): Notice {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    type: item.type,
    source: item.source,
    status: item.status,
    effectiveTo: item.effectiveTo ? new Date(item.effectiveTo).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '未设置',
    createdAt: clock(item.createdAt)
  };
}

export async function getNotices(): Promise<Notice[]> {
  const data = await request<any[]>('/admin/notices');
  return data.map(mapNotice);
}

export async function createNotice(input: { title: string; body: string; type: 'normal' | 'emergency'; source: string; effectiveTo: string }) {
  return request('/admin/notices', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

function mapReport(item: any): Report {
  return {
    id: item.id,
    target: item.target || { type: item.targetType, id: item.targetId, exists: false },
    targetType: item.targetType === 'post' ? '帖子' : item.targetType === 'comment' ? '评论' : '账号',
    reason: item.reason || item.reasonCode || '其他',
    detail: item.detail,
    reporter: item.reporterName || item.reporterId || '匿名',
    reporterAvatar: item.reporterAvatar,
    status: item.status,
    ai: item.ai,
    handledAt: item.handledAt ? clock(item.handledAt) : undefined,
    createdAt: clock(item.createdAt)
  };
}

export async function getReports(): Promise<Report[]> {
  const data = await request<any[]>('/admin/reports');
  return data.map(mapReport);
}

export async function getReport(id: string): Promise<Report> {
  return mapReport(await request<any>(`/admin/reports/${id}`));
}

export async function resolveReport(id: string, status: 'resolved' | 'rejected') {
  return mapReport(await request<any>(`/admin/reports/${id}/decision`, {
    method: 'POST',
    body: JSON.stringify({ status })
  }));
}

export async function getRanking(): Promise<RankingConfig> {
  return request<RankingConfig>('/admin/ranking/config');
}

export async function saveRanking(config: RankingConfig) {
  return request('/admin/ranking/config', {
    method: 'PUT',
    body: JSON.stringify(config)
  });
}

export async function getInviteCodes(): Promise<InviteCode[]> {
  return request<InviteCode[]>('/admin/invite-codes');
}

export async function createInviteCode(input: { name?: string; code?: string; maxUses: number; expiresAt?: string }) {
  return request<{ id: number; code: string; name: string; maxUses: number; expiresAt: string }>('/admin/invite-codes', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function revokeInviteCode(id: number) {
  return request(`/admin/invite-codes/${id}/revoke`, { method: 'POST' });
}

export async function getAuditLogs(limit = 100): Promise<AuditLog[]> {
  return request<AuditLog[]>(`/admin/audit-logs?limit=${limit}`);
}
