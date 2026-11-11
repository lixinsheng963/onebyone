<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { decideCase, getQueue } from '../api';
import type { ModerationCase, Risk } from '../types';

const items = ref<ModerationCase[]>([]);
const filter = ref<'all' | Risk>('all');
const selectedId = ref('');
const note = ref('');
const loading = ref(true);
const error = ref('');
const emit = defineEmits<{ changed: [] }>();

onMounted(load);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    items.value = await getQueue();
    selectedId.value = items.value.find((item) => item.status === 'pending')?.id || items.value[0]?.id || '';
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

const risks: Array<{ key: 'all' | Risk; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'P0', label: 'P0 紧急' },
  { key: 'P1', label: 'P1 高风险' },
  { key: 'P2', label: 'P2 一般' },
  { key: 'P3', label: 'P3 抽审' }
];

const visible = computed(() => items.value.filter((item) => filter.value === 'all' || item.risk === filter.value));
const selected = computed(() => items.value.find((item) => item.id === selectedId.value) ?? visible.value[0]);
const pendingCount = computed(() => items.value.filter((item) => item.status === 'pending').length);

function countFor(key: 'all' | Risk) {
  return key === 'all' ? items.value.length : items.value.filter((item) => item.risk === key).length;
}

function select(item: ModerationCase) {
  selectedId.value = item.id;
  note.value = '';
}

async function decide(decision: 'approved' | 'rejected') {
  if (!selected.value) return;
  if (decision === 'rejected' && !note.value.trim()) {
    await ElMessageBox.alert('拒绝内容必须填写说明，作者会在通知里看到这段说明。', '请先填写拒绝说明', {
      type: 'warning',
      confirmButtonText: '去填写'
    });
    return;
  }
  try {
    await decideCase(selected.value.id, decision, note.value.trim());
    ElMessage.success(decision === 'approved' ? '已通过，内容进入信息流' : '已拒绝，已通知作者');
    emit('changed');
    await load();
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}
</script>

<template>
  <div class="mod-layout">
    <section class="card queue-panel">
      <div class="card-head">
        <div>
          <h2>审核队列</h2>
          <p>{{ pendingCount }} 条待处理 · P1 优先</p>
        </div>
        <span class="badge badge-p1">SLA 2h</span>
      </div>
      <div class="card-body">
        <div class="toolbar filters">
          <button
            v-for="risk in risks"
            :key="risk.key"
            class="pill"
            :class="{ active: filter === risk.key }"
            @click="filter = risk.key"
          >
            {{ risk.label }}<span class="pill-num">{{ countFor(risk.key) }}</span>
          </button>
        </div>

        <div class="case-list">
          <div
            v-for="item in visible"
            :key="item.id"
            class="case-row"
            :class="{ active: selected?.id === item.id }"
            @click="select(item)"
          >
            <div class="case-cover" :style="{ background: item.post.cover }"></div>
            <div class="case-info">
              <b>{{ item.post.text }}</b>
              <p>{{ item.post.author }} · {{ item.post.createdAt }}</p>
              <div class="case-meta">
                <span class="badge" :class="`badge-${item.risk.toLowerCase()}`">{{ item.risk }}</span>
                <span class="badge badge-gray">{{ item.status === 'pending' ? '待审' : item.status === 'approved' ? '已通过' : '已拒绝' }}</span>
                <span>{{ item.labels.join(' / ') || '抽审' }}</span>
              </div>
            </div>
          </div>
          <div v-if="!visible.length" class="empty">这个筛选下没有待审内容。</div>
        </div>
      </div>
    </section>

    <section v-if="error" class="card detail-panel">
      <div class="empty">API 连接失败：{{ error }}</div>
    </section>

    <section v-else-if="selected" class="card detail-panel">
      <div class="card-head">
        <div>
          <h2>审核详情</h2>
          <p>{{ selected.id }} · {{ selected.post.createdAt }}</p>
        </div>
        <span class="badge" :class="`badge-${selected.risk.toLowerCase()}`">{{ selected.risk }}</span>
      </div>
      <div class="card-body">
        <div class="detail-cover" :style="{ background: selected.post.cover }">
          <span class="cover-caption">{{ selected.post.topic || '校园日常' }}</span>
        </div>

        <div class="author-line">
          <div class="author-avatar">{{ selected.post.author.slice(0, 1) }}</div>
          <div>
            <b>{{ selected.post.author }}</b>
            <p>{{ selected.post.location || '未标注地点' }} · {{ selected.post.createdAt }}</p>
          </div>
          <span v-if="selected.post.alias" class="badge badge-gray">{{ selected.post.alias }}</span>
        </div>

        <p class="detail-body">{{ selected.post.text }}</p>

        <div class="ai-box">
          <h4>AI 初筛 · DEEPSEEK V4.1 FLASH</h4>
          <p><b>判断：</b>{{ selected.reason }}</p>
          <p><b>标签：</b>{{ selected.labels.join(' / ') || '正常内容' }}</p>
          <div class="evidence">
            <span v-for="ev in selected.evidence" :key="ev">{{ ev }}</span>
          </div>
          <p class="ai-note">AI/规则先筛；P0/P1 与含图片内容不会自动放行。</p>
        </div>

        <div class="history">
          <div><span>作者历史</span><b>2 次发布 · 0 次违规</b></div>
          <div><span>相似案例</span><b>1 条 · 已通过</b></div>
          <div><span>举报</span><b>0 条</b></div>
        </div>

        <template v-if="selected.status === 'pending'">
          <div class="field note-field">
            <label>审核备注 / 拒绝理由 <span class="required-mark">拒绝必填</span></label>
            <textarea v-model="note" class="textarea" placeholder="给作者看的理由要具体，例如：请把宿舍门牌打码后再发。"></textarea>
          </div>

          <div class="decision-bar">
            <button class="btn btn-outline" @click="decide('rejected')">拒绝并说明</button>
            <button class="btn btn-outline" @click="ElMessage.info('已转交第二位审核员复核')">升级复核</button>
            <button class="btn btn-primary" @click="decide('approved')">通过并发布</button>
          </div>
        </template>

        <div v-else class="review-result">
          <span class="badge" :class="selected.status === 'approved' ? 'badge-green' : 'badge-p0'">
            {{ selected.status === 'approved' ? '已通过' : '已拒绝' }}
          </span>
          <p>{{ selected.reason || '无补充说明' }}</p>
          <small>已归档，不需要重复审核；如需翻案请走申诉流程。</small>
        </div>
      </div>
    </section>

    <section v-else class="card detail-panel">
      <div class="empty">{{ loading ? '正在加载审核队列…' : '选一条内容开始审核。' }}</div>
    </section>
  </div>
</template>

<style scoped>
.mod-layout { display: grid; grid-template-columns: 390px minmax(0, 1fr); gap: 18px; align-items: start; }
.queue-panel { position: sticky; top: 112px; }
.filters { gap: 5px; margin-bottom: 12px; }
.case-list { max-height: calc(100vh - 265px); overflow: auto; margin: 0 -8px; padding: 0 8px; }
.detail-cover { height: 210px; border-radius: 13px; position: relative; overflow: hidden; }
.detail-cover:after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 30%, rgba(0,0,0,.26)); }
.cover-caption { position: absolute; left: 15px; bottom: 13px; z-index: 1; color: white; font-size: 10px; letter-spacing: .08em; padding: 4px 8px; border: 1px solid rgba(255,255,255,.4); border-radius: 999px; }
.author-line { display: flex; gap: 10px; align-items: center; margin-top: 15px; }
.author-avatar { width: 34px; height: 34px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-deep); display: grid; place-items: center; font-family: var(--serif); }
.author-line b { font-size: 12px; }
.author-line p { margin: 2px 0 0; color: var(--muted); font-size: 10px; }
.author-line .badge { margin-left: auto; }
.detail-body { font-size: 14px; line-height: 1.95; color: var(--ink); }
.ai-note { color: var(--muted) !important; font-size: 10px !important; margin-top: 8px !important; }
.history { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 18px 0; padding: 12px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.history div { display: flex; flex-direction: column; gap: 3px; }
.history span { font-size: 9px; color: var(--muted); }
.history b { font-size: 10px; font-weight: 600; }
.note-field { margin-top: 14px; }
.required-mark { color: #b64a3a; font-weight: 600; font-size: 9px; margin-left: 4px; }
.review-result { margin-top: 18px; padding: 15px; border-radius: 10px; background: #fbf6ed; border: 1px solid var(--line); }
.review-result p { margin: 9px 0 4px; font-size: 12px; line-height: 1.6; }
.review-result small { color: var(--muted); font-size: 10px; }
.decision-bar { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
@media (max-width: 1100px) {
  .mod-layout { grid-template-columns: 1fr; }
  .queue-panel { position: static; }
  .case-list { max-height: 300px; }
}
</style>
