<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { createInviteCode, getInviteCodes, revokeInviteCode } from '../api';
import { useLivePoll } from '../composables/useLivePoll';
import type { InviteCode } from '../types';

const codes = ref<InviteCode[]>([]);
const loading = ref(false);
const error = ref('');
const form = reactive({ name: '', code: '', maxUses: 1, expiresAt: '' });

function label(value: string) {
  return ({ active: '可用', used: '已用完', revoked: '已吊销', expired: '已过期' } as Record<string, string>)[value] || value;
}

function statusClass(value: string) {
  return value === 'active' ? 'badge-green' : value === 'revoked' ? 'badge-p0' : 'badge-gray';
}

function time(value: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function load(showSkeleton = false) {
  if (showSkeleton) loading.value = true;
  try {
    codes.value = await getInviteCodes();
    error.value = '';
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

useLivePoll(() => load(false), 4000);

async function create() {
  if (!form.name.trim()) {
    ElMessage.warning('请填写邀请码名称');
    return;
  }
  try {
    const expiresAt = form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined;
    const created = await createInviteCode({
      name: form.name.trim(),
      code: form.code.trim() || undefined,
      maxUses: Number(form.maxUses),
      expiresAt
    });
    await ElMessageBox.alert(
      `名称：${created.name}\n邀请码：${created.code}\n有效期至：${time(created.expiresAt)}`,
      '邀请码已创建',
      { confirmButtonText: '我已记录', type: 'success' }
    );
    form.name = '';
    form.code = '';
    form.maxUses = 1;
    form.expiresAt = '';
    await load();
  } catch (e) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error((e as Error).message);
  }
}

async function revoke(item: InviteCode) {
  try {
    await ElMessageBox.confirm(`确认吊销邀请码 #${item.id}？吊销后不可恢复。`, '吊销邀请码', { type: 'warning' });
    await revokeInviteCode(item.id);
    ElMessage.success('邀请码已吊销');
    await load();
  } catch (e) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error((e as Error).message);
  }
}

</script>

<template>
  <div class="grid-2 invite-grid">
    <section class="card">
      <div class="card-head">
        <div><h2>创建邀请码</h2><p>单次码默认 7 天有效；明文只在创建时展示一次</p></div>
        <span class="badge badge-blue">单校准入</span>
      </div>
      <div class="card-body">
        <div class="field">
          <label>邀请码名称</label>
          <input v-model="form.name" class="input" maxlength="64" placeholder="例如：2026 春季开放日" />
        </div>
        <div class="field">
          <label>自定义邀请码（留空自动生成）</label>
          <input v-model="form.code" class="input" maxlength="32" placeholder="例如 CAMPUS-2026" />
        </div>
        <div class="field-grid">
          <div class="field">
            <label>可用次数（1-100）</label>
            <input v-model.number="form.maxUses" class="input" type="number" min="1" max="100" />
          </div>
          <div class="field">
            <label>有效期（留空 7 天）</label>
            <el-date-picker v-model="form.expiresAt" type="datetime" class="date-picker" placeholder="选择日期和时间" value-format="YYYY-MM-DD HH:mm:ss" />
          </div>
        </div>
        <div class="save-row">
          <span class="hint">邀请码仅用于单校准入，请妥善保管；吊销后立即失效。</span>
          <button class="btn btn-primary" @click="create">生成邀请码</button>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <div><h2>邀请码列表</h2><p>共 {{ codes.length }} 个，按编号升序</p></div>
        <button class="btn btn-outline btn-sm" :disabled="loading" @click="load(true)">{{ loading ? '刷新中…' : '刷新' }}</button>
      </div>
      <div class="card-body">
        <div v-if="error" class="empty">加载失败：{{ error }}</div>
        <table v-else class="table invite-table">
          <thead><tr><th>编号</th><th>名称</th><th>邀请码</th><th>来源</th><th>用量</th><th>有效期</th><th>状态</th><th class="action-head">操作</th></tr></thead>
          <tbody>
            <tr v-for="item in codes" :key="item.id">
              <td>#{{ item.id }}</td>
              <td class="name-cell">{{ item.name }}</td>
              <td><code v-if="item.code">{{ item.code }}</code><span v-else class="muted">—</span></td>
              <td class="muted">{{ item.source === 'seed' ? '环境种子' : '后台创建' }}</td>
              <td>{{ item.usedCount }} / {{ item.maxUses }}</td>
              <td class="muted">{{ time(item.expiresAt) }}</td>
              <td><span class="badge" :class="statusClass(item.status)">{{ label(item.status) }}</span></td>
              <td class="action-cell">
                <button v-if="item.status === 'active'" class="btn btn-outline btn-sm" @click="revoke(item)">吊销</button>
                <span v-else class="muted">—</span>
              </td>
            </tr>
            <tr v-if="!codes.length"><td colspan="8" class="muted">还没有邀请码</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.invite-grid { grid-template-columns: .85fr 1.15fr; align-items: start; }
.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; }
.date-picker { width: 100%; }
.invite-table th, .invite-table td { vertical-align: middle; }
.invite-table .action-head, .invite-table .action-cell { text-align: right; white-space: nowrap; }
.invite-table code { font-size: 11px; letter-spacing: .03em; }
.name-cell { max-width: 150px; }
.save-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 18px; padding-top: 15px; border-top: 1px solid var(--line); }
.save-row .hint { max-width: 260px; line-height: 1.6; }
@media (max-width: 1000px) { .invite-grid { grid-template-columns: 1fr; } }
</style>
