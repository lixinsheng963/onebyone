<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getReports, resolveReport } from '../api';
import { useLivePoll } from '../composables/useLivePoll';
import type { Report } from '../types';

const items = ref<Report[]>([]);
const error = ref('');
const filter = ref<'all' | Report['status']>('all');
const detail = ref<Report | null>(null);
const detailVisible = ref(false);
const visible = computed(() => items.value.filter((item) => filter.value === 'all' || item.status === filter.value));
const pending = computed(() => items.value.filter((item) => item.status === 'pending').length);
const resolved = computed(() => items.value.filter((item) => item.status === 'resolved').length);
const rejected = computed(() => items.value.filter((item) => item.status === 'rejected').length);

async function load() {
  try {
    items.value = await getReports();
    error.value = '';
    if (detail.value) {
      const fresh = items.value.find((item) => item.id === detail.value?.id);
      if (fresh) detail.value = fresh;
    }
  } catch (e) {
    error.value = (e as Error).message;
  }
}

useLivePoll(load, 2000);

function openDetail(item: Report) {
  detail.value = item;
  detailVisible.value = true;
}

async function resolve(item: Report, status: 'resolved' | 'rejected') {
  if (status === 'resolved') {
    await ElMessageBox.confirm('处理后该内容会从信息流隐藏，并通知举报人。确认继续？', '处理举报', {
      type: 'warning',
      confirmButtonText: '隐藏并处理',
      cancelButtonText: '取消'
    });
  }
  try {
    const next = await resolveReport(item.id, status);
    const index = items.value.findIndex((entry) => entry.id === item.id);
    if (index >= 0) items.value[index] = next;
    if (detail.value?.id === item.id) detail.value = next;
    ElMessage.success(status === 'resolved' ? '举报已处理，内容已隐藏' : '举报已驳回');
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}

function statusLabel(status: Report['status']) {
  return { pending: '待处理', resolved: '已处理', rejected: '已驳回' }[status];
}

function statusClass(status: Report['status']) {
  return { pending: 'badge-p1', resolved: 'badge-green', rejected: 'badge-gray' }[status];
}

function targetText(item: Report) {
  const target = item.target;
  if (!target?.exists) return '目标已删除或不可用';
  if (target.type === 'post') return target.text || '（无文字）';
  if (target.type === 'comment') return target.text || '（无文字评论）';
  return target.nickname || '用户资料';
}

function targetName(item: Report) {
  const target = item.target;
  if (!target) return '—';
  return target.authorName || target.nickname || '未知用户';
}

function userInitial(name?: string) {
  return (name || '用').slice(0, 1);
}

function aiLabel(ai?: Report['ai']) {
  if (!ai) return '未研判';
  return { reject: 'AI 建议驳回', uphold: 'AI 建议处理', needs_human: 'AI 转人工' }[ai.decision];
}

function aiClass(ai?: Report['ai']) {
  if (!ai) return 'badge-gray';
  return { reject: 'badge-green', uphold: 'badge-p0', needs_human: 'badge-p1' }[ai.decision];
}
</script>

<template>
  <div class="stack">
    <div v-if="error" class="empty card">API 连接失败：{{ error }}</div>
    <section class="card">
      <div class="card-head">
        <div><h2>举报</h2><p>每条举报都要有结果；AI 只做初筛，人工拥有最终决定权</p></div>
        <div class="toolbar">
          <button class="pill" :class="{ active: filter === 'all' }" @click="filter = 'all'">全部 <span class="pill-num">{{ items.length }}</span></button>
          <button class="pill" :class="{ active: filter === 'pending' }" @click="filter = 'pending'">待处理 <span class="pill-num">{{ pending }}</span></button>
          <button class="pill" :class="{ active: filter === 'resolved' }" @click="filter = 'resolved'">已处理 <span class="pill-num">{{ resolved }}</span></button>
          <button class="pill" :class="{ active: filter === 'rejected' }" @click="filter = 'rejected'">已驳回 <span class="pill-num">{{ rejected }}</span></button>
        </div>
      </div>
      <div class="card-body">
        <table class="table">
          <thead><tr><th>内容</th><th>类型</th><th>被举报人</th><th>原因</th><th>AI 初筛</th><th>举报人</th><th>时间</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="item in visible" :key="item.id" class="report-row" @click="openDetail(item)">
              <td class="target">{{ targetText(item) }}</td>
              <td><span class="badge badge-gray">{{ item.targetType }}</span></td>
              <td>
                <div class="identity">
                  <img v-if="item.target.avatar" class="identity-avatar" :src="item.target.avatar" alt="" />
                  <span v-else class="identity-avatar fallback">{{ userInitial(targetName(item)) }}</span>
                  <div><b>{{ targetName(item) }}</b><div class="muted">{{ item.target.authorId || '' }}</div></div>
                </div>
              </td>
              <td>{{ item.reason }}</td>
              <td>
                <span class="badge" :class="aiClass(item.ai)">{{ aiLabel(item.ai) }}</span>
                <div v-if="item.ai" class="ai-confidence">{{ Math.round(item.ai.confidence * 100) }}%</div>
              </td>
              <td>
                <div class="identity">
                  <img v-if="item.reporterAvatar" class="identity-avatar small" :src="item.reporterAvatar" alt="" />
                  <span v-else class="identity-avatar small fallback">{{ userInitial(item.reporter) }}</span>
                  <span class="muted">{{ item.reporter }}</span>
                </div>
              </td>
              <td class="muted">{{ item.createdAt }}</td>
              <td><span class="badge" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span></td>
              <td>
                <div v-if="item.status === 'pending'" class="row-actions" @click.stop>
                  <button class="btn btn-outline btn-sm" @click="resolve(item, 'rejected')">驳回</button>
                  <button class="btn btn-primary btn-sm" @click="resolve(item, 'resolved')">处理</button>
                </div>
                <button v-else class="btn btn-outline btn-sm" @click.stop="openDetail(item)">查看详情</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!visible.length" class="empty">这个筛选下没有举报。</div>
      </div>
    </section>

    <section class="grid-3">
      <article class="card stat-card"><div class="stat-label">待处理举报</div><div class="stat-value">{{ pending }}</div><div class="stat-foot">点击任意举报查看完整内容</div></article>
      <article class="card stat-card"><div class="stat-label">已处理</div><div class="stat-value">{{ resolved }}</div><div class="stat-foot">处理后会隐藏被举报内容</div></article>
      <article class="card stat-card"><div class="stat-label">已驳回</div><div class="stat-value">{{ rejected }}</div><div class="stat-foot">AI 与人工均可驳回</div></article>
    </section>

    <el-dialog v-model="detailVisible" title="举报详情" width="760px">
      <div v-if="detail" class="report-detail">
        <div class="detail-heading">
          <span class="badge" :class="statusClass(detail.status)">{{ statusLabel(detail.status) }}</span>
          <span class="badge" :class="aiClass(detail.ai)">{{ aiLabel(detail.ai) }}</span>
          <span class="identity reporter-inline">
            <img v-if="detail.reporterAvatar" class="identity-avatar small" :src="detail.reporterAvatar" alt="" />
            <span v-else class="identity-avatar small fallback">{{ userInitial(detail.reporter) }}</span>
            <span class="muted">{{ detail.reporter }} · {{ detail.createdAt }}</span>
          </span>
        </div>

        <h3>被举报内容</h3>
        <div class="target-card">
          <div class="target-meta">
            <span class="identity" v-if="detail.target?.authorName || detail.target?.nickname">
              <img v-if="detail.target?.avatar" class="identity-avatar small" :src="detail.target.avatar" alt="" />
              <span v-else class="identity-avatar small fallback">{{ userInitial(detail.target?.authorName || detail.target?.nickname) }}</span>
              <span>{{ detail.target.authorName || detail.target.nickname }}</span>
            </span>
            <span>{{ detail.target?.type === 'post' ? '帖子' : detail.target?.type === 'comment' ? '评论' : '用户' }}</span>
            <span v-if="detail.target?.status">状态：{{ detail.target.status }}</span>
          </div>
          <p class="target-body">{{ targetText(detail) }}</p>
          <p v-if="detail.target?.postText && detail.target.type === 'comment'" class="muted">所属帖子：{{ detail.target.postText }}</p>
          <div v-if="detail.target?.media?.length" class="target-media">
            <img v-for="url in detail.target.media" :key="url" :src="url" alt="举报内容图片" />
          </div>
          <p v-if="!detail.target?.exists" class="muted">目标已删除，无法查看原始内容。</p>
        </div>

        <h3>举报原因</h3>
        <p class="reason-box"><b>{{ detail.reason }}</b><br />{{ detail.detail || '举报人未补充说明' }}</p>

        <h3>AI 初筛</h3>
        <div v-if="detail.ai" class="ai-box">
          <p><b>建议：</b>{{ aiLabel(detail.ai) }} · 置信度 {{ Math.round(detail.ai.confidence * 100) }}%</p>
          <p><b>理由：</b>{{ detail.ai.reason }}</p>
          <p><b>依据：</b>{{ detail.ai.evidence.join(' / ') || '无' }}</p>
        </div>
        <p v-else class="muted">暂无 AI 研判结果，或 AI 不可用，请人工核实。</p>

        <div v-if="detail.status === 'pending'" class="dialog-actions">
          <button class="btn btn-outline" @click="resolve(detail, 'rejected')">驳回举报</button>
          <button class="btn btn-primary" @click="resolve(detail, 'resolved')">确认违规并隐藏</button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.stack { display: flex; flex-direction: column; gap: 18px; }
.target { max-width: 280px; font-weight: 500; cursor: pointer; }
.report-row { cursor: pointer; }
.report-row:hover { background: #fbf7ef; }
.identity { display: flex; align-items: center; gap: 7px; min-width: 0; }
.identity b { font-size: 12px; }
.identity-avatar { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; flex: 0 0 26px; }
.identity-avatar.small { width: 20px; height: 20px; flex-basis: 20px; }
.identity-avatar.fallback { display: grid; place-items: center; background: var(--accent-soft); color: var(--accent-deep); font-size: 10px; }
.reporter-inline { gap: 5px; }
.row-actions { display: flex; gap: 5px; }
.ai-confidence { color: var(--muted); font-size: 10px; margin-top: 2px; }
.report-detail h3 { margin: 20px 0 8px; font-size: 13px; }
.detail-heading { display: flex; gap: 8px; align-items: center; }
.target-card, .reason-box, .ai-box { border: 1px solid var(--line); border-radius: 10px; padding: 14px; background: #fdfbf7; }
.target-meta { display: flex; gap: 14px; color: var(--muted); font-size: 10px; margin-bottom: 10px; }
.target-body { font-size: 14px; line-height: 1.8; white-space: pre-wrap; margin: 0; }
.target-media { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.target-media img { width: 112px; height: 112px; object-fit: cover; border-radius: 8px; }
.reason-box { font-size: 12px; line-height: 1.7; }
.ai-box p { margin: 6px 0; font-size: 12px; line-height: 1.7; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
</style>
