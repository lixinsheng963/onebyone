<script setup lang="ts">
import { computed, ref } from 'vue';
import { getAuditLogs } from '../api';
import { useLivePoll } from '../composables/useLivePoll';
import type { AuditLog } from '../types';

const logs = ref<AuditLog[]>([]);
const error = ref('');
const loading = ref(false);
const filter = ref('all');

const labels: Record<string, string> = {
  'admin.login': '管理员登录',
  'admin.logout': '管理员登出',
  'moderation.decision': '审核决策',
  'official.review': '官方账号审核',
  'notice.create': '发布通知',
  'report.decision': '举报处理',
  'ranking.update': '热度配置',
  'invite_code.create': '创建邀请码',
  'invite_code.revoke': '吊销邀请码'
};

const actions = computed(() => Array.from(new Set(logs.value.map((item) => item.action))));
const visible = computed(() => filter.value === 'all' ? logs.value : logs.value.filter((item) => item.action === filter.value));

function actionLabel(value: string) {
  return labels[value] || value;
}

function time(value: string) {
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function target(item: AuditLog) {
  if (!item.targetType) return '—';
  return `${item.targetType}${item.targetId ? ` #${item.targetId}` : ''}`;
}

function json(value: unknown) {
  if (value === undefined || value === null) return '—';
  return JSON.stringify(value, null, 2);
}

async function load(showSkeleton = false) {
  if (showSkeleton) loading.value = true;
  try {
    logs.value = await getAuditLogs(200);
    error.value = '';
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

useLivePoll(() => load(false), 3000);
</script>

<template>
  <section class="card">
    <div class="card-head">
      <div><h2>审计日志</h2><p>谁、何时、做了什么；前后值只读留痕，不提供修改入口</p></div>
      <div class="audit-tools">
        <select v-model="filter" class="input compact">
          <option value="all">全部操作</option>
          <option v-for="action in actions" :key="action" :value="action">{{ actionLabel(action) }}</option>
        </select>
        <button class="btn btn-outline btn-sm" :disabled="loading" @click="load(true)">{{ loading ? '刷新中…' : '刷新' }}</button>
      </div>
    </div>
    <div class="card-body">
      <div v-if="error" class="empty">加载失败：{{ error }}</div>
      <table v-else class="table">
        <thead><tr><th>时间</th><th>操作</th><th>对象</th><th>操作人</th><th>请求</th><th></th></tr></thead>
        <tbody>
          <template v-for="item in visible" :key="item.id">
            <tr>
              <td class="muted">{{ time(item.createdAt) }}</td>
              <td><b>{{ actionLabel(item.action) }}</b><div class="muted">{{ item.action }}</div></td>
              <td class="muted">{{ target(item) }}</td>
              <td>{{ item.actorRole }}<div class="muted">#{{ item.actorId }}</div></td>
              <td class="muted">{{ item.requestId || '—' }}</td>
              <td>
                <details class="audit-detail">
                  <summary>前后值</summary>
                  <div class="audit-json"><div><span>before</span><pre>{{ json(item.before) }}</pre></div><div><span>after</span><pre>{{ json(item.after) }}</pre></div></div>
                </details>
              </td>
            </tr>
          </template>
          <tr v-if="!visible.length"><td colspan="6" class="muted">暂无审计记录</td></tr>
        </tbody>
      </table>
      <p class="audit-note">审计日志仅由 API 写入；当前后台展示最近 200 条。</p>
    </div>
  </section>
</template>

<style scoped>
.audit-tools { display: flex; gap: 8px; align-items: center; }
.compact { width: 150px; padding: 7px 9px; font-size: 10px; }
.audit-detail summary { cursor: pointer; color: var(--accent); font-size: 10px; white-space: nowrap; }
.audit-json { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; min-width: 520px; }
.audit-json span { color: var(--muted); font-size: 9px; letter-spacing: .08em; }
.audit-json pre { margin: 4px 0 0; max-height: 220px; overflow: auto; padding: 8px; border-radius: 7px; background: #fbf6ed; font-size: 9px; line-height: 1.5; white-space: pre-wrap; }
.audit-note { margin: 14px 0 0; color: var(--muted); font-size: 9px; }
@media (max-width: 900px) { .audit-json { grid-template-columns: 1fr; min-width: 0; } }
</style>
