<script setup>
import { uiText } from '../i18n/runtime';
import { ref, watch } from 'vue';
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
const labels = { room:'私人房间',chatroom:'公共聊天室',article_load_failed:'正文加载失败',
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
  total ? ((100 * n) / total).toFixed(1) + '%（' + fmt(n) + '/' + fmt(total) + '）' : '—（0/0）';
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
    report.value = null;
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
</script>
<template>
  <section class="terminal-card growth-report" aria-labelledby="growth-report-heading">
    <header>
      <h2 id="growth-report-heading">增长报表</h2>
      <label
        >观察窗口
        <select v-model="days">
          <option v-for="d in [7, 14, 30]" :key="d" :value="d">近 {{ d }} 天</option>
        </select></label
      >
      <label
        >首访分组
        <select v-model="group">
          <option v-for="(label, key) in dimensions" :key="key" :value="key">{{ uiText(label) }}</option>
        </select></label
      >
    </header>
    <p v-if="loading" role="status">正在读取增长数据…</p>
    <p v-else-if="error" role="alert">{{ error }} <button type="button" @click="retry++">重新读取</button></p>
    <template v-else-if="report">
      <p>
        北京时间 {{ date(report.began) }} 起采集 · 截至
        {{ date(report.asOf) }}。今天和未满周期的窗口显示已采集部分，留存仅纳入已走完整个观察窗口的人。
      </p>
      <dl class="growth-kpis">
        <div><dt>去重访客 · 今天 / 7 天 / 30 天</dt><dd>{{fmt(report.visitors.day)}} / {{fmt(report.visitors.week)}} / {{fmt(report.visitors.month)}}</dd></div>
        <div v-for="(label, k) in { day: '有效 DAU', week: '有效 WAU', month: '有效 MAU' }" :key="k">
          <dt>{{ uiText(label) }}</dt>
          <dd>{{ fmt(report.active[k]) }}</dd>
        </div>
        <div>
          <dt>首次会话激活</dt>
          <dd>{{ ratio(report.activated, report.newcomers) }}</dd>
        </div>
        <div>
          <dt>首次成功耗时 · 中位 / P75</dt>
          <dd>{{ fmt(report.p50) }} / {{ fmt(report.p75) }} 秒</dd>
        </div>
      </dl>
      <h3>首次激活后回访</h3>
      <p>
        <span v-for="(label, k) in rates" :key="k"
          >{{ uiText(label) }} {{ ratio(report.retained[k].n, report.retained[k].total) }}　</span
        >
      </p>
      <h3>首次观察到的访客 · 按{{ uiText(dimensions[group]) }}</h3>
      <div class="growth-scroll">
        <table>
          <thead>
            <tr>
              <th>{{ uiText(dimensions[group]) }}</th>
              <th>新访客</th>
              <th>首次会话激活率</th>
              <th>激活后七日内回访</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in report.groups" :key="row.label">
              <td>
                <details class="breakdown">
                  <summary>{{ name(row.label) }}</summary>
                  <ul>
                    <li v-for="(n, k) in row.experience" :key="k">{{ name(k) }} · {{ fmt(n) }}</li>
                    <li v-for="(n, k) in row.exits" :key="k">{{ name(k) }} · {{ fmt(n) }}</li>
                  </ul>
                </details>
              </td>
              <td>{{ fmt(row.total) }}</td>
              <td>{{ ratio(row.activated, row.total) }}</td>
              <td>{{ ratio(row.returned, row.mature) }}</td>
            </tr>
            <tr v-if="!report.groups.length">
              <td colspan="4">暂无首访记录</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3>首访尚未激活 · 最后观察到的步骤</h3>
      <p v-if="!Object.keys(report.exits).length">暂无记录</p>
      <ul v-else>
        <li v-for="(n, k) in report.exits" :key="k">{{ name(k) }} · {{ fmt(n) }} 人</li>
      </ul>
      <h3>有效使用人数</h3>
      <p>每类在所选窗口内去重，一个人可以出现在多类。全站活跃按身份去重。</p>
      <ul>
        <li v-for="(n, k) in report.types" :key="k">{{ name(k) }} · {{ fmt(n) }} 人</li>
        <li v-if="!Object.keys(report.types).length">尚无核心行为</li>
      </ul>
      <h3>文章阅读</h3>
      <p>
        正文可见时记录浏览。连续可见 10 秒计为有效阅读，同读者同文章 30
        分钟无有效阅读后可再计。累计包含旧口径。作者本人、管理员和已识别机器人排除。
      </p>
      <div class="growth-scroll">
        <table>
          <thead>
            <tr>
              <th>文章 · 按新增阅读量取前 50</th>
              <th>浏览次数</th>
              <th>新增阅读量</th>
              <th>有效读者</th>
              <th>累计阅读量</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in report.articles" :key="a.id">
              <td>{{ a.title }}</td>
              <td>{{ fmt(a.opens) }}</td>
              <td>{{ fmt(a.reads) }}</td>
              <td>{{ fmt(a.readers) }}</td>
              <td>{{ fmt(a.total) }}</td>
            </tr>
            <tr v-if="!report.articles.length">
              <td colspan="5">暂无新口径阅读记录</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3>24 小时内获得回应</h3>
      <p>分母为已满 24 小时的首次频道发言或发布文章。管理员按账号角色分类，同一条内容可能收到多类回应。</p>
      <div class="growth-scroll">
        <table>
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
              <td>{{ ratio(s.human, s.total) }}</td>
              <td>{{ fmt(s.member) }}</td>
              <td>{{ fmt(s.staff) }}</td>
              <td>{{ fmt(s.ai) }}</td>
            </tr>
            <tr v-if="!report.replies.length">
              <td colspan="5">暂无已满 24 小时的样本</td>
            </tr>
          </tbody>
        </table>
      </div>
      <details>
        <summary>每日有效活跃与统计口径</summary>
        <p>
          匿名身份按浏览器估算，登录后按账号。会话连续 30
          分钟无观测活动后结束。阅读、问答、公开发言、作品发布或游戏有效使用计入活跃。来源只保存渠道标签和来源域名。
        </p>
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>访问人数</th><th>活跃人数</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in report.trend" :key="d.day">
              <td>{{ d.day }}</td>
              <td>{{ fmt(d.visitors) }}</td><td>{{ fmt(d.active) }}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </template>
  </section>
</template>
<style scoped>
.growth-report {
  display: block;
  min-width: 0;
  padding: clamp(16px, 3vw, 32px);
  margin-block: 18px;
}
header,
.growth-kpis,
ul {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 12px 24px;
}
h2 {
  margin: 0 auto 0 0;
}
h3 {
  margin: 24px 0 8px;
}
p {
  line-height: 1.6;
}
select,
button {
  font: inherit;
}
.growth-kpis {
  margin: 20px 0;
}
.growth-kpis dd {
  margin: 4px 0;
  font-size: 1.25em;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.growth-scroll {
  max-height: 24rem;
  overflow: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  padding: 8px;
  text-align: start;
  border-bottom: 1px solid var(--border, #767987);
}
ul {
  padding-inline-start: 20px;
}
details {
  margin-top: 22px;
}
summary {
  cursor: pointer;
}
.breakdown {
  margin: 0;
}
</style>
