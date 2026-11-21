<script setup lang="ts">
import { computed, onBeforeUnmount, onErrorCaptured, onMounted, ref, watch } from 'vue';
import { adminLogin, adminLogout, clearToken, getAdminMe, getDashboard, getOfficialAccounts, getReports, hasToken } from './api';
import type { AdminRole } from './types';
import AuditLogsView from './views/AuditLogsView.vue';
import AppealsView from './views/AppealsView.vue';
import AppealHistoryView from './views/AppealHistoryView.vue';
import DashboardView from './views/DashboardView.vue';
import InviteCodesView from './views/InviteCodesView.vue';
import ModerationView from './views/ModerationView.vue';
import NoticesView from './views/NoticesView.vue';
import OfficialView from './views/OfficialView.vue';
import RankingView from './views/RankingView.vue';
import ReportsView from './views/ReportsView.vue';
import TeamView from './views/TeamView.vue';
import UsersView from './views/UsersView.vue';

type ViewKey = 'dashboard' | 'moderation' | 'users' | 'appeals' | 'appealHistory' | 'official' | 'notices' | 'reports' | 'ranking' | 'invites' | 'audit' | 'team';

const nav: Array<{ key: ViewKey; label: string; en: string; icon: string }> = [
  { key: 'dashboard', label: '概览', en: 'Overview', icon: '◒' },
  { key: 'moderation', label: '审核队列', en: 'Moderation', icon: '◷' },
  { key: 'users', label: '用户治理', en: 'Users', icon: '☷' },
  { key: 'appeals', label: '申诉复核', en: 'Appeals', icon: '↺' },
  { key: 'appealHistory', label: '已审核申诉', en: 'Appeal History', icon: '✓' },
  { key: 'official', label: '官方账号', en: 'Official', icon: '◈' },
  { key: 'notices', label: '通知', en: 'Notices', icon: '▤' },
  { key: 'reports', label: '举报', en: 'Reports', icon: '⚑' },
  { key: 'ranking', label: '热度配置', en: 'Ranking', icon: '↗' },
  { key: 'invites', label: '邀请码', en: 'Invites', icon: '⌁' },
  { key: 'audit', label: '审计日志', en: 'Audit', icon: '◫' },
  { key: 'team', label: '团队权限', en: 'Team', icon: '◎' }
];

const roleNav: Record<AdminRole, ViewKey[]> = {
  platform_admin: nav.map((item) => item.key),
  content_reviewer: ['dashboard', 'moderation', 'users', 'appeals', 'appealHistory', 'reports'],
  school_reviewer: ['dashboard', 'official', 'notices']
};

const active = ref<ViewKey>('dashboard');
const role = ref<AdminRole>('platform_admin');
const viewError = ref('');
const authed = ref(false);
const booting = ref(true);
const loginError = ref('');
const login = ref({ email: '', password: '', totp: '' });
const badgeCounts = ref({ moderation: 0, official: 0, reports: 0 });
let badgeTimer: number | undefined;
const views = { dashboard: DashboardView, moderation: ModerationView, users: UsersView, appeals: AppealsView, appealHistory: AppealHistoryView, official: OfficialView, notices: NoticesView, reports: ReportsView, ranking: RankingView, invites: InviteCodesView, audit: AuditLogsView, team: TeamView };
const visibleNav = computed(() => nav.filter((item) => roleNav[role.value].includes(item.key)));
const currentView = computed(() => views[active.value]);
const current = computed(() => (visibleNav.value.find((item) => item.key === active.value) || visibleNav.value[0])!);
const canNotify = computed(() => role.value !== 'content_reviewer');

onMounted(async () => {
  if (!hasToken()) {
    booting.value = false;
    return;
  }
  try {
    role.value = (await getAdminMe()).role;
    if (!roleNav[role.value].includes(active.value)) active.value = 'dashboard';
    authed.value = true;
    startBadgePolling();
  } catch {
    authed.value = false;
    clearToken();
  } finally {
    booting.value = false;
  }
});

onErrorCaptured((error, _instance, info) => {
  viewError.value = `页面加载异常：${(error as Error)?.message || '未知错误'}`;
  console.error('Admin view crashed:', info, error);
  return false;
});

watch(active, () => {
  viewError.value = '';
});

onBeforeUnmount(() => {
  if (badgeTimer) window.clearInterval(badgeTimer);
});

function badgeFor(key: ViewKey): string {
  if (key === 'moderation') return formatBadge(badgeCounts.value.moderation);
  if (key === 'official') return formatBadge(badgeCounts.value.official);
  if (key === 'reports') return formatBadge(badgeCounts.value.reports);
  return '';
}

function formatBadge(count: number): string {
  return count > 99 ? '99+' : count > 0 ? String(count) : '';
}

async function refreshBadges() {
  if (!hasToken()) return;
  try {
    const dashboard = await getDashboard();
    let official: Array<{ status: string }> = [];
    let reports: Array<{ status: string }> = [];
    if (role.value === 'platform_admin') {
      [official, reports] = await Promise.all([getOfficialAccounts(), getReports()]);
    } else if (role.value === 'content_reviewer') {
      reports = await getReports();
    } else {
      official = await getOfficialAccounts();
    }
    badgeCounts.value = {
      moderation: Number(dashboard.stats.pending || 0),
      official: official.filter((item) => item.status !== 'active').length,
      reports: reports.filter((item) => item.status === 'pending').length
    };
  } catch {
    // 静默失败，不阻塞当前页面。
  }
}

function startBadgePolling() {
  refreshBadges();
  if (badgeTimer) window.clearInterval(badgeTimer);
  badgeTimer = window.setInterval(refreshBadges, 3000);
}

async function signIn() {
  loginError.value = '';
  try {
    const session = await adminLogin(login.value.email, login.value.password, login.value.totp);
    role.value = session.role;
    active.value = 'dashboard';
    authed.value = true;
    startBadgePolling();
  } catch (error) {
    loginError.value = (error as Error).message || '账号、密码或动态验证码不正确';
  }
}

function signOut() {
  authed.value = false;
  role.value = 'platform_admin';
  if (badgeTimer) window.clearInterval(badgeTimer);
  adminLogout().catch(() => clearToken());
}

function reloadPage() {
  window.location.reload();
}
</script>

<template>
  <div v-if="booting" class="boot-screen">
    <div class="boot-mark">日</div>
    <p>正在验证管理身份…</p>
  </div>

  <div v-else-if="!authed" class="login-shell">
    <div class="login-art">
      <div class="login-brand"><span>日</span> 校园日常</div>
      <div class="login-quote">
        <div class="login-kicker">CAMPUS DESK / 单校运营台</div>
        <h1>把今天的小事，<br />认真地接下来。</h1>
        <p>内容审核、官方通知、热度配置。所有判断留痕，所有操作可回看。</p>
      </div>
      <div class="login-foot">2C4G · 单校版 · v0.3.0-rc.12</div>
    </div>
    <div class="login-panel">
      <div class="login-form">
        <div class="eyebrow">ADMIN ACCESS</div>
        <h2>登录管理后台</h2>
        <p class="login-help">请使用管理员邮箱、密码和动态验证码登录。</p>
        <div class="field">
          <label>邮箱</label>
          <input v-model="login.email" class="input" autocomplete="username" />
        </div>
        <div class="field">
          <label>密码</label>
          <input v-model="login.password" class="input" type="password" autocomplete="current-password" />
        </div>
        <div class="field">
          <label>动态验证码</label>
          <input v-model="login.totp" class="input" inputmode="numeric" maxlength="6" />
        </div>
        <div v-if="loginError" class="login-error">{{ loginError }}</div>
        <button class="btn btn-primary login-submit" @click="signIn">进入后台</button>
        <div class="login-demo">账号信息由管理员在服务端配置，不在前端展示。</div>
      </div>
    </div>
  </div>

  <div v-else class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">日</div>
        <div>
          <div class="brand-title">校园日常</div>
          <div class="brand-sub">CAMPUS DESK</div>
        </div>
      </div>

      <div class="side-label">WORKSPACE / 单校版</div>
      <nav class="nav">
        <button
          v-for="item in visibleNav"
          :key="item.key"
          class="nav-item"
          :class="{ active: active === item.key }"
          @click="active = item.key"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-copy">
            <b>{{ item.label }}</b>
            <small>{{ item.en }}</small>
          </span>
          <span v-if="badgeFor(item.key)" class="nav-badge">{{ badgeFor(item.key) }}</span>
        </button>
      </nav>

      <div class="side-foot">
        <div class="duty-card">
          <div class="duty-dot"></div>
          <div>
            <b>今日值班</b>
            <p>小何 · 内容安全</p>
          </div>
        </div>
        <div class="side-meta">v0.3.0-rc.12 · 单校运营台</div>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div>
          <div class="eyebrow">{{ current.en }} / 单校运营台</div>
          <h1>{{ current.label }}</h1>
        </div>
        <div class="top-actions">
          <span class="live"><i></i> 数据实时</span>
          <button v-if="canNotify" class="ghost-btn" @click="active = 'notices'">＋ 发通知</button>
          <button class="avatar-btn" title="退出登录" @click="signOut">{{ role === 'school_reviewer' ? '校' : role === 'content_reviewer' ? '审' : '管' }}</button>
        </div>
      </header>

      <div class="page">
        <div v-if="viewError" class="view-error card">
          <div class="view-error-mark">!</div>
          <h2>页面加载异常</h2>
          <p>{{ viewError }}</p>
          <p>已保护管理台其他页面；刷新后会重新加载最新版本。</p>
          <button class="btn btn-primary" @click="reloadPage">刷新页面</button>
        </div>
        <component v-else :is="currentView" :key="active" :admin-role="role" @go="(key: ViewKey) => (active = key)" @changed="refreshBadges" />
      </div>
    </main>
  </div>
</template>

<style scoped>
.boot-screen { min-height: 100vh; display: grid; place-content: center; gap: 14px; text-align: center; background: var(--bg); color: var(--muted); }
.boot-mark { width: 56px; height: 56px; margin: 0 auto; border-radius: 50%; display: grid; place-items: center; background: var(--accent); color: #fff; font-family: var(--serif); font-size: 28px; }
.boot-screen p { margin: 0; font-size: 12px; letter-spacing: .08em; }
.view-error { max-width: 620px; margin: 10vh auto 0; padding: 32px; text-align: center; }
.view-error-mark { width: 42px; height: 42px; margin: 0 auto 14px; border-radius: 50%; display: grid; place-items: center; background: #fbe7e5; color: #a52828; font-family: var(--serif); font-size: 24px; }
.view-error h2 { margin: 0 0 8px; font-family: var(--serif); font-weight: 400; }
.view-error p { margin: 6px 0; color: var(--muted); font-size: 12px; line-height: 1.75; }
.view-error .btn { margin-top: 14px; }
</style>
