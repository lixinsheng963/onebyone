<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { decideAppeal, getAppeals } from '../api';
import { useLivePoll } from '../composables/useLivePoll';
import type { Appeal } from '../types';

const items = ref<Appeal[]>([]);
const error = ref('');
const filter = ref<'all' | Appeal['status']>('pending');
const detail = ref<Appeal | null>(null);
const dialog = ref(false);

const filtered = computed(() => items.value.filter((item) => filter.value === 'all' || item.status === filter.value));
const pendingCount = computed(() => items.value.filter((item) => item.status === 'pending').length);

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

useLivePoll(load, 3000);

function open(item: Appeal) {
  detail.value = item;
  dialog.value = true;
}

async function decide(item: Appeal, status: 'approved' | 'rejected') {
  let reason = '';
  try {
    const result = await ElMessageBox.prompt(
      status === 'approved' ? '通过后会恢复对应内容/账号，并通知用户。' : '驳回后维持原处理结果，并通知用户。',
      status === 'approved' ? '通过申诉' : '驳回申诉',
      {
        inputPlaceholder: '处理说明（可选，会展示给用户）',
        confirmButtonText: status === 'approved' ? '确认通过' : '确认驳回',
        cancelButtonText: '取消',
        inputValidator: (value) => (value || '').length <= 255 || '最多 255 字'
      }
    );
    reason = result.value || '';
  } catch {
    return;
  }
  try {
    await decideAppeal(item.id, status, reason.trim() || undefined);
    ElMessage.success(status === 'approved' ? '申诉已通过' : '申诉已驳回');
    dialog.value = false;
    await load();
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
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
          <h2>申诉复核</h2>
          <p>用户对隐藏内容或账号处理提出申诉；由未参与原处理的审核员复核。</p>
        </div>
        <span class="badge badge-amber">{{ pendingCount }} 条待复核</span>
      </div>
      <div class="card-body">
        <div class="toolbar">
          <select v-model="filter" class="input">
            <option value="pending">待复核</option>
            <option value="approved">已通过</option>
            <option value="rejected">已驳回</option>
            <option value="all">全部</option>
          </select>
          <span class="muted">共 {{ filtered.length }} 条</span>
        </div>
        <table class="table">
          <thead>
            <tr><th>用户 / 类型</th><th>申诉理由</th><th>目标内容</th><th>状态</th><th>提交时间</th><th>操作</th></tr>
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
                <span class="badge" :class="item.status === 'pending' ? 'badge-amber' : item.status === 'approved' ? 'badge-green' : 'badge-gray'">
                  {{ statusLabel[item.status] }}
                </span>
                <div v-if="item.decisionReason" class="muted">{{ item.decisionReason }}</div>
              </td>
              <td class="muted">{{ dateText(item.createdAt) }}</td>
              <td>
                <button class="btn btn-outline btn-sm" @click="open(item)">查看</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!filtered.length" class="empty">没有申诉记录</div>
      </div>
    </section>

    <el-dialog v-model="dialog" title="申诉详情" width="620px">
      <div v-if="detail" class="appeal-detail">
        <p><b>用户：</b>{{ detail.user?.nickname || detail.userId }}</p>
        <p><b>对象：</b>{{ targetLabel[detail.targetType] }} {{ detail.targetId }}</p>
        <p><b>原状态：</b>{{ detail.targetStatus || '—' }}</p>
        <p><b>申诉理由：</b>{{ detail.reason }}</p>
        <div class="target-box">{{ detail.targetText || '（目标内容已不存在）' }}</div>
        <p v-if="detail.decisionReason"><b>处理说明：</b>{{ detail.decisionReason }}</p>
        <p v-if="detail.handledBy"><b>处理人：</b>{{ detail.handledBy }} · {{ dateText(detail.handledAt) }}</p>
      </div>
      <template #footer>
        <button class="btn btn-outline" @click="dialog = false">关闭</button>
        <button v-if="detail?.status === 'pending'" class="btn btn-outline" @click="decide(detail, 'rejected')">驳回</button>
        <button v-if="detail?.status === 'pending'" class="btn btn-primary" @click="decide(detail, 'approved')">通过并恢复</button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
}
.toolbar .input {
  max-width: 180px;
}
.appeal-reason {
  max-width: 260px;
  white-space: pre-wrap;
}
.target-text {
  max-width: 300px;
  white-space: pre-wrap;
  color: #3e4641;
}
.appeal-detail p {
  margin: 0 0 10px;
  line-height: 1.6;
}
.target-box {
  padding: 14px;
  margin: 12px 0;
  border-radius: 10px;
  background: #f7f4ed;
  white-space: pre-wrap;
  line-height: 1.7;
}
</style>
