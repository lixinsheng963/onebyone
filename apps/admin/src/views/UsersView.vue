<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getUsers, setUserStatus } from '../api';
import { useLivePoll } from '../composables/useLivePoll';
import type { AdminUser } from '../types';

const props = defineProps<{ adminRole?: string }>();
const canEdit = computed(() => props.adminRole === 'platform_admin');

const items = ref<AdminUser[]>([]);
const error = ref('');
const keyword = ref('');
const statusFilter = ref<'all' | AdminUser['status']>('all');
const saving = ref(false);
const dialog = ref(false);
const form = ref({
  user: null as AdminUser | null,
  status: 'active' as AdminUser['status'],
  mutedUntil: '',
  reason: ''
});

const statusLabels: Record<AdminUser['status'], string> = {
  active: '正常',
  muted: '禁言中',
  banned: '已封禁',
  deleted: '已注销'
};

const filtered = computed(() => {
  const word = keyword.value.trim().toLowerCase();
  return items.value.filter((item) => {
    if (statusFilter.value !== 'all' && item.status !== statusFilter.value) return false;
    if (!word) return true;
    return `${item.nickname} ${item.id}`.toLowerCase().includes(word);
  });
});

const counts = computed(() => ({
  total: items.value.length,
  muted: items.value.filter((item) => item.status === 'muted').length,
  banned: items.value.filter((item) => item.status === 'banned').length
}));

async function load() {
  try {
    items.value = await getUsers();
    error.value = '';
  } catch (e) {
    error.value = (e as Error).message;
  }
}

useLivePoll(load, 3000);

function open(item: AdminUser) {
  form.value = {
    user: item,
    status: item.status === 'active' ? 'muted' : item.status,
    mutedUntil: item.mutedUntil ? item.mutedUntil.slice(0, 16).replace('T', ' ') : '',
    reason: item.statusReason || ''
  };
  dialog.value = true;
}

async function submit() {
  const user = form.value.user;
  if (!user) return;
  if (form.value.status === 'muted' && !form.value.mutedUntil) {
    ElMessage.warning('禁言必须选择截止时间');
    return;
  }
  if (form.value.status === 'muted') {
    const until = new Date(form.value.mutedUntil.replace(' ', 'T'));
    if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
      ElMessage.warning('禁言截止时间必须晚于当前时间');
      return;
    }
  }
  const label = statusLabels[form.value.status];
  if (form.value.status === 'banned' || form.value.status === 'deleted') {
    try {
      await ElMessageBox.confirm(
        form.value.status === 'deleted'
          ? `确认注销 ${user.nickname}？账号会被匿名化，旧会话立即失效。`
          : `确认封禁 ${user.nickname}？旧会话会立即失效。`,
        `${label}确认`,
        { type: 'warning', confirmButtonText: `确认${label}`, cancelButtonText: '取消' }
      );
    } catch {
      return;
    }
  }
  saving.value = true;
  try {
    await setUserStatus(user.id, form.value.status, {
      mutedUntil: form.value.status === 'muted' ? new Date(form.value.mutedUntil.replace(' ', 'T')).toISOString() : undefined,
      reason: form.value.reason.trim() || undefined
    });
    ElMessage.success(`账号已设为${label}`);
    dialog.value = false;
    await load();
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    saving.value = false;
  }
}

function statusClass(status: AdminUser['status']) {
  if (status === 'active') return 'badge-green';
  if (status === 'muted') return 'badge-amber';
  if (status === 'banned') return 'badge-red';
  return 'badge-gray';
}

function dateText(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}
</script>

<template>
  <div class="stack">
    <div v-if="error" class="empty card">API 连接失败：{{ error }}</div>

    <section class="card">
      <div class="card-head">
        <div>
          <h2>用户治理</h2>
          <p>查看账号状态，处理禁言、封禁与注销；平台管理员操作，内容审核员只读。</p>
        </div>
        <span class="badge badge-blue">{{ counts.total }} 位用户</span>
      </div>
      <div class="card-body">
        <div class="toolbar">
          <input v-model="keyword" class="input" placeholder="搜索昵称或用户 ID" />
          <select v-model="statusFilter" class="input">
            <option value="all">全部状态</option>
            <option value="active">正常</option>
            <option value="muted">禁言中</option>
            <option value="banned">已封禁</option>
            <option value="deleted">已注销</option>
          </select>
          <span class="muted">禁言 {{ counts.muted }} · 封禁 {{ counts.banned }}</span>
        </div>
        <table class="table">
          <thead>
            <tr><th>用户</th><th>身份</th><th>状态</th><th>内容</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="item in filtered" :key="item.id">
              <td>
                <div class="user-cell">
                  <img v-if="item.avatar" class="avatar" :src="item.avatar" alt="" />
                  <div>
                    <b>{{ item.nickname }}</b>
                    <div class="muted">{{ item.id }}</div>
                  </div>
                </div>
              </td>
              <td>
                <div>{{ item.officialOrg || item.role }}</div>
                <div class="muted">{{ item.level }}<span v-if="item.isOfficial"> · 官方</span></div>
              </td>
              <td>
                <span class="badge" :class="statusClass(item.status)">{{ statusLabels[item.status] }}</span>
                <div v-if="item.status === 'muted' && item.mutedUntil" class="muted">至 {{ dateText(item.mutedUntil) }}</div>
                <div v-if="item.statusReason" class="muted">{{ item.statusReason }}</div>
              </td>
              <td class="muted">{{ item.postCount }} 发布 · {{ item.commentCount }} 评论</td>
              <td>
                <button v-if="item.status !== 'deleted' && canEdit" class="btn btn-outline btn-sm" @click="open(item)">调整状态</button>
                <span v-else class="muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!filtered.length" class="empty">没有匹配的用户</div>
      </div>
    </section>

    <el-dialog v-model="dialog" title="调整账号状态" width="520px">
      <div v-if="form.user" class="form-stack">
        <p class="muted">当前用户：{{ form.user.nickname }}（{{ form.user.id }}）</p>
        <label class="field">
          <span>目标状态</span>
          <select v-model="form.status" class="input">
            <option value="active">恢复正常</option>
            <option value="muted">禁言</option>
            <option value="banned">封禁</option>
            <option value="deleted">注销账号</option>
          </select>
        </label>
        <label v-if="form.status === 'muted'" class="field">
          <span>禁言截止时间</span>
          <el-date-picker
            v-model="form.mutedUntil"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            placeholder="选择截止时间"
            style="width: 100%"
          />
        </label>
        <label class="field">
          <span>处理说明</span>
          <textarea v-model="form.reason" class="input" rows="3" maxlength="255" placeholder="例如：多次发布违规内容" />
        </label>
      </div>
      <template #footer>
        <button class="btn btn-outline" @click="dialog = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="submit">{{ saving ? '保存中…' : '保存' }}</button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.toolbar .input {
  max-width: 240px;
}
.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  object-fit: cover;
}
.form-stack {
  display: grid;
  gap: 14px;
}
.field {
  display: grid;
  gap: 6px;
  font-size: 13px;
}
</style>
