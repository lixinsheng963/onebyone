<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  bindOfficialOperator,
  createOfficialAccount,
  downloadOfficialAuthorization,
  getAdminMe,
  getOfficialAccounts,
  getUsers,
  reviewOfficial,
  updateOfficialAccount,
  uploadOfficialAuthorization
} from '../api';
import { useLivePoll } from '../composables/useLivePoll';
import { suggestOrgId } from '../org';
import type { AdminRole, AdminUser, OfficialAccount } from '../types';

const items = ref<OfficialAccount[]>([]);
const role = ref<AdminRole>('platform_admin');
const error = ref('');
const dialogVisible = ref(false);
const editingId = ref('');
const saving = ref(false);
const selectedFile = ref<File | null>(null);
const fileInput = ref<HTMLInputElement>();
const uploadTarget = ref<OfficialAccount | null>(null);
const operatorDialog = ref(false);
const operatorTarget = ref<OfficialAccount | null>(null);
const operatorUserId = ref('');
const operatorUsers = ref<AdminUser[]>([]);
const operatorSaving = ref(false);
const form = reactive({ orgName: '', orgId: '', scope: ['notice'] as string[], expiresAt: '' });
const orgIdTouched = ref(false);
const previewVisible = ref(false);
const previewUrl = ref('');
const previewName = ref('');
const previewMime = ref('');

const todayStart = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

function disabledDate(date: Date) {
  return date.getTime() < todayStart().getTime();
}

function statusLabel(status: OfficialAccount['status']) {
  return {
    active: '已生效',
    pending_school: '待学校初审',
    pending_platform: '待平台复核',
    suspended: '已暂停',
    expired: '授权已过期'
  }[status];
}

function statusClass(status: OfficialAccount['status']) {
  return {
    active: 'badge-green',
    pending_school: 'badge-p0',
    pending_platform: 'badge-blue',
    suspended: 'badge-gray',
    expired: 'badge-p0'
  }[status];
}

function onOrgNameInput() {
  if (!orgIdTouched.value) form.orgId = suggestOrgId(form.orgName);
}

function onOrgIdInput() {
  orgIdTouched.value = true;
}

function closePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
}

onBeforeUnmount(closePreview);

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

function openCreate() {
  editingId.value = '';
  form.orgName = '';
  form.orgId = '';
  form.scope = ['notice'];
  form.expiresAt = '';
  selectedFile.value = null;
  orgIdTouched.value = false;
  dialogVisible.value = true;
}

function openEdit(item: OfficialAccount) {
  editingId.value = item.id;
  form.orgName = item.orgName;
  form.orgId = item.orgId || '';
  form.scope = [...item.scope];
  form.expiresAt = item.expiresAt ? item.expiresAt.slice(0, 10) : '';
  selectedFile.value = null;
  orgIdTouched.value = true;
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
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(form.orgId.trim())) {
    return ElMessage.warning('组织标识格式应为小写字母/数字并用下划线连接');
  }
  if (new Date(`${form.expiresAt}T23:59:59`).getTime() < todayStart().getTime()) {
    return ElMessage.warning('授权有效期不能早于今天');
  }
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
    if (selectedFile.value) {
      try {
        await uploadOfficialAuthorization(accountId, selectedFile.value);
      } catch (uploadError) {
        dialogVisible.value = false;
        await load();
        ElMessage.warning(`官方账号已保存，但授权文件上传失败：${(uploadError as Error).message}。请稍后在列表中重新上传。`);
        return;
      }
    }
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

async function fetchAuthorization(item: OfficialAccount) {
  const blob = await downloadOfficialAuthorization(item.id);
  return {
    url: URL.createObjectURL(blob),
    mime: blob.type || item.authorizationMime || '',
    name: item.authorizationFileName || `${item.orgName}-授权文件`
  };
}

async function previewFile(item: OfficialAccount) {
  try {
    closePreview();
    const file = await fetchAuthorization(item);
    previewUrl.value = file.url;
    previewName.value = file.name;
    previewMime.value = file.mime;
    previewVisible.value = true;
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
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}

function closePreviewDialog() {
  previewVisible.value = false;
  closePreview();
}

async function openOperator(item: OfficialAccount) {
  operatorTarget.value = item;
  operatorUserId.value = item.operatorUserId || '__none__';
  operatorDialog.value = true;
  try {
    operatorUsers.value = (await getUsers()).filter((user) => user.status === 'active');
  } catch {
    operatorUsers.value = [];
  }
}

async function saveOperator() {
  if (!operatorTarget.value) return;
  if (!operatorUserId.value) return ElMessage.warning('请选择运营者或“暂时无人运营”');
  operatorSaving.value = true;
  try {
    await bindOfficialOperator(operatorTarget.value.id, operatorUserId.value === '__none__' ? '' : operatorUserId.value);
    ElMessage.success('运营者已绑定；账号生效后将以该用户身份发布官方内容');
    operatorDialog.value = false;
    await load();
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    operatorSaving.value = false;
  }
}

function operatorText(item: OfficialAccount) {
  if (item.operatorNickname && item.operatorUserId) {
    return `运营者：${item.operatorNickname}`;
  }
  return '运营者：未绑定（当前为系统占位账号）';
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
                <p class="operator-line">
                  <img v-if="item.operatorAvatar" class="operator-avatar" :src="item.operatorAvatar" alt="" />
                  <span v-else class="operator-avatar fallback">{{ (item.operatorNickname || '运').slice(0, 1) }}</span>
                  <span>{{ operatorText(item) }}</span>
                </p>
                <p v-if="item.orgId" class="org-id">组织标识：{{ item.orgId }}</p>
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
              <template v-if="item.authorizationFileName">
                <button class="btn btn-outline btn-sm" @click="previewFile(item)">预览授权</button>
                <button class="btn btn-outline btn-sm" @click="downloadFile(item)">下载授权</button>
                <button v-if="role === 'platform_admin'" class="btn btn-ghost btn-sm" @click="triggerUpload(item)">更新授权</button>
              </template>
              <button v-else class="btn btn-outline btn-sm" @click="triggerUpload(item)">上传授权文件</button>
              <button v-if="role === 'platform_admin'" class="btn btn-ghost btn-sm" @click="openEdit(item)">编辑</button>
              <button v-if="role === 'platform_admin'" class="btn btn-outline btn-sm" @click="openOperator(item)">绑定运营者</button>
              <button v-if="canSchoolSubmit(item)" class="btn btn-primary btn-sm" @click="submitSchoolReview(item)">提交平台复核</button>
              <button v-else-if="canPlatformApprove(item)" class="btn btn-primary btn-sm" @click="approve(item)">通过并生效</button>
            </div>
          </article>
        </div>
      </div>
    </section>

    <input ref="fileInput" type="file" accept="application/pdf,image/jpeg,image/png" style="display:none" @change="onQuickUpload" />

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑官方账号' : '新建官方账号'" width="480px">
      <div class="official-form">
        <div class="form-grid">
          <label>组织名称
            <input v-model="form.orgName" class="input" maxlength="80" placeholder="例如：学校图书馆" @input="onOrgNameInput" />
          </label>
          <label>组织标识
            <input v-model="form.orgId" class="input" maxlength="64" placeholder="自动生成，可修改，如 org_library" @input="onOrgIdInput" />
            <small>格式：小写字母/数字，用下划线连接；同一标识只能属于一个组织。</small>
          </label>
        </div>
        <div class="form-grid">
          <label>授权有效期
            <el-date-picker
              v-model="form.expiresAt"
              type="date"
              value-format="YYYY-MM-DD"
              format="YYYY年MM月DD日"
              placeholder="选择到期日"
              :disabled-date="disabledDate"
              style="width:100%"
            />
            <small>只能选择今天及之后的日期；过去日期不可选。</small>
          </label>
          <label>授权范围
            <el-checkbox-group v-model="form.scope" class="scope-checks">
              <el-checkbox label="notice">校方通知</el-checkbox>
              <el-checkbox label="emergency">紧急通知</el-checkbox>
              <el-checkbox label="emblem">校徽</el-checkbox>
            </el-checkbox-group>
          </label>
        </div>
        <label class="file-field">授权文件（PDF/JPG/PNG，≤8MB）
          <input type="file" accept="application/pdf,image/jpeg,image/png" @change="onFileChange" />
          <span v-if="selectedFile" class="muted">已选择：{{ selectedFile.name }}</span>
        </label>
      </div>
      <template #footer>
        <button class="btn btn-ghost" @click="dialogVisible = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
      </template>
    </el-dialog>

    <el-dialog v-model="operatorDialog" title="绑定官方账号运营者" width="480px">
      <div class="form-stack">
        <p class="muted">官方账号必须绑定一名真实微信用户。绑定后，该用户在小程序发布的内容才会带官方身份；换绑会降级旧运营者。</p>
        <label>运营者
          <el-select v-model="operatorUserId" filterable placeholder="搜索昵称或用户 ID" style="width:100%">
            <el-option label="暂时无人运营（仅保留占位账号）" value="__none__" />
            <el-option
              v-for="user in operatorUsers"
              :key="user.id"
              :label="`${user.nickname}（${user.id}）`"
              :value="user.id"
            >
              <div class="operator-option">
                <img v-if="user.avatar" class="operator-avatar" :src="user.avatar" alt="" />
                <span v-else class="operator-avatar fallback">{{ user.nickname.slice(0, 1) }}</span>
                <span>{{ user.nickname }}</span>
                <small>{{ user.id }}</small>
              </div>
            </el-option>
          </el-select>
        </label>
        <p v-if="operatorTarget" class="muted">当前：{{ operatorText(operatorTarget) }}</p>
      </div>
      <template #footer>
        <button class="btn btn-ghost" @click="operatorDialog = false">取消</button>
        <button class="btn btn-primary" :disabled="operatorSaving" @click="saveOperator">{{ operatorSaving ? '绑定中…' : '确认绑定' }}</button>
      </template>
    </el-dialog>

    <el-dialog v-model="previewVisible" :title="`授权文件预览 · ${previewName}`" width="720px" @closed="closePreview">
      <div class="preview-box">
        <img v-if="previewMime.startsWith('image/')" :src="previewUrl" alt="授权文件预览" />
        <iframe v-else-if="previewMime === 'application/pdf'" :src="previewUrl" title="授权文件预览" />
        <p v-else class="muted">该文件暂不支持在线预览，请使用卡片上的“下载授权”。</p>
      </div>
      <template #footer>
        <button class="btn btn-ghost" @click="closePreviewDialog">关闭</button>
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
            <tr><td>匿名身份</td><td class="muted">不可见</td><td class="muted">不可见</td><td class="muted">不可见</td><td class="muted">单人终审+审计</td></tr>
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
.official-top { display: flex; align-items: flex-start; gap: 10px; position: relative; }
.official-mark { width: 36px; height: 36px; border-radius: 9px; background: var(--green); color: #f4ead7; display: grid; place-items: center; font-family: var(--serif); font-size: 18px; flex: none; }
.official-name { flex: 1; min-width: 0; }
.official-top > .badge { margin-left: auto; flex: none; margin-top: 2px; }
.official-top > .badge-p0 { color: #b42318; background: #fef3f2; border-color: #fecdca; }
.official-name b { display: block; font-size: 13px; }
.official-name p { margin: 2px 0 0; color: var(--muted); font-size: 10px; }
.operator-line { display: flex; align-items: center; gap: 5px; }
.operator-avatar { width: 18px; height: 18px; border-radius: 50%; object-fit: cover; flex: 0 0 18px; }
.operator-avatar.fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
  text-align: center;
  vertical-align: middle;
  background: var(--accent-soft);
  color: var(--accent-deep);
  font-size: 9px;
  font-weight: 600;
}
.operator-option { display: flex; align-items: center; gap: 8px; }
.operator-option small { margin-left: auto; color: var(--muted); font-size: 10px; }
.official-name .org-id { opacity: .75; }
.scope-row { display: flex; gap: 5px; flex-wrap: wrap; margin: 13px 0 8px; }
.auth-line { margin: 0 0 12px; color: var(--muted); font-size: 10px; line-height: 1.6; }
.official-actions { display: flex; gap: 7px; flex-wrap: wrap; }
.form-stack, .official-form { display: flex; flex-direction: column; gap: 14px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.official-form label { display: flex; flex-direction: column; gap: 6px; color: var(--muted); font-size: 11px; }
.official-form small { color: var(--muted); font-size: 10px; line-height: 1.5; }
.official-form .input { width: 100%; }
.scope-checks { min-height: 32px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.file-field { border-top: 1px dashed var(--line); padding-top: 12px; }
.preview-box { min-height: 360px; max-height: 65vh; display: grid; place-items: center; background: #f7f4ed; border-radius: 8px; overflow: auto; }
.preview-box img { max-width: 100%; max-height: 62vh; object-fit: contain; }
.preview-box iframe { width: 100%; height: 62vh; border: 0; background: #fff; }
@media (max-width: 900px) { .official-grid { grid-template-columns: 1fr; } .form-grid { grid-template-columns: 1fr; } }
.scope-checks {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: nowrap;
  min-height: 32px;
}
.scope-checks :deep(.el-checkbox) {
  margin-right: 0;
  height: 32px;
  line-height: 32px;
}

</style>
