import type { HotItem, ModerationCase, Notice, OfficialAccount, RankingConfig, Report } from './types';

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
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
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
  const data = await request<{ token: string; user: string }>('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, totp })
  });
  sessionStorage.setItem(TOKEN_KEY, data.token);
  return data;
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
      author: post.anonymity ? post.anonymousAlias || '匿名同学' : item.author?.nickname || '同学',
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
  return request(`/admin/moderation/${caseId}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, reason })
  });
}

function mapOfficial(item: any): OfficialAccount {
  return {
    id: item.id,
    orgName: item.orgName,
    owner: item.userId || '未绑定',
    scope: Array.isArray(item.scope) ? item.scope : [],
    status: item.status,
    authorization: item.authorizationFile || '授权文件待上传'
  };
}

export async function getOfficialAccounts(): Promise<OfficialAccount[]> {
  const data = await request<any[]>('/admin/official-accounts');
  return data.map(mapOfficial);
}

export async function reviewOfficial(accountId: string, status: string) {
  return request(`/admin/official-accounts/${accountId}/review`, {
    method: 'POST',
    body: JSON.stringify({ status })
  });
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
  const effectiveTo = new Date(Date.now() + 24 * 3600_000).toISOString();
  return request('/admin/notices', {
    method: 'POST',
    body: JSON.stringify({ ...input, effectiveTo })
  });
}

function mapReport(item: any): Report {
  return {
    id: item.id,
    target: item.targetId,
    targetType: item.targetType === 'post' ? '帖子' : item.targetType === 'comment' ? '评论' : '账号',
    reason: item.reason || item.reasonCode || '其他',
    reporter: item.reporterId || '匿名',
    status: item.status,
    createdAt: clock(item.createdAt)
  };
}

export async function getReports(): Promise<Report[]> {
  const data = await request<any[]>('/admin/reports');
  return data.map(mapReport);
}

export async function resolveReport(id: string, status: 'resolved' | 'rejected') {
  return request(`/admin/reports/${id}/decision`, {
    method: 'POST',
    body: JSON.stringify({ status })
  });
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
