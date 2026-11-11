<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { getOfficialAccounts, reviewOfficial } from '../api';
import type { OfficialAccount } from '../types';

const items = ref<OfficialAccount[]>([]);
const error = ref('');

onMounted(async () => {
  try {
    items.value = await getOfficialAccounts();
  } catch (e) {
    error.value = (e as Error).message;
  }
});

function statusLabel(status: OfficialAccount['status']) {
  return {
    active: '已生效',
    pending_school: '待学校审核',
    pending_platform: '待平台复核',
    suspended: '已暂停'
  }[status];
}

function statusClass(status: OfficialAccount['status']) {
  return {
    active: 'badge-green',
    pending_school: 'badge-p1',
    pending_platform: 'badge-blue',
    suspended: 'badge-gray'
  }[status];
}

async function approve(item: OfficialAccount) {
  try {
    await reviewOfficial(item.id, 'active');
    item.status = 'active';
    ElMessage.success(`${item.orgName} 已通过，权限已生效`);
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
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
        <button class="btn btn-primary" @click="ElMessage.info('新建官方账号需要学校授权文件，演示环境暂不开放')">＋ 新建官方账号</button>
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
            <p class="auth-line">{{ item.authorization }}</p>
            <div class="official-actions">
              <button class="btn btn-outline btn-sm" @click="ElMessage.info('授权文件预览')">授权文件</button>
              <button v-if="item.status !== 'active'" class="btn btn-primary btn-sm" @click="approve(item)">通过并生效</button>
              <button v-else class="btn btn-ghost btn-sm" @click="ElMessage.info('已发送年度复核提醒')">年度复核</button>
            </div>
          </article>
        </div>
      </div>
    </section>

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
.official-actions { display: flex; gap: 7px; }
@media (max-width: 900px) { .official-grid { grid-template-columns: 1fr; } }
</style>
