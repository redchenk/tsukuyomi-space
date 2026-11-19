<script setup>
import { uiText } from '../i18n/runtime';
import TsIcon from './TsIcon.vue';
import { computed, ref, watch } from 'vue';
const props = defineProps({ request: { type: Function, required: true }, revision: Number });
const days = ref(30),
  group = ref('source'),
  report = ref(null),
  error = ref(''),
  loading = ref(false),
  retry = ref(0);
const dimensions = {
  source: '来源',
  medium: '媒介',
  campaign: '活动',
  content: '渠道内容编号',
  landing: '落地页',
  device: '设备',
  experience: '首次体验'
};
const labels = {
  room: '私人房间',
  chatroom: '公共聊天室',
  article_load_failed: '正文加载失败',
  article_read: '有效阅读',
  article_open: '打开文章',
  article_counted: '新增阅读量',
  room_reply: '私人问答（已同步）',
  room_local_reply: '私人问答（游客本机）',
  chat_post: '公共发言',
  article_publish: '发布文章',
  pixel_publish: '发布像素画',
  gallery_publish: '公开图库投稿',
  gomoku_finish: '五子棋终局',
  runner_100: '辉夜快跑达到 100 分',
  login: '登录页',
  register: '注册页',
  room_config: '需要配置',
  room_attempt: '已尝试生成',
  room_login: '需要登录',
  room_quota: '额度不足',
  room_timeout: '生成超时',
  room_failed: '生成失败',
  arrival: '仅观察到访问',
  direct: '直接或来源未知',
  mobile: '移动端',
  desktop: '桌面端'
};
const name = (key) => (labels[key] ? uiText(labels[key]) : key);
const rates = { d1: '次日', d7: '第七天', within7: '七日内任一天' };
const fmt = (n) => n?.toLocaleString('zh-CN') ?? '—';
const ratio = (n, total) =>
  total ? ((100 * n) / total).toFixed(1) + '%（' + fmt(n) + '/' + fmt(total) + '）' : '—';
const date = (t) =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'short',
    timeStyle: 'short',
    hour12: false
  }).format(t);
watch(
  [days, group, () => props.revision, retry],
  async (_, old, cleanup) => {
    const controller = new AbortController();
    cleanup(() => controller.abort());
    loading.value = true;
    error.value = '';
    try {
      const data = await props.request('/growth-report?days=' + days.value + '&group=' + group.value, {
        signal: controller.signal
      });
      if (!controller.signal.aborted) report.value = data;
    } catch (e) {
      if (!controller.signal.aborted) error.value = e.message || '读取失败';
    } finally {
      if (!controller.signal.aborted) loading.value = false;
    }
  },
  { immediate: true }
);
const section = ref('overview');
const sections = [
  { id: 'overview', title: '概览' },
  { id: 'acquisition', title: '获客' },
  { id: 'articles', title: '文章' },
  { id: 'community', title: '社区回应' }
];
const periods = [
  { key: 'day', label: '今日活跃', icon: 'users' },
  { key: 'week', label: '7 日活跃', icon: 'calendar' },
  { key: 'month', label: '30 日活跃', icon: 'layers' }
];
const percent = (n, total) => (total ? ((100 * n) / total).toFixed(1) + '%' : '—');
const seconds = (n) => (n == null ? '—' : uiText('{0} 秒', [fmt(n)]));
const observed = computed(
  () => report.value?.trend.filter((d) => d.visitors !== null && d.active !== null) || []
);
const peak = computed(() => Math.max(1, ...observed.value.map((d) => Math.max(d.visitors, d.active))));
</script>
<template>
  <section class="growth-report" :aria-busy="loading" aria-labelledby="growth-report-heading">
    <header class="gr-header">
      <div>
        <h2 id="growth-report-heading">增长报表</h2>
        <p v-if="report" class="gr-meta">
          <TsIcon name="calendar" :size="14" />{{ uiText('更新于 {0}（北京时间）', [date(report.asOf)]) }}
        </p>
      </div>
      <div class="gr-ranges" role="group" aria-label="观察窗口">
        <button v-for="n in [7, 14, 30]" :key="n" type="button" :aria-pressed="n === days" @click="days = n">
          {{ uiText('{0} 天', [n]) }}
        </button>
      </div>
    </header>
    <p v-if="loading && !report" class="gr-state" role="status">正在读取增长数据…</p>
    <p v-else-if="error" class="gr-state" role="alert">
      {{ error }} <button type="button" @click="retry++">重新读取</button>
    </p>
    <template v-else-if="report">
      <div class="gr-metrics">
        <article
          v-for="item in periods"
          :key="item.key"
          class="gr-metric"
          :class="{ primary: item.key === 'day' }"
        >
          <div class="gr-metric-heading"><TsIcon :name="item.icon" :size="17" />{{ uiText(item.label) }}</div>
          <div class="gr-number">{{ fmt(report.active[item.key]) }}</div>
          <div class="gr-metric-foot">
            {{ uiText('去重访客') }} <b>{{ fmt(report.visitors[item.key]) }}</b>
          </div>
        </article>
      </div>
      <nav class="gr-nav" aria-label="增长报表">
        <button
          v-for="entry in sections"
          :key="entry.id"
          type="button"
          :aria-pressed="section === entry.id"
          @click="section = entry.id"
        >
          {{ uiText(entry.title) }}
        </button>
      </nav>

      <div v-if="section === 'overview'" class="gr-stack">
        <section class="gr-panel">
          <div class="gr-section-head">
            <h3>访问与活跃趋势</h3>
            <div v-if="observed.length > 1" class="gr-legend"><i></i>访问人数 <i></i>活跃人数</div>
          </div>
          <div v-if="observed.length > 1" class="gr-chart" aria-hidden="true">
            <div class="gr-scale">
              <b>{{ fmt(peak) }}</b
              ><b>0</b>
            </div>
            <div class="gr-plot">
              <div
                v-for="d in observed"
                :key="d.day"
                class="gr-bar-pair"
                :title="uiText('{0} · 访客 {1} · 活跃 {2}', [d.day, d.visitors, d.active])"
              >
                <i :style="{ height: (100 * d.visitors) / peak + '%' }"></i
                ><i :style="{ height: (100 * d.active) / peak + '%' }"></i>
              </div>
            </div>
            <div class="gr-axis">
              <b>{{ observed[0].day.slice(5) }}</b
              ><b>{{ observed.at(-1).day.slice(5) }}</b>
            </div>
          </div>
          <div v-else-if="observed.length" class="gr-single">
            <time>{{ observed[0].day }}</time>
            <div
              v-for="(label, key) in { visitors: '访问人数', active: '活跃人数' }"
              :key="key"
              class="gr-track-row"
            >
              <span>{{ uiText(label) }}</span>
              <div class="gr-track">
                <i :class="key" :style="{ width: (100 * observed[0][key]) / peak + '%' }"></i>
              </div>
              <b>{{ fmt(observed[0][key]) }}</b>
            </div>
          </div>
          <p v-else class="gr-empty">暂无记录</p>
          <details class="gr-detail">
            <summary>每日明细</summary>
            <div class="gr-scroll">
              <table>
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>访问人数</th>
                    <th>活跃人数</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="d in report.trend" :key="d.day">
                    <td>{{ d.day }}</td>
                    <td>{{ fmt(d.visitors) }}</td>
                    <td>{{ fmt(d.active) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </section>
        <div class="gr-split">
          <section class="gr-panel">
            <h3>首次会话激活</h3>
            <strong class="gr-value">{{ percent(report.activated, report.newcomers) }}</strong>
            <p class="gr-note">
              {{ uiText('已激活 {0} 人 / 首访 {1} 人', [fmt(report.activated), fmt(report.newcomers)]) }}
            </p>
            <dl class="gr-list">
              <div>
                <dt>首次成功耗时 · 中位数</dt>
                <dd>{{ seconds(report.p50) }}</dd>
              </div>
              <div>
                <dt>首次成功耗时 · P75</dt>
                <dd>{{ seconds(report.p75) }}</dd>
              </div>
            </dl>
          </section>
          <section class="gr-panel">
            <h3>首次激活后回访</h3>
            <dl class="gr-list">
              <div v-for="(label, k) in rates" :key="k">
                <dt>{{ uiText(label) }}</dt>
                <dd v-if="report.retained[k].total">
                  {{ ratio(report.retained[k].n, report.retained[k].total) }}
                </dd>
                <dd v-else class="gr-note">等待完整样本</dd>
              </div>
            </dl>
          </section>
        </div>
        <section class="gr-panel">
          <h3>有效使用人数</h3>
          <p class="gr-note">每类在所选窗口内去重，一个人可以出现在多类。全站活跃按身份去重。</p>
          <dl v-if="Object.keys(report.types).length" class="gr-list">
            <div v-for="(n, k) in report.types" :key="k">
              <dt>{{ name(k) }}</dt>
              <dd>{{ fmt(n) }}</dd>
            </div>
          </dl>
          <p v-else class="gr-empty">尚无核心行为</p>
        </section>
      </div>
      <div v-else-if="section === 'acquisition'" class="gr-stack">
        <section class="gr-panel">
          <div class="gr-section-head">
            <h3>首访渠道</h3>
            <label class="gr-control"
              >首访分组
              <select v-model="group">
                <option v-for="(label, key) in dimensions" :key="key" :value="key">
                  {{ uiText(label) }}
                </option>
              </select></label
            >
          </div>
          <div v-if="report.groups.length" class="gr-scroll">
            <table class="gr-mobile-rows gr-acquire">
              <thead>
                <tr>
                  <th>{{ uiText(dimensions[report.group]) }}</th>
                  <th>新访客</th>
                  <th>首次会话激活率</th>
                  <th>激活后七日内回访</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in report.groups" :key="row.label">
                  <td>
                    <details>
                      <summary>{{ name(row.label) }}</summary>
                      <dl class="gr-list">
                        <div v-for="(n, k) in { ...row.experience, ...row.exits }" :key="k">
                          <dt>{{ name(k) }}</dt>
                          <dd>{{ fmt(n) }}</dd>
                        </div>
                      </dl>
                    </details>
                  </td>
                  <td :data-label="uiText('新访客')">{{ fmt(row.total) }}</td>
                  <td :data-label="uiText('首次会话激活率')">{{ ratio(row.activated, row.total) }}</td>
                  <td :data-label="uiText('激活后七日内回访')">{{ ratio(row.returned, row.mature) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="gr-empty">暂无首访记录</p>
        </section>
        <section class="gr-panel">
          <h3>首访尚未激活 · 最后观察到的步骤</h3>
          <dl v-if="Object.keys(report.exits).length" class="gr-list">
            <div v-for="(n, k) in report.exits" :key="k">
              <dt>{{ name(k) }}</dt>
              <dd>{{ fmt(n) }}</dd>
            </div>
          </dl>
          <p v-else class="gr-empty">暂无记录</p>
        </section>
      </div>
      <section v-else-if="section === 'articles'" class="gr-panel">
        <div class="gr-section-head">
          <h3>文章阅读</h3>
          <small>按新增阅读量取前 50</small>
        </div>
        <div v-if="report.articles.length" class="gr-scroll">
          <table class="gr-rank gr-mobile-rows">
            <thead>
              <tr>
                <th>文章</th>
                <th>浏览次数</th>
                <th>新增阅读量</th>
                <th>有效读者</th>
                <th>累计阅读量</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(a, i) in report.articles" :key="a.id">
                <td>
                  <div class="gr-title">
                    <b>{{ i + 1 }}</b
                    ><a :href="'/articles/' + a.id">{{ a.title }}</a>
                  </div>
                </td>
                <td :data-label="uiText('浏览次数')">{{ fmt(a.opens) }}</td>
                <td class="gr-highlight" :data-label="uiText('新增阅读量')">{{ fmt(a.reads) }}</td>
                <td :data-label="uiText('有效读者')">{{ fmt(a.readers) }}</td>
                <td :data-label="uiText('累计阅读量')">{{ fmt(a.total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="gr-empty">暂无新口径阅读记录</p>
        <p class="gr-note">
          正文可见时记录浏览。连续可见 10 秒计为有效阅读，同读者同文章 30
          分钟无有效阅读后可再计。累计包含旧口径。作者本人、管理员和已识别机器人排除。
        </p>
      </section>
      <section v-else class="gr-panel">
        <h3>24 小时内获得回应</h3>
        <div v-if="report.replies.length" class="gr-scroll">
          <table class="gr-mobile-rows">
            <thead>
              <tr>
                <th>内容</th>
                <th>真人回应率</th>
                <th>普通成员回应</th>
                <th>管理员回应</th>
                <th>AI 回应</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in report.replies" :key="s.type">
                <td>{{ s.type === 'chat' ? '首次公共发言' : '发布文章' }}</td>
                <td :data-label="uiText('真人回应率')">{{ ratio(s.human, s.total) }}</td>
                <td :data-label="uiText('普通成员回应')">{{ fmt(s.member) }}</td>
                <td :data-label="uiText('管理员回应')">{{ fmt(s.staff) }}</td>
                <td :data-label="uiText('AI 回应')">{{ fmt(s.ai) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="gr-empty">暂无已满 24 小时的样本</p>
        <p class="gr-note">
          分母为已满 24 小时的首次频道发言或发布文章。管理员按账号角色分类，同一条内容可能收到多类回应。
        </p>
      </section>
      <details class="gr-footnote">
        <summary>统计口径</summary>
        <p>{{ uiText('自 {0}（北京时间）起采集。当前窗口仅展示已经采集的数据。', [date(report.began)]) }}</p>
        <p>
          匿名身份按浏览器估算，登录后按账号。会话连续 30
          分钟无观测活动后结束。阅读、问答、公开发言、作品发布或游戏有效使用计入活跃。来源只保存渠道标签和来源域名。
        </p>
      </details>
    </template>
  </section>
</template>
<style scoped>
.growth-report {
  --gr-ink: var(--text-primary, #202b44);
  --gr-muted: var(--text-secondary, #566378);
  --gr-line: var(--terminal-border, #d7deea);
  --gr-surface: var(--terminal-panel-bg, #fff);
  --gr-brand: #8b385c;
  --gr-teal: #267a80;
  --gr-tint: color-mix(in srgb, var(--gr-teal) 8%, var(--gr-surface));
  min-width: 0;
  color: var(--gr-ink);
  font-variant-numeric: tabular-nums;
  line-height: 1.5;
}
:global(html[data-theme='dark']) .growth-report {
  --gr-brand: #eda7c1;
  --gr-teal: #7acac9;
}
.gr-header,
.gr-section-head,
.gr-meta,
.gr-ranges,
.gr-nav,
.gr-legend,
.gr-metric-heading,
.gr-title {
  display: flex;
  align-items: center;
}
.gr-header,
.gr-section-head {
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.growth-report h2,
.growth-report h3,
.growth-report p,
.growth-report dl,
.growth-report dd {
  margin: 0;
}
.growth-report h2 {
  font-size: clamp(22px, 2.8vw, 32px);
  font-weight: 750;
  letter-spacing: -0.035em;
}
.growth-report h3 {
  font-size: 17px;
  line-height: 1.4;
  font-weight: 700;
}
.gr-meta,
.gr-note,
.gr-section-head small,
.gr-legend,
.gr-control,
.gr-footnote,
.gr-detail {
  font-size: 13px;
  color: var(--gr-muted);
}
.gr-meta {
  gap: 5px;
  margin-top: 4px !important;
}
.gr-ranges {
  padding: 3px;
  gap: 2px;
  background: var(--gr-tint);
  border: 1px solid var(--gr-line);
  border-radius: 12px;
}
.growth-report button {
  font: inherit;
  cursor: pointer;
}
.gr-ranges button,
.gr-nav button {
  border: 0;
  background: transparent;
  color: var(--gr-muted);
  font-size: 14px;
  font-weight: 600;
  min-height: 36px;
  padding: 4px 15px;
}
.gr-ranges button {
  border-radius: 9px;
}
.gr-ranges button[aria-pressed='true'] {
  background: var(--gr-surface);
  color: var(--gr-ink);
  box-shadow: 0 1px 5px #162c4426;
}
.gr-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 22px 0 13px;
}
.gr-metric,
.gr-panel {
  border: 1px solid var(--gr-line);
  border-radius: 16px;
  background: var(--gr-surface);
}
.gr-metric {
  padding: 16px clamp(10px, 2vw, 23px);
  background: var(--gr-tint);
}
.gr-metric-heading {
  gap: 7px;
  font-size: 14px;
  font-weight: 650;
}
.gr-number {
  line-height: 1.2;
  font-size: clamp(26px, 3.2vw, 42px);
  font-weight: 720;
  letter-spacing: -0.045em;
  margin: 8px 0 4px;
  overflow-wrap: anywhere;
}
.gr-metric-foot {
  font-size: 12px;
  color: var(--gr-muted);
}
.gr-metric-foot b {
  margin-inline-start: 4px;
  color: var(--gr-ink);
}
.gr-metric.primary {
  background: linear-gradient(118deg, #553049, #803f60);
  border-color: transparent;
  color: white;
}
.gr-metric.primary .gr-metric-foot,
.gr-metric.primary .gr-metric-foot b {
  color: #f8e5ed;
}
.gr-nav {
  gap: 6px;
  border-bottom: 1px solid var(--gr-line);
  margin-bottom: 16px;
}
.gr-nav button {
  min-height: 44px;
  border-radius: 0;
  border-bottom: 3px solid transparent;
  padding-inline: 14px;
}
.gr-nav button[aria-pressed='true'] {
  color: var(--gr-brand);
  border-color: var(--gr-brand);
}
.growth-report :is(button, summary, a, select):focus-visible {
  outline: 2px solid var(--gr-teal);
  outline-offset: 2px;
}
.gr-stack,
.gr-split {
  display: grid;
  gap: 12px;
}
.gr-split {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.gr-panel {
  padding: clamp(14px, 2.1vw, 23px);
  min-width: 0;
}
.gr-panel > .gr-note {
  margin-top: 8px;
}
.gr-legend {
  gap: 5px;
  white-space: nowrap;
}
.gr-legend i,
.gr-bar-pair i,
.gr-track i {
  background: var(--gr-teal);
}
.gr-legend i {
  width: 9px;
  height: 9px;
  border-radius: 3px;
}
.gr-legend i:nth-child(2) {
  margin-inline-start: 7px;
}
.gr-legend i:nth-child(2),
.gr-bar-pair i:nth-child(2),
.gr-track i.active {
  background: var(--gr-brand);
}
.gr-chart {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 3px 7px;
  margin-top: 20px;
  font-size: 11px;
  color: var(--gr-muted);
}
.gr-scale,
.gr-axis {
  display: flex;
  justify-content: space-between;
}
.gr-scale {
  flex-direction: column;
}
.gr-axis {
  grid-column: 2;
}
.gr-plot {
  display: flex;
  height: 120px;
  align-items: stretch;
  gap: 2px;
  border-bottom: 1px solid var(--gr-line);
  background: repeating-linear-gradient(
    to top,
    transparent 0 calc(33.333% - 1px),
    var(--gr-line) calc(33.333% - 1px) 33.333%
  );
}
.gr-bar-pair {
  display: flex;
  flex: 1;
  align-items: end;
  justify-content: center;
  gap: 1px;
}
.gr-bar-pair i {
  display: block;
  width: 36%;
  max-width: 16px;
  border-radius: 3px 3px 0 0;
}
.gr-single {
  margin: 16px 0;
  font-size: 13px;
}
.gr-single time {
  color: var(--gr-muted);
  font-size: 12px;
}
.gr-track-row {
  display: grid;
  grid-template-columns: auto 1fr minmax(3ch, auto);
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}
.gr-track-row b {
  text-align: end;
}
.gr-track,
.gr-track i {
  height: 7px;
  border-radius: 4px;
  display: block;
}
.gr-track {
  background: var(--gr-tint);
}
.gr-detail {
  margin-top: 16px;
  padding-top: 10px;
  border-top: 1px solid var(--gr-line);
}
.growth-report summary {
  cursor: pointer;
  padding-block: 4px;
}
.gr-value {
  display: block;
  margin: 10px 0 0;
  font-size: 30px;
  color: var(--gr-brand);
  line-height: 1.25;
}
.gr-list {
  font-size: 14px;
}
.gr-list > div {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--gr-line);
}
.gr-list > div:last-child {
  border-bottom: 0;
}
.gr-list dt {
  color: var(--gr-muted);
}
.gr-list dd {
  text-align: end;
  font-weight: 600;
}
.gr-scroll {
  overflow: auto;
  max-height: 26rem;
}
.gr-scroll table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.gr-scroll td,
.gr-scroll th {
  border-bottom: 1px solid var(--gr-line);
  padding: 10px 8px;
  text-align: end;
  white-space: nowrap;
}
.gr-scroll th {
  font-size: 12px;
  color: var(--gr-muted);
  font-weight: 600;
  background: var(--gr-surface);
  position: sticky;
  top: 0;
}
.gr-scroll :is(th, td):first-child {
  text-align: start;
  white-space: normal;
  overflow-wrap: anywhere;
  min-width: 7em;
}
.gr-title {
  gap: 8px;
}
.gr-title b {
  color: var(--gr-muted);
  font-size: 12px;
  min-width: 2ch;
}
.gr-title a {
  color: var(--gr-ink);
  text-decoration: underline;
  text-decoration-color: var(--gr-line);
  text-underline-offset: 3px;
}
.gr-highlight {
  color: var(--gr-brand);
  font-weight: 700;
}
.gr-control select {
  font: inherit;
  color: var(--gr-ink);
  background: var(--gr-surface);
  border: 1px solid var(--gr-line);
  border-radius: 8px;
  padding: 6px;
}
.gr-empty,
.gr-state {
  padding: 18px 0;
  color: var(--gr-muted);
  font-size: 14px;
}
.gr-footnote {
  margin-top: 16px;
}
.gr-footnote p {
  margin-top: 8px;
}
@media (max-width: 650px) {
  .gr-header {
    align-items: start;
  }
  .gr-metrics {
    gap: 5px;
    margin-top: 14px;
  }
  .gr-metric {
    padding: 10px 7px;
    border-radius: 10px;
  }
  .gr-metric-heading {
    font-size: 12px;
    display: block;
  }
  .gr-metric-heading svg {
    display: none;
  }
  .gr-metric-foot {
    font-size: 11px;
  }
  .gr-ranges button {
    padding-inline: 9px;
    min-height: 36px;
  }
  .gr-nav {
    gap: 0;
    justify-content: space-between;
  }
  .gr-nav button {
    padding-inline: 6px;
    font-size: 13px;
  }
  .gr-split {
    grid-template-columns: 1fr;
  }
  .gr-panel {
    border-radius: 12px;
  }
  .gr-section-head {
    gap: 6px;
  }
  .gr-legend {
    font-size: 11px;
  }
}
@media (max-width: 650px) {
  .gr-mobile-rows,
  .gr-mobile-rows tbody {
    display: block;
    width: 100%;
  }
  .gr-mobile-rows thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .gr-mobile-rows tbody tr {
    display: grid;
    grid-template-columns: repeat(var(--columns, 4), minmax(0, 1fr));
    gap: 4px 7px;
    padding: 12px 0;
    border-bottom: 1px solid var(--gr-line);
  }
  .gr-mobile-rows.gr-acquire {
    --columns: 3;
  }
  .gr-scroll .gr-mobile-rows td {
    text-align: start;
    border: 0;
    min-width: 0;
    white-space: normal;
    padding: 0;
    overflow-wrap: anywhere;
  }
  .gr-mobile-rows td:first-child {
    grid-column: 1 / -1;
    margin-bottom: 4px;
    font-weight: 650;
  }
  .gr-mobile-rows td[data-label]::before {
    content: attr(data-label);
    display: block;
    font-size: 11px;
    font-weight: 400;
    color: var(--gr-muted);
  }
}
</style>
