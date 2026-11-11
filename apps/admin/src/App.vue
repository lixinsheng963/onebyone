<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { adminLogin, adminLogout, clearToken, getDashboard, getOfficialAccounts, getReports, hasToken } from './api';
import DashboardView from './views/DashboardView.vue';
import ModerationView from './views/ModerationView.vue';
import NoticesView from './views/NoticesView.vue';
import OfficialView from './views/OfficialView.vue';
import RankingView from './views/RankingView.vue';
import ReportsView from './views/ReportsView.vue';

type ViewKey = 'dashboard' | 'moderation' | 'official' | 'notices' | 'reports' | 'ranking';

const nav: Array<{ key: ViewKey; label: string; en: string; icon: string }> = [
  { key: 'dashboard', label: '概览', en: 'Overview', icon: '◒' },
  { key: 'moderation', label: '审核队列', en: 'Moderation', icon: '◷' },
  { key: 'official', label: '官方账号', en: 'Official', icon: '◈' },
  { key: 'notices', label: '通知', en: 'Notices', icon: '▤' },
  { key: 'reports', label: '举报', en: 'Reports', icon: '⚑' },
  { key: 'ranking', label: '热度配置', en: 'Ranking', icon: '↗' }
];

const active = ref<ViewKey>('dashboard');
const authed = ref(false);
const loginError = ref('');
const login = ref({ email: '', password: '', totp: '' });
const badgeCounts = ref({ moderation: 0, official: 0, reports: 0 });
let badgeTimer: number | undefined;
const views = { dashboard: DashboardView, moderation: ModerationView, official: OfficialView, notices: NoticesView, reports: ReportsView, ranking: RankingView };
const currentView = computed(() => views[active.value]);
const current = computed(() => nav.find((item) => item.key === active.value)!);

onMounted(() => {
  authed.value = hasToken();
  if (authed.value) startBadgePolling();
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
    const [dashboard, official, reports] = await Promise.all([getDashboard(), getOfficialAccounts(), getReports()]);
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
    await adminLogin(login.value.email, login.value.password, login.value.totp);
    authed.value = true;
    startBadgePolling();
  } catch (error) {
    loginError.value = (error as Error).message || '账号、密码或动态验证码不正确';
  }
}

function signOut() {
  authed.value = false;
  if (badgeTimer) window.clearInterval(badgeTimer);
  adminLogout().catch(() => clearToken());
}
</script>

<template>
  <div v-if="!authed" class="login-shell">
    <div class="login-art">
      <div class="login-brand"><span>日</span> 校园日常</div>
      <div class="login-quote">
        <div class="login-kicker">CAMPUS DESK / 单校运营台</div>
        <h1>把今天的小事，<br />认真地接下来。</h1>
        <p>内容审核、官方通知、热度配置。所有判断留痕，所有操作可回看。</p>
      </div>
      <div class="login-foot">2C4G · 单校版 · v0.1.0</div>
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
          v-for="item in nav"
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
        <div class="side-meta">v0.1.0 · 2C4G MVP</div>
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
          <button class="ghost-btn" @click="active = 'notices'">＋ 发通知</button>
          <button class="avatar-btn" title="退出登录" @click="signOut">何</button>
        </div>
      </header>

      <div class="page">
        <component :is="currentView" @go="(key: ViewKey) => (active = key)" @changed="refreshBadges" />
      </div>
    </main>
  </div>
</template>
