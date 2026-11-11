<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { getReports, resolveReport } from '../api';
import type { Report } from '../types';

const items = ref<Report[]>([]);
const error = ref('');
const filter = ref<'all' | Report['status']>('all');
const visible = computed(() => items.value.filter((item) => filter.value === 'all' || item.status === filter.value));

onMounted(async () => {
  try {
    items.value = await getReports();
  } catch (e) {
    error.value = (e as Error).message;
  }
});

async function resolve(item: Report, status: 'resolved' | 'rejected') {
  try {
    await resolveReport(item.id, status);
    item.status = status;
    ElMessage.success(status === 'resolved' ? '举报已处理，已通知举报人' : '举报已驳回');
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
</script>

<template>
  <div class="stack">
    <div v-if="error" class="empty card">API 连接失败：{{ error }}</div>
    <section class="card">
      <div class="card-head">
        <div><h2>举报</h2><p>每条举报都要有结果；不允许“点了没反应”</p></div>
        <div class="toolbar">
          <button class="pill" :class="{ active: filter === 'all' }" @click="filter = 'all'">全部 <span class="pill-num">{{ items.length }}</span></button>
          <button class="pill" :class="{ active: filter === 'pending' }" @click="filter = 'pending'">待处理 <span class="pill-num">{{ items.filter(i => i.status === 'pending').length }}</span></button>
          <button class="pill" :class="{ active: filter === 'resolved' }" @click="filter = 'resolved'">已处理</button>
        </div>
      </div>
      <div class="card-body">
        <table class="table">
          <thead><tr><th>内容</th><th>类型</th><th>原因</th><th>举报人</th><th>时间</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="item in visible" :key="item.id">
              <td class="target">{{ item.target }}</td>
              <td><span class="badge badge-gray">{{ item.targetType }}</span></td>
              <td>{{ item.reason }}</td>
              <td class="muted">{{ item.reporter }}</td>
              <td class="muted">{{ item.createdAt }}</td>
              <td><span class="badge" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span></td>
              <td>
                <div v-if="item.status === 'pending'" class="row-actions">
                  <button class="btn btn-outline btn-sm" @click="resolve(item, 'rejected')">驳回</button>
                  <button class="btn btn-primary btn-sm" @click="resolve(item, 'resolved')">处理</button>
                </div>
                <span v-else class="muted">已闭环</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!visible.length" class="empty">这个筛选下没有举报。</div>
      </div>
    </section>

    <section class="grid-3">
      <article class="card stat-card"><div class="stat-label">今日举报</div><div class="stat-value">3</div><div class="stat-foot">每千次曝光 &lt; 1 条</div></article>
      <article class="card stat-card"><div class="stat-label">平均处理时长</div><div class="stat-value">42m</div><div class="stat-foot">目标 ≤ 2h</div></article>
      <article class="card stat-card"><div class="stat-label">申诉翻案</div><div class="stat-value">1</div><div class="stat-foot">本周 · 已由另一审核员复核</div></article>
    </section>
  </div>
</template>

<style scoped>
.stack { display: flex; flex-direction: column; gap: 18px; }
.target { max-width: 300px; font-weight: 500; }
.row-actions { display: flex; gap: 5px; }
</style>
