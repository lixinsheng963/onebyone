<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getDashboard, getQueue } from '../api';
import type { HotItem, ModerationCase } from '../types';

const emit = defineEmits<{ go: [key: 'moderation' | 'reports' | 'notices' | 'ranking'] }>();
const stats = ref<any>({
  registered: 0,
  dau: 0,
  postsToday: 0,
  pending: 0,
  reports: 0,
  official: 0,
  p0: 0,
  p1: 0,
  reviewSla: '—',
  weekPosts: [0, 0, 0, 0, 0, 0, 0],
  weekLabels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
});
const hotItems = ref<HotItem[]>([]);
const pending = ref<ModerationCase[]>([]);
const error = ref('');
const maxPost = computed(() => Math.max(...(stats.value.weekPosts || [1]), 1));

onMounted(async () => {
  try {
    const [dashboard, queue] = await Promise.all([getDashboard(), getQueue()]);
    stats.value = dashboard.stats;
    hotItems.value = dashboard.hot;
    pending.value = queue.slice(0, 4);
  } catch (e) {
    error.value = (e as Error).message;
  }
});
</script>

<template>
  <div class="stack">
    <div v-if="error" class="api-error">API 连接失败：{{ error }}</div>
    <section class="grid-4">
      <article class="card stat-card">
        <div class="stat-label">注册用户</div>
        <div class="stat-value">{{ stats.registered.toLocaleString() }}</div>
        <div class="stat-foot"><span class="up">↑ 12.6%</span> 较上周</div>
      </article>
      <article class="card stat-card">
        <div class="stat-label">今日活跃</div>
        <div class="stat-value">{{ stats.dau }}</div>
        <div class="stat-foot"><span class="up">↑ 8.2%</span> 较昨日</div>
      </article>
      <article class="card stat-card">
        <div class="stat-label">今日新帖</div>
        <div class="stat-value">{{ stats.postsToday }}</div>
        <div class="stat-foot">目标 30 · <span class="up">86%</span></div>
      </article>
      <article class="card stat-card">
        <div class="stat-label">待审核</div>
        <div class="stat-value">{{ stats.pending }}</div>
        <div class="stat-foot"><span style="color: var(--accent)">P1 {{ stats.p1 }}</span> · P0 {{ stats.p0 }}</div>
      </article>
    </section>

    <section class="grid-2">
      <article class="card">
        <div class="card-head">
          <div>
            <h2>本周内容节奏</h2>
            <p>每天的新增帖子，周末明显更活跃</p>
          </div>
          <span class="badge badge-green">7 日</span>
        </div>
        <div class="card-body">
          <div class="bars">
            <div v-for="(value, index) in stats.weekPosts" :key="index" class="bar-col">
              <div class="bar" :style="{ height: `${(value / maxPost) * 100}%` }"></div>
              <span class="bar-label">{{ stats.weekLabels[index] }}</span>
            </div>
          </div>
          <div class="dash-note">
            <div><b>61</b><span>周日晚高峰</span></div>
            <div><b>32</b><span>周一低谷</span></div>
            <div><b>44</b><span>日均</span></div>
          </div>
        </div>
      </article>

      <article class="card">
        <div class="card-head">
          <div>
            <h2>今日提醒</h2>
            <p>先处理会影响信任的事</p>
          </div>
        </div>
        <div class="card-body">
          <div class="alert-row">
            <span class="badge badge-p0">P0</span>
            <div><b>0 条</b><p>当前没有紧急安全事件</p></div>
          </div>
          <div class="alert-row">
            <span class="badge badge-p1">P1</span>
            <div><b>2 条</b><p>隐私/挂人，需 2 小时内处理</p></div>
          </div>
          <div class="alert-row">
            <span class="badge badge-blue">官方</span>
            <div><b>2 个</b><p>官方账号待学校/平台审核</p></div>
          </div>
          <div class="alert-row">
            <span class="badge badge-gray">SLA</span>
            <div><b>{{ stats.reviewSla }}</b><p>今日审核按时率</p></div>
          </div>
        </div>
      </article>
    </section>

    <section class="grid-2">
      <article class="card">
        <div class="card-head">
          <div>
            <h2>待审核队列</h2>
            <p>按风险优先，P1 在最上面</p>
          </div>
          <button class="btn btn-outline btn-sm" @click="emit('go', 'moderation')">进入队列 →</button>
        </div>
        <div class="card-body">
          <div v-for="item in pending" :key="item.id" class="queue-row" @click="emit('go', 'moderation')">
            <span class="badge" :class="`badge-${item.risk.toLowerCase()}`">{{ item.risk }}</span>
            <div class="queue-copy">
              <b>{{ item.post.text }}</b>
              <p>{{ item.post.author }} · {{ item.labels.join(' / ') || '抽审' }} · {{ item.post.createdAt }}</p>
            </div>
            <span class="queue-arrow">→</span>
          </div>
        </div>
      </article>

      <article class="card">
        <div class="card-head">
          <div>
            <h2>热门 Top 4</h2>
            <p>最近 7 天，按热度分排序</p>
          </div>
          <button class="btn btn-outline btn-sm" @click="emit('go', 'ranking')">看配置 →</button>
        </div>
        <div class="card-body">
          <div v-for="(item, index) in hotItems" :key="item.id" class="hot-row">
            <span class="hot-rank">{{ String(index + 1).padStart(2, '0') }}</span>
            <div class="hot-cover" :style="{ background: item.cover }"></div>
            <div class="hot-copy">
              <b>{{ item.title }}</b>
              <p>{{ item.author }} · ♡ {{ item.likes }} · 💬 {{ item.comments }}</p>
            </div>
            <span class="hot-score">{{ item.score.toFixed(2) }}</span>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.stack { display: flex; flex-direction: column; gap: 18px; }
.api-error { padding: 10px 14px; border-radius: 9px; background: #fbe7e5; color: #a52828; font-size: 11px; }
.dash-note { margin-top: 16px; display: flex; gap: 18px; border-top: 1px solid var(--line); padding-top: 14px; }
.dash-note div { display: flex; align-items: baseline; gap: 6px; }
.dash-note b { font-family: var(--serif); font-size: 25px; font-weight: 400; }
.dash-note span { font-size: 10px; color: var(--muted); }
.alert-row { display: flex; gap: 12px; align-items: flex-start; padding: 11px 0; border-bottom: 1px solid rgba(221,213,198,.55); }
.alert-row:last-child { border-bottom: 0; }
.alert-row b { font-size: 12px; }
.alert-row p { margin: 3px 0 0; color: var(--muted); font-size: 10px; }
.queue-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid rgba(221,213,198,.55); cursor: pointer; }
.queue-row:last-child { border-bottom: 0; }
.queue-row:hover .queue-copy b { color: var(--accent); }
.queue-copy { flex: 1; min-width: 0; }
.queue-copy b { display: block; font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.queue-copy p { margin: 4px 0 0; color: var(--muted); font-size: 10px; }
.queue-arrow { color: var(--muted); }
.hot-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid rgba(221,213,198,.55); }
.hot-row:last-child { border-bottom: 0; }
.hot-rank { font-family: var(--serif); font-size: 14px; color: var(--accent); width: 20px; }
.hot-cover { width: 39px; height: 39px; border-radius: 7px; flex: none; }
.hot-copy { flex: 1; min-width: 0; }
.hot-copy b { display: block; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hot-copy p { margin: 3px 0 0; color: var(--muted); font-size: 9px; }
.hot-score { font-family: var(--serif); font-size: 16px; color: var(--ink-2); }
</style>
