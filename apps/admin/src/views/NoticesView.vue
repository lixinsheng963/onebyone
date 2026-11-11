<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { createNotice, getNotices } from '../api';
import type { Notice } from '../types';

const items = ref<Notice[]>([]);
const active = ref<Notice | null>(null);
const showForm = ref(false);
const error = ref('');

onMounted(load);

async function load() {
  try {
    items.value = await getNotices();
    active.value = items.value[0] ?? null;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
const form = ref({
  title: '',
  body: '',
  type: 'normal' as Notice['type'],
  source: '学校图书馆',
  effectiveTo: '11-08 12:00'
});

const sorted = computed(() => [...items.value].sort((a, b) => Number(b.type === 'emergency') - Number(a.type === 'emergency')));

function choose(item: Notice) {
  active.value = item;
  showForm.value = false;
}

async function publish() {
  if (!form.value.title.trim() || !form.value.body.trim()) {
    ElMessage.warning('标题和正文都要填');
    return;
  }
  try {
    await createNotice({
      title: form.value.title.trim(),
      body: form.value.body.trim(),
      type: form.value.type,
      source: form.value.source,
      effectiveTo: form.value.effectiveTo
    });
    showForm.value = false;
    form.value = { title: '', body: '', type: 'normal', source: '学校图书馆', effectiveTo: '11-08 12:00' };
    ElMessage.success('通知已发布');
    await load();
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}
</script>

<template>
  <div class="notice-layout">
    <div v-if="error" class="card empty">API 连接失败：{{ error }}</div>
    <section class="card list-panel">
      <div class="card-head">
        <div><h2>通知</h2><p>{{ items.length }} 条 · 紧急优先</p></div>
        <button class="btn btn-primary btn-sm" @click="showForm = true">＋ 新建</button>
      </div>
      <div class="card-body">
        <div v-for="item in sorted" :key="item.id" class="notice-row" :class="{ active: active?.id === item.id }" @click="choose(item)">
          <div class="notice-row-top">
            <span class="badge" :class="item.type === 'emergency' ? 'badge-p0' : 'badge-blue'">{{ item.type === 'emergency' ? '紧急' : '校方' }}</span>
            <span class="badge" :class="item.status === 'published' ? 'badge-green' : 'badge-gray'">{{ item.status === 'published' ? '已发布' : '草稿' }}</span>
          </div>
          <b>{{ item.title }}</b>
          <p>{{ item.source }} · 有效期至 {{ item.effectiveTo }}</p>
        </div>
      </div>
    </section>

    <section class="card detail-panel">
      <div v-if="showForm" class="card-body">
        <div class="section-title"><h3>新建通知</h3><button class="btn btn-ghost btn-sm" @click="showForm = false">取消</button></div>
        <div class="form-grid">
          <div class="field"><label>类型</label><select v-model="form.type" class="select"><option value="normal">校方通知</option><option value="emergency">紧急通知（首页顶部）</option></select></div>
          <div class="field"><label>来源</label><input v-model="form.source" class="input" /></div>
          <div class="field full"><label>标题</label><input v-model="form.title" class="input" placeholder="例如：东区今晚 22:00 起停水" /></div>
          <div class="field full"><label>正文</label><textarea v-model="form.body" class="textarea" placeholder="写清楚时间、范围、影响和咨询方式。"></textarea></div>
          <div class="field"><label>有效期至</label><input v-model="form.effectiveTo" class="input" /></div>
        </div>
        <div class="preview-wrap">
          <div class="hint">发布预览</div>
          <div class="notice-preview" :class="{ 'emergency-preview': form.type === 'emergency' }">
            <h4>{{ form.title || '通知标题' }}</h4>
            <p>{{ form.body || '通知正文会显示在这里。' }}</p>
            <div class="meta">{{ form.source }} · 有效期至 {{ form.effectiveTo }}</div>
          </div>
        </div>
        <div class="decision-bar"><button class="btn btn-primary" @click="publish">发布通知</button></div>
      </div>

      <div v-else-if="active" class="card-body">
        <div class="detail-head">
          <div>
            <div class="badge-row">
              <span class="badge" :class="active.type === 'emergency' ? 'badge-p0' : 'badge-blue'">{{ active.type === 'emergency' ? '紧急通知' : '校方通知' }}</span>
              <span class="badge" :class="active.status === 'published' ? 'badge-green' : 'badge-gray'">{{ active.status === 'published' ? '已发布' : '草稿' }}</span>
            </div>
            <h2>{{ active.title }}</h2>
            <p>{{ active.source }} · {{ active.createdAt }} · 有效期至 {{ active.effectiveTo }}</p>
          </div>
          <button class="btn btn-outline btn-sm" @click="showForm = true">编辑</button>
        </div>
        <div class="notice-preview" :class="{ 'emergency-preview': active.type === 'emergency' }">
          <h4>{{ active.title }}</h4>
          <p>{{ active.body }}</p>
          <div class="meta">{{ active.source }} · 有效期至 {{ active.effectiveTo }}</div>
        </div>
        <div class="notice-tips">
          <p>· 紧急通知只挂首页顶部，同一时间只保留 1 条。</p>
          <p>· 过期自动撤下；误发必须发更正说明，不能悄悄删除。</p>
          <p>· 默认平台值班发布；学校审核人直发需书面确认并默认关闭。</p>
        </div>
      </div>
      <div v-else class="empty">选一条通知查看。</div>
    </section>
  </div>
</template>

<style scoped>
.notice-layout { display: grid; grid-template-columns: 350px minmax(0, 1fr); gap: 18px; align-items: start; }
.list-panel { position: sticky; top: 112px; }
.notice-row { padding: 12px; border-radius: 10px; border: 1px solid transparent; cursor: pointer; margin-bottom: 6px; }
.notice-row:hover { background: #fbf7ee; }
.notice-row.active { background: #fbf4e9; border-color: var(--line); box-shadow: inset 3px 0 0 var(--accent); }
.notice-row-top { display: flex; gap: 5px; margin-bottom: 6px; }
.notice-row b { display: block; font-size: 12px; }
.notice-row p { margin: 4px 0 0; color: var(--muted); font-size: 9px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field.full { grid-column: 1 / -1; }
.preview-wrap { margin-top: 18px; }
.preview-wrap .hint { margin-bottom: 7px; }
.detail-head { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 18px; }
.detail-head h2 { margin: 9px 0 5px; font-family: var(--serif); font-size: 24px; font-weight: 400; }
.detail-head p { margin: 0; color: var(--muted); font-size: 10px; }
.badge-row { display: flex; gap: 5px; }
.notice-preview { margin-top: 12px; }
.notice-tips { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); color: var(--muted); font-size: 10px; line-height: 1.7; }
.notice-tips p { margin: 4px 0; }
.decision-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
@media (max-width: 1000px) { .notice-layout { grid-template-columns: 1fr; } .list-panel { position: static; } }
</style>
