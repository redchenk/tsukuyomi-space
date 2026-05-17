<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { authHeaders, getSession, parseResponse } from '../api/client';
import TsIcon from '../components/TsIcon.vue';
import { compareAppDate } from '../utils/time';

const props = defineProps({
  t: { type: Object, required: true }
});

const emit = defineEmits(['go']);

const latestArticle = ref(null);
const plazaMessages = ref([]);
const siteStats = ref(null);
const plazaQuick = reactive({
  content: '',
  loading: false,
  message: ''
});

const sceneLinks = computed(() => [
  {
    href: '/plaza',
    name: props.t.plaza,
    desc: plazaMessages.value.length ? `${plazaMessages.value.length} 条最近留言` : '交流、分享、发现',
    code: 'Plaza',
    icon: 'plaza',
    tone: 'cyan',
    spa: true,
    image: '',
    label: '快速留言',
    kind: 'plaza'
  },
  {
    href: '/stage',
    name: latestArticle.value?.title || props.t.stage,
    desc: latestArticle.value?.excerpt || '记录、创作、知识',
    code: latestArticle.value?.category || 'Stage',
    icon: 'book',
    tone: 'blue',
    spa: true,
    image: latestArticle.value?.cover_image || '/assets/images/room-bg.png',
    label: props.t.stage
  },
  { href: '/reality', name: props.t.reality, desc: '现实世界连接入口', code: 'Reality', icon: 'compass', tone: 'pink', spa: true, image: '/assets/images/tsukuyomi-bg.png' },
  { href: '/arena/', name: props.t.arena, desc: '超时空辉夜姬竞技场', code: 'Arena', icon: 'gamepad', tone: 'gold', spa: false, image: '/assets/images/tsukuyomi-bg.png' }
]);

const plazaPreviewMessages = computed(() => plazaMessages.value.slice(0, 4));

function formatHubNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN');
}

function formatHubUptime(seconds = 0) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  if (days) return `${days}天${hours}时`;
  return `${hours || 1}小时`;
}

const stats = computed(() => [
  { label: '今日访问', value: formatHubNumber(siteStats.value?.todayViews) },
  { label: '总访问', value: formatHubNumber(siteStats.value?.totalViews) },
  { label: '注册用户', value: formatHubNumber(siteStats.value?.users) },
  { label: '站内文章', value: formatHubNumber(siteStats.value?.articles) },
  { label: '广场留言', value: formatHubNumber(siteStats.value?.messages) },
  { label: '运行时间', value: siteStats.value?.uptime ? formatHubUptime(siteStats.value.uptime) : '--' }
]);

function openScene(scene, event) {
  if (scene.kind === 'plaza' && event?.target?.closest?.('form, input, textarea, button, a')) return;
  if (scene.spa) {
    event?.preventDefault?.();
    emit('go', scene.href);
    return;
  }
  window.location.href = scene.href;
}

async function loadHubPreview() {
  try {
    const [articleResponse, messageResponse, statsResponse] = await Promise.all([
      fetch('/api/articles'),
      fetch('/api/messages'),
      fetch('/api/stats')
    ]);
    const [articleResult, messageResult, statsResult] = await Promise.all([
      parseResponse(articleResponse),
      parseResponse(messageResponse),
      parseResponse(statsResponse)
    ]);
    const articles = articleResult.success && Array.isArray(articleResult.data) ? articleResult.data : [];
    const messages = messageResult.success && Array.isArray(messageResult.data) ? messageResult.data : [];

    latestArticle.value = [...articles]
      .sort((a, b) => compareAppDate(b.created_at || b.updated_at, a.created_at || a.updated_at))[0] || null;
    plazaMessages.value = [...messages]
      .filter((item) => !item.parent_id)
      .sort((a, b) => compareAppDate(b.created_at, a.created_at));
    siteStats.value = statsResult.success ? statsResult.data || null : null;
  } catch (_) {
    latestArticle.value = null;
    plazaMessages.value = [];
    siteStats.value = null;
  }
}

async function submitPlazaQuick() {
  const content = plazaQuick.content.trim();
  plazaQuick.message = '';
  if (!content) {
    plazaQuick.message = '留言不能为空';
    return;
  }
  if (!getSession()) {
    emit('go', '/login');
    return;
  }
  plazaQuick.loading = true;
  try {
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ content })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || '发布失败');
    plazaQuick.content = '';
    plazaQuick.message = '已发布';
    await loadHubPreview();
  } catch (error) {
    plazaQuick.message = error.message || '发布失败';
  } finally {
    plazaQuick.loading = false;
  }
}

onMounted(loadHubPreview);
</script>

<template>
  <main class="page hub">
    <figure class="hub-character" aria-label="月见八千代">
      <img :src="'/assets/images/yachiyo-hub-stand.png'" alt="月见八千代">
    </figure>

    <section class="hub-showcase">
      <div class="hub-hero-panel">
        <div class="hub-hero-copy">
          <span class="hub-kicker">✦ Web UI Redesign Concept</span>
          <p class="hub-welcome">欢迎来到</p>
          <h1 class="section-title">{{ t.brand }}</h1>
          <p class="hub-en-title">Tsukuyomi Space</p>
          <p class="section-subtitle">{{ t.heroCopy }}</p>
          <div class="hub-actions">
            <a href="/room" class="primary-btn hub-primary" @click.prevent="$emit('go', '/room')">
              <TsIcon name="moon" :size="17" />
              <span>进入私人居所</span>
            </a>
            <a href="/plaza" class="nav-link hub-secondary" @click.prevent="$emit('go', '/plaza')">
              <TsIcon name="plaza" :size="17" />
              <span>浏览月读广场</span>
            </a>
          </div>
        </div>

        <div class="hub-orbit" aria-hidden="true">
          <div class="hub-orbit-moon">☾</div>
          <div class="hub-orbit-ring"></div>
          <div class="hub-floating-island">
            <span></span>
            <strong>Tsukuyomi</strong>
          </div>
        </div>

      </div>

      <aside class="hub-side-panel">
        <div class="hub-side-head">
          <span>本站统计</span>
          <small>Site Analytics</small>
        </div>
        <div class="hub-stat-grid">
          <div v-for="item in stats" :key="item.label">
            <strong>{{ item.value }}</strong>
            <span>{{ item.label }}</span>
          </div>
        </div>
        <div class="hub-side-card">
          <span>Visitor Flow</span>
          <strong>{{ formatHubNumber(siteStats?.weekViews) }} 次</strong>
          <p>最近七天访问记录。数据来自站内访问事件与文章阅读量。</p>
        </div>
      </aside>
    </section>

    <section class="hub-grid-wrap">
      <div class="hub-section-head">
        <div>
          <h2>中枢大厅</h2>
          <span>选择一个入口，开启你的旅程</span>
        </div>
        <span class="hub-online">STATUS: ONLINE</span>
      </div>
      <div class="scene-grid">
        <component
          :is="scene.kind === 'plaza' ? 'div' : 'a'"
          v-for="scene in sceneLinks"
          :key="scene.href"
          class="scene-card"
          :class="[`tone-${scene.tone}`, { 'scene-card-plaza': scene.kind === 'plaza' }]"
          :style="{ '--scene-image': `url(${scene.image})` }"
          :href="scene.kind === 'plaza' ? undefined : scene.href"
          :role="scene.kind === 'plaza' ? 'link' : undefined"
          :tabindex="scene.kind === 'plaza' ? 0 : undefined"
          @click="openScene(scene, $event)"
          @keydown.enter="openScene(scene, $event)"
          @keydown.space.prevent="openScene(scene, $event)"
        >
          <span class="scene-icon" aria-hidden="true">
            <TsIcon :name="scene.icon" :size="22" :stroke-width="1.9" />
          </span>
          <span v-if="scene.label" class="scene-label">{{ scene.label }}</span>
          <span v-if="scene.kind !== 'plaza'" class="scene-main">
            <span class="scene-name">{{ scene.name }}</span>
            <span class="scene-desc">{{ scene.desc }}</span>
          </span>
          <span v-else class="scene-main plaza-card-body">
            <span class="scene-name hub-plaza-title">{{ scene.name }}</span>
            <span v-if="!plazaPreviewMessages.length" class="scene-desc">还没有留言，写下第一句问候。</span>
            <span v-else class="hub-plaza-list">
              <span v-for="msg in plazaPreviewMessages" :key="msg.id" class="hub-plaza-message">
                <strong>{{ msg.author || '访客' }}</strong>
                <span>{{ msg.content }}</span>
              </span>
            </span>
            <form class="hub-plaza-form" @click.stop @keydown.stop @submit.prevent="submitPlazaQuick">
              <input v-model="plazaQuick.content" type="text" placeholder="快速留言...">
              <button type="submit" :disabled="plazaQuick.loading">
                <TsIcon :name="plazaQuick.loading ? 'loader' : 'send'" :size="15" />
                <span>{{ plazaQuick.loading ? '发送中' : '发送' }}</span>
              </button>
            </form>
            <span v-if="plazaQuick.message" class="hub-plaza-feedback">{{ plazaQuick.message }}</span>
          </span>
        </component>
      </div>
    </section>
  </main>
</template>
