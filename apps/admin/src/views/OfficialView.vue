<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  createOfficialAccount,
  downloadOfficialAuthorization,
  getAdminMe,
  getOfficialAccounts,
  reviewOfficial,
  updateOfficialAccount,
  uploadOfficialAuthorization
} from '../api';
import { useLivePoll } from '../composables/useLivePoll';
import type { AdminRole, OfficialAccount } from '../types';

const items = ref<OfficialAccount[]>([]);
const role = ref<AdminRole>('platform_admin');
const error = ref('');
const dialogVisible = ref(false);
const editingId = ref('');
const saving = ref(false);
const selectedFile = ref<File | null>(null);
const fileInput = ref<HTMLInputElement>();
const uploadTarget = ref<OfficialAccount | null>(null);
const form = reactive({ orgName: '', orgId: '', scope: ['notice'] as string[], expiresAt: '' });

onMounted(async () => {
  try {
    role.value = (await getAdminMe()).role;
  } catch {
    // 角色加载失败时保持只读默认，不阻塞列表。
  }
});

async function load() {
  try {
    items.value = await getOfficialAccounts();
    error.value = '';
  } catch (e) {
    error.value = (e as Error).message;
  }
}

useLivePoll(load, 3000);

function statusLabel(status: OfficialAccount['status']) {
  return {
    active: '已生效',
    pending_school: '待学校审核',
    pending_platform: '待平台复核',
    suspended: '已暂停',
    expired: '授权已过期'
  }[status];
}

function statusClass(status: OfficialAccount['status']) {
  return {
    active: 'badge-green',
    pending_school: 'badge-p1',
    pending_platform: 'badge-blue',
    suspended: 'badge-gray',
    expired: 'badge-p0'
  }[status];
}

function openCreate() {
  editingId.value = '';
  form.orgName = '';
  form.orgId = '';
  form.scope = ['notice'];
  form.expiresAt = '';
  selectedFile.value = null;
  dialogVisible.value = true;
}

function openEdit(item: OfficialAccount) {
  editingId.value = item.id;
  form.orgName = item.orgName;
  form.orgId = item.orgId || '';
  form.scope = [...item.scope];
  form.expiresAt = item.expiresAt ? item.expiresAt.slice(0, 10) : '';
  selectedFile.value = null;
  dialogVisible.value = true;
}

function pickFile(file: File) {
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
    ElMessage.error('授权文件只支持 PDF/JPG/PNG');
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    ElMessage.error('授权文件不能超过 8MB');
    return;
  }
  selectedFile.value = file;
}

function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) pickFile(file);
}

async function save() {
  if (!form.orgName.trim()) return ElMessage.warning('请填写组织名称');
  if (!form.expiresAt) return ElMessage.warning('请选择授权有效期');
  if (!form.scope.length) return ElMessage.warning('至少选择一个授权范围');
  saving.value = true;
  try {
    let accountId = editingId.value;
    if (accountId) {
      await updateOfficialAccount(accountId, {
        orgName: form.orgName.trim(),
        orgId: form.orgId.trim() || undefined,
        scope: form.scope,
        expiresAt: new Date(`${form.expiresAt}T23:59:59`).toISOString()
      });
    } else {
      const created: any = await createOfficialAccount({
        orgName: form.orgName.trim(),
        orgId: form.orgId.trim() || undefined,
        scope: form.scope,
        expiresAt: new Date(`${form.expiresAt}T23:59:59`).toISOString()
      });
      accountId = created.id;
    }
    if (selectedFile.value) await uploadOfficialAuthorization(accountId, selectedFile.value);
    ElMessage.success(selectedFile.value ? '官方账号与授权文件已保存' : '官方账号已保存，请补传授权文件');
    dialogVisible.value = false;
    await load();
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    saving.value = false;
  }
}

function triggerUpload(item: OfficialAccount) {
  uploadTarget.value = item;
  fileInput.value?.click();
}

async function onQuickUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  const target = uploadTarget.value;
  (event.target as HTMLInputElement).value = '';
  if (!file || !target) return;
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) return ElMessage.error('授权文件只支持 PDF/JPG/PNG');
  if (file.size > 8 * 1024 * 1024) return ElMessage.error('授权文件不能超过 8MB');
  try {
    await uploadOfficialAuthorization(target.id, file);
    ElMessage.success('授权文件已上传');
    await load();
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}

async function downloadFile(item: OfficialAccount) {
  try {
    const blob = await downloadOfficialAuthorization(item.id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = item.authorizationFileName || `${item.orgName}-授权文件`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}

async function submitSchoolReview(item: OfficialAccount) {
  try {
    await reviewOfficial(item.id, 'pending_platform');
    ElMessage.success(`${item.orgName} 已提交平台复核`);
    await load();
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}

async function approve(item: OfficialAccount) {
  try {
    await reviewOfficial(item.id, 'active');
    item.status = 'active';
    ElMessage.success(`${item.orgName} 已通过，权限已生效`);
    await load();
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}

function canSchoolSubmit(item: OfficialAccount) {
  return role.value === 'school_reviewer' && item.status === 'pending_school';
}

function canPlatformApprove(item: OfficialAccount) {
  return role.value === 'platform_admin' && (item.status === 'pending_platform' || item.status === 'suspended');
}
</script>

<template>
  <div class="stack">
    <div v-if="error" class="empty card">API 连接失败：{{ error }}</div>
    <section class="card">
      <div class="card-head">
        <div>
          <h2>官方账号</h2>
          <p>学校审核 + 平台复核；校徽只跟官方内容绑定</p>
        </div>
        <button v-if="role === 'platform_admin'" class="btn btn-primary" @click="openCreate">＋ 新建官方账号</button>
      </div>
      <div class="card-body">
        <div class="official-grid">
          <article v-for="item in items" :key="item.id" class="official-card">
            <div class="official-top">
              <div class="official-mark">校</div>
              <div class="official-name">
                <b>{{ item.orgName }}</b>
                <p>{{ item.owner }}</p>
              </div>
              <span class="badge" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span>
            </div>
            <div class="scope-row">
              <span v-for="scope in item.scope" :key="scope" class="badge badge-blue">{{ scope }}</span>
            </div>
            <p class="auth-line">
              {{ item.authorization }}
              <span v-if="item.expiresAt"> · 有效至 {{ item.expiresAt.slice(0, 10) }}</span>
            </p>
            <div class="official-actions">
              <button v-if="item.authorizationFileName" class="btn btn-outline btn-sm" @click="downloadFile(item)">查看授权文件</button>
              <button v-else class="btn btn-outline btn-sm" @click="triggerUpload(item)">上传授权文件</button>
              <button v-if="role === 'platform_admin'" class="btn btn-ghost btn-sm" @click="openEdit(item)">编辑</button>
              <button v-if="canSchoolSubmit(item)" class="btn btn-primary btn-sm" @click="submitSchoolReview(item)">提交平台复核</button>
              <button v-else-if="canPlatformApprove(item)" class="btn btn-primary btn-sm" @click="approve(item)">通过并生效</button>
              <span v-else-if="item.status === 'pending_school'" class="muted">待学校初审</span>
              <button v-else-if="item.status === 'active' && role === 'platform_admin'" class="btn btn-ghost btn-sm" @click="triggerUpload(item)">更新授权</button>
            </div>
          </article>
        </div>
      </div>
    </section>

    <input ref="fileInput" type="file" accept="application/pdf,image/jpeg,image/png" style="display:none" @change="onQuickUpload" />

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑官方账号' : '新建官方账号'" width="480px">
      <div class="form-stack">
        <label>组织名称<input v-model="form.orgName" class="input" maxlength="80" placeholder="例如：学校图书馆" /></label>
        <label>组织标识<input v-model="form.orgId" class="input" maxlength="64" placeholder="例如：org_library；学校审核人同组织需回避" /></label>
        <label>授权有效期
          <el-date-picker v-model="form.expiresAt" type="date" value-format="YYYY-MM-DD" placeholder="选择到期日" style="width:100%" />
        </label>
        <label>授权范围
          <el-checkbox-group v-model="form.scope">
            <el-checkbox label="notice">校方通知</el-checkbox>
            <el-checkbox label="emergency">紧急通知</el-checkbox>
            <el-checkbox label="emblem">校徽</el-checkbox>
          </el-checkbox-group>
        </label>
        <label>授权文件（PDF/JPG/PNG，≤8MB）
          <input type="file" accept="application/pdf,image/jpeg,image/png" @change="onFileChange" />
        </label>
        <p v-if="selectedFile" class="muted">已选择：{{ selectedFile.name }}</p>
      </div>
      <template #footer>
        <button class="btn btn-ghost" @click="dialogVisible = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
      </template>
    </el-dialog>

    <section class="card">
      <div class="card-head">
        <div>
          <h2>权限边界</h2>
          <p>官方账号只做校方内容，不参与普通热门</p>
        </div>
      </div>
      <div class="card-body">
        <table class="table">
          <thead><tr><th>能力</th><th>普通用户</th><th>官方账号</th><th>学校审核人</th><th>平台管理员</th></tr></thead>
          <tbody>
            <tr><td>校徽</td><td class="muted">不可用</td><td><span class="badge badge-blue">可用</span></td><td class="muted">不可用</td><td class="muted">配置</td></tr>
            <tr><td>校方通知</td><td class="muted">不可用</td><td><span class="badge badge-green">发布</span></td><td><span class="badge badge-p1">审核</span></td><td><span class="badge badge-green">复核/发布</span></td></tr>
            <tr><td>紧急通知</td><td class="muted">不可用</td><td class="muted">仅提交</td><td><span class="badge badge-p1">审核（默认不直发）</span></td><td><span class="badge badge-p0">发布/撤回</span></td></tr>
            <tr><td>匿名身份</td><td class="muted">不可见</td><td class="muted">不可见</td><td class="muted">不可见</td><td class="muted">双人+审计</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.stack { display: flex; flex-direction: column; gap: 18px; }
.official-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.official-card { padding: 15px; border: 1px solid var(--line); border-radius: 12px; background: #fcfaf4; }
.official-top { display: flex; align-items: center; gap: 10px; }
.official-mark { width: 36px; height: 36px; border-radius: 9px; background: var(--green); color: #f4ead7; display: grid; place-items: center; font-family: var(--serif); font-size: 18px; }
.official-name { flex: 1; }
.official-name b { display: block; font-size: 13px; }
.official-name p { margin: 2px 0 0; color: var(--muted); font-size: 10px; }
.scope-row { display: flex; gap: 5px; flex-wrap: wrap; margin: 13px 0 8px; }
.auth-line { margin: 0 0 12px; color: var(--muted); font-size: 10px; line-height: 1.6; }
.official-actions { display: flex; gap: 7px; flex-wrap: wrap; }
.form-stack { display: flex; flex-direction: column; gap: 14px; }
.form-stack label { display: flex; flex-direction: column; gap: 6px; color: var(--muted); font-size: 11px; }
.form-stack .input { width: 100%; }
@media (max-width: 900px) { .official-grid { grid-template-columns: 1fr; } }
</style>
