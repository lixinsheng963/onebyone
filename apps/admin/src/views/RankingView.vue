<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { getDashboard, getRanking, saveRanking } from '../api';
import type { HotItem, RankingConfig } from '../types';

const defaults: RankingConfig = {
  likeWeight: 0.6,
  commentWeight: 0.3,
  favoriteWeight: 0.2,
  viewWeight: 0.3,
  coldStart: 3,
  coldDecayHours: 6,
  timeOffsetHours: 6,
  timeExponent: 1.2,
  windowDays: 7,
  snapshotSize: 100,
  maxPerAuthorTop20: 2
};
const config = reactive<RankingConfig>({ ...defaults });
const hotItems = ref<HotItem[]>([]);
const lastSaved = ref('加载中…');
const error = ref('');

onMounted(async () => {
  try {
    const [ranking, dashboard] = await Promise.all([getRanking(), getDashboard()]);
    Object.assign(config, ranking);
    hotItems.value = dashboard.hot;
    lastSaved.value = '来自 API · 平台管理员';
  } catch (e) {
    error.value = (e as Error).message;
  }
});

async function save() {
  try {
    await saveRanking({ ...config });
    lastSaved.value = '刚刚 · 平台管理员';
    ElMessage.success('热度配置已保存，下一次快照生效');
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}

function reset() {
  Object.assign(config, defaults);
  ElMessage.info('已恢复默认值，点击保存后生效');
}
</script>

<template>
  <div class="grid-2 ranking-grid">
    <div v-if="error" class="empty card">API 连接失败：{{ error }}</div>
    <section class="card">
      <div class="card-head">
        <div><h2>热度配置</h2><p>改完只影响下一次快照，不回溯历史</p></div>
        <span class="badge badge-green">生效中</span>
      </div>
      <div class="card-body">
        <div class="formula">
          <span>有效互动</span>
          <b>{{ config.likeWeight }}×赞 + {{ config.commentWeight }}×评论人数 + {{ config.favoriteWeight }}×收藏 + {{ config.viewWeight }}×ln(1+阅读)</b>
          <span>热度</span>
          <b>(有效互动 + 冷启动) / (小时 + {{ config.timeOffsetHours }})^{{ config.timeExponent }}</b>
        </div>

        <div class="field-grid">
          <div class="field"><label>点赞权重</label><input v-model.number="config.likeWeight" class="input" type="number" step="0.1" /></div>
          <div class="field"><label>评论人数权重</label><input v-model.number="config.commentWeight" class="input" type="number" step="0.1" /></div>
          <div class="field"><label>收藏权重</label><input v-model.number="config.favoriteWeight" class="input" type="number" step="0.1" /></div>
          <div class="field"><label>阅读权重</label><input v-model.number="config.viewWeight" class="input" type="number" step="0.1" /></div>
          <div class="field"><label>冷启动</label><input v-model.number="config.coldStart" class="input" type="number" step="0.5" /></div>
          <div class="field"><label>冷启动衰减（小时）</label><input v-model.number="config.coldDecayHours" class="input" type="number" step="1" /></div>
          <div class="field"><label>时间偏移（小时）</label><input v-model.number="config.timeOffsetHours" class="input" type="number" step="1" /></div>
          <div class="field"><label>时间指数</label><input v-model.number="config.timeExponent" class="input" type="number" step="0.1" /></div>
          <div class="field"><label>热门窗口（天）</label><input v-model.number="config.windowDays" class="input" type="number" step="1" /></div>
          <div class="field"><label>快照条数</label><input v-model.number="config.snapshotSize" class="input" type="number" step="10" /></div>
          <div class="field"><label>前 20 同作者上限</label><input v-model.number="config.maxPerAuthorTop20" class="input" type="number" step="1" /></div>
        </div>

        <div class="save-row">
          <span class="hint">最后修改：{{ lastSaved }}</span>
          <div>
            <button class="btn btn-outline" @click="reset">恢复默认</button>
            <button class="btn btn-primary" @click="save">保存配置</button>
          </div>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <div><h2>Top 100 预览</h2><p>同一作者前 20 条最多 {{ config.maxPerAuthorTop20 }} 条</p></div>
        <button class="btn btn-outline btn-sm" @click="ElMessage.success('已触发手动重算')">手动重算</button>
      </div>
      <div class="card-body">
        <div v-for="(item, index) in hotItems" :key="item.id" class="preview-row">
          <span class="rank">{{ String(index + 1).padStart(2, '0') }}</span>
          <div class="thumb" :style="{ background: item.cover }"></div>
          <div class="copy"><b>{{ item.title }}</b><p>{{ item.author }} · ♡ {{ item.likes }} · 💬 {{ item.comments }}</p></div>
          <span class="score">{{ item.score.toFixed(2) }}</span>
        </div>
        <div class="preview-note">
          <p>· 官方通知不参与热门。</p>
          <p>· 被举报/隐藏内容自动移出。</p>
          <p>· 不展示具体分数给用户，只展示“热门”。</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ranking-grid { grid-template-columns: 1.35fr 1fr; align-items: start; }
.formula { display: flex; flex-direction: column; gap: 4px; padding: 13px; border-radius: 10px; background: #fbf6ed; border: 1px solid var(--line); margin-bottom: 18px; }
.formula span { font-size: 9px; color: var(--muted); letter-spacing: .08em; }
.formula b { font-size: 11px; font-weight: 500; line-height: 1.6; }
.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; }
.save-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 18px; padding-top: 15px; border-top: 1px solid var(--line); }
.save-row > div { display: flex; gap: 7px; }
.preview-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(221,213,198,.55); }
.preview-row:last-of-type { border-bottom: 0; }
.rank { font-family: var(--serif); font-size: 15px; color: var(--accent); width: 20px; }
.thumb { width: 40px; height: 40px; border-radius: 7px; flex: none; }
.copy { flex: 1; min-width: 0; }
.copy b { display: block; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.copy p { margin: 3px 0 0; color: var(--muted); font-size: 9px; }
.score { font-family: var(--serif); font-size: 16px; }
.preview-note { margin-top: 15px; padding-top: 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 10px; line-height: 1.7; }
.preview-note p { margin: 3px 0; }
@media (max-width: 1000px) { .ranking-grid { grid-template-columns: 1fr; } }
</style>
