<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { createOperator, getOperators, revokeOperator } from '../api';
import { useLivePoll } from '../composables/useLivePoll';
import type { AdminOperator, AdminRole } from '../types';

const items = ref<AdminOperator[]>([]);
const error = ref('');
const saving = ref(false);
const form = ref({
  email: '',
  password: '',
  displayName: '',
  role: 'school_reviewer' as 'school_reviewer' | 'content_reviewer',
  schoolId: 'campus',
  orgId: ''
});

const roleLabels: Record<AdminRole, string> = {
  platform_admin: '平台管理员',
  content_reviewer: '内容审核员',
  school_reviewer: '学校审核人'
};

const schoolCount = computed(() => items.value.filter((item) => item.role === 'school_reviewer' && item.status === 'active').length);

async function load() {
  try {
    items.value = await getOperators();
    error.value = '';
  } catch (e) {
    error.value = (e as Error).message;
  }
}

useLivePoll(load, 4000);

async function submit() {
  const email = form.value.email.trim();
  if (!email || !form.value.password) {
    ElMessage.warning('请填写邮箱和初始密码');
    return;
  }
  if (form.value.password.length < 10) {
    ElMessage.warning('初始密码至少 10 位');
    return;
  }
  if (form.value.role === 'school_reviewer' && (!form.value.schoolId.trim() || !form.value.orgId.trim())) {
    ElMessage.warning('学校审核人必须填写学校和机构');
    return;
  }
  saving.value = true;
  try {
    await createOperator({
      email,
      password: form.value.password,
      displayName: form.value.displayName.trim() || undefined,
      role: form.value.role,
      schoolId: form.value.role === 'school_reviewer' ? form.value.schoolId.trim() : undefined,
      orgId: form.value.role === 'school_reviewer' ? form.value.orgId.trim() : undefined
    });
    ElMessage.success('操作员已创建');
    form.value.password = '';
    await load();
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    saving.value = false;
  }
}

async function revoke(item: AdminOperator) {
  try {
    await ElMessageBox.confirm(`确定吊销 ${item.displayName}（${item.email}）的权限？旧会话会立即失效。`, '吊销操作员', {
      type: 'warning',
      confirmButtonText: '确认吊销',
      cancelButtonText: '取消'
    });
    await revokeOperator(item.id);
    ElMessage.success('已吊销');
    await load();
  } catch (e) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error((e as Error).message);
  }
}

function scopeText(item: AdminOperator) {
  if (item.role !== 'school_reviewer') return '全局内容审核';
  return [item.schoolId, item.orgId].filter(Boolean).join(' / ') || '未设置';
}
</script>

<template>
  <div class="stack">
    <div v-if="error" class="empty card">API 连接失败：{{ error }}</div>

    <section class="card">
      <div class="card-head">
        <div>
          <h2>团队与权限</h2>
          <p>平台管理员可创建学校审核人和内容审核员；学校审核人只处理本校官方账号。</p>
        </div>
        <span class="badge badge-blue">{{ schoolCount }} 位学校审核人</span>
      </div>
      <div class="card-body">
        <table class="table team-table">
          <thead>
            <tr><th>成员</th><th>角色</th><th>范围</th><th>状态</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id">
              <td>
                <b>{{ item.displayName }}</b>
                <div class="muted">{{ item.email }}</div>
              </td>
              <td><span class="badge" :class="item.role === 'platform_admin' ? 'badge-green' : 'badge-blue'">{{ roleLabels[item.role] }}</span></td>
              <td class="muted">{{ scopeText(item) }}</td>
              <td><span class="badge" :class="item.status === 'active' ? 'badge-green' : 'badge-gray'">{{ item.status === 'active' ? '在职' : '已停用' }}</span></td>
              <td class="team-action">
                <button v-if="item.role !== 'platform_admin' && item.status === 'active'" class="btn btn-outline btn-sm" @click="revoke(item)">吊销</button>
                <span v-else class="muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <div>
          <h2>新建操作员</h2>
          <p>初始密码至少 10 位；学校审核人首次登录后请尽快更换。</p>
        </div>
      </div>
      <div class="card-body">
        <div class="team-form">
          <div class="field">
            <label>邮箱</label>
            <input v-model="form.email" class="input" autocomplete="off" placeholder="reviewer@campus.local" />
          </div>
          <div class="field">
            <label>显示名称</label>
            <input v-model="form.displayName" class="input" placeholder="例如：图书馆审核人" />
          </div>
          <div class="field">
            <label>角色</label>
            <select v-model="form.role" class="input">
              <option value="school_reviewer">学校审核人</option>
              <option value="content_reviewer">内容审核员</option>
            </select>
          </div>
          <div class="field">
            <label>初始密码</label>
            <input v-model="form.password" class="input" type="password" autocomplete="new-password" placeholder="至少 10 位" />
          </div>
          <template v-if="form.role === 'school_reviewer'">
            <div class="field">
              <label>学校</label>
              <input v-model="form.schoolId" class="input" placeholder="例如：campus" />
            </div>
            <div class="field">
              <label>机构</label>
              <input v-model="form.orgId" class="input" placeholder="例如：library" />
            </div>
          </template>
        </div>
        <div class="team-submit">
          <button class="btn btn-primary" :disabled="saving" @click="submit">{{ saving ? '创建中…' : '创建操作员' }}</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.stack { display: flex; flex-direction: column; gap: 18px; }
.team-table td { vertical-align: middle; }
.team-action { text-align: right; }
.team-form { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.team-submit { display: flex; justify-content: flex-end; margin-top: 16px; }
@media (max-width: 900px) { .team-form { grid-template-columns: 1fr; } }
</style>
