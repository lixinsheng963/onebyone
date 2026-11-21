<script setup lang="ts">
import { computed, ref } from 'vue';
import { getAppeals } from '../api';
import { useLivePoll } from '../composables/useLivePoll';
import type { Appeal } from '../types';

const items = ref<Appeal[]>([]);
const error = ref('');
const filter = ref<'all' | 'approved' | 'rejected'>('all');
const detail = ref<Appeal | null>(null);
const dialog = ref(false);

const handled = computed(() => items.value.filter((item) => item.status !== 'pending'));
const filtered = computed(() => handled.value.filter((item) => filter.value === 'all' || item.status === filter.value));
const approvedCount = computed(() => handled.value.filter((item) => item.status === 'approved').length);
const rejectedCount = computed(() => handled.value.filter((item) => item.status === 'rejected').length);

const statusLabel: Record<Appeal['status'], string> = {
  pending: '待复核',
  approved: '已通过',
  rejected: '已驳回'
};

const targetLabel: Record<Appeal['targetType'], string> = {
  post: '帖子',
  comment: '评论',
  user: '账号'
};

async function load() {
  try {
    items.value = await getAppeals();
    error.value = '';
  } catch (e) {
    error.value = (e as Error).message;
  }
}

useLivePoll(load, 5000);

function open(item: Appeal) {
  detail.value = item;
  dialog.value = true;
}

function dateText(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}
</script>

<template>
  <div class="stack">
    <div v-if="error" class="empty card">API 连接失败：{{ error }}</div>

    <section class="card">
      <div class="card-head">
        <div>
          <h2>已审核申诉</h2>
          <p>这里只展示已经处理完的申诉记录，可追溯到处理人、处理时间和处理说明。</p>
        </div>
        <div class="appeal-stats">
          <span class="badge badge-green">通过 {{ approvedCount }}</span>
          <span class="badge badge-gray">驳回 {{ rejectedCount }}</span>
        </div>
      </div>
      <div class="card-body">
        <div class="toolbar">
          <select v-model="filter" class="input">
            <option value="all">全部已处理</option>
            <option value="approved">已通过</option>
            <option value="rejected">已驳回</option>
          </select>
          <span class="muted">共 {{ filtered.length }} 条</span>
        </div>
        <table class="table">
          <thead>
            <tr><th>用户 / 类型</th><th>申诉理由</th><th>目标内容</th><th>处理结果</th><th>处理人 / 时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="item in filtered" :key="item.id">
              <td>
                <b>{{ item.user?.nickname || item.userId }}</b>
                <div class="muted">{{ targetLabel[item.targetType] }} {{ item.targetId }}</div>
              </td>
              <td class="appeal-reason">{{ item.reason }}</td>
              <td>
                <div class="target-text">{{ item.targetText || '—' }}</div>
                <div class="muted">当前状态：{{ item.targetStatus || '—' }}</div>
              </td>
              <td>
                <span class="badge" :class="item.status === 'approved' ? 'badge-green' : 'badge-gray'">
                  {{ statusLabel[item.status] }}
                </span>
                <div v-if="item.decisionReason" class="muted">{{ item.decisionReason }}</div>
              </td>
              <td class="muted">
                <div>{{ item.handledBy || '—' }}</div>
                <div>{{ dateText(item.handledAt) }}</div>
              </td>
              <td><button class="btn btn-outline btn-sm" @click="open(item)">查看</button></td>
            </tr>
          </tbody>
        </table>
        <div v-if="!filtered.length" class="empty">还没有已审核的申诉记录</div>
      </div>
    </section>

    <el-dialog v-model="dialog" title="已审核申诉详情" width="620px">
      <div v-if="detail" class="appeal-detail">
        <p><b>用户：</b>{{ detail.user?.nickname || detail.userId }}</p>
        <p><b>对象：</b>{{ targetLabel[detail.targetType] }} {{ detail.targetId }}</p>
        <p><b>申诉理由：</b>{{ detail.reason }}</p>
        <div class="target-box">{{ detail.targetText || '（目标内容已不存在）' }}</div>
        <p><b>处理结果：</b>{{ statusLabel[detail.status] }}</p>
        <p v-if="detail.decisionReason"><b>处理说明：</b>{{ detail.decisionReason }}</p>
        <p><b>处理人：</b>{{ detail.handledBy || '—' }} · {{ dateText(detail.handledAt) }}</p>
      </div>
      <template #footer>
        <button class="btn btn-outline" @click="dialog = false">关闭</button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.appeal-stats { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 14px; }
.toolbar .input { max-width: 180px; }
.appeal-reason { max-width: 260px; white-space: pre-wrap; }
.target-text { max-width: 300px; white-space: pre-wrap; color: #3e4641; }
.appeal-detail p { margin: 0 0 10px; line-height: 1.6; }
.target-box { padding: 14px; margin: 12px 0; border-radius: 10px; background: #f7f4ed; white-space: pre-wrap; line-height: 1.7; }
</style>
