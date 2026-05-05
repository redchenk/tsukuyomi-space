<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { authHeaders, getSession, parseResponse } from '../api/client';

const props = defineProps({
  t: { type: Object, required: true }
});

const emit = defineEmits(['go']);

const latestArticle = ref(null);
const plazaMessages = ref([]);
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
    icon: '☽',
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
    icon: '▤',
    tone: 'blue',
    spa: true,
    image: latestArticle.value?.cover_image || '/assets/images/room-bg.png',
    label: props.t.stage
  },
  { href: '/reality', name: props.t.reality, desc: '现实世界连接入口', code: 'Reality', icon: '◎', tone: 'pink', spa: true, image: '/assets/images/tsukuyomi-bg.png' },
  { href: '/arena/', name: props.t.arena, desc: '超时空辉夜姬竞技场', code: 'Arena', icon: '◇', tone: 'gold', spa: false, image: '/assets/images/tsukuyomi-bg.png' }
]);

const plazaPreviewMessages = computed(() => plazaMessages.value.slice(0, 4));

const stats = computed(() => [
  { label: '今日场景', value: sceneLinks.value.length },
  { label: '月读广场', value: 'OPEN' },
  { label: '竞技场', value: 'LIVE' }
]);

async function loadHubPreview() {
  try {
    const [articleResponse, messageResponse] = await Promise.all([
      fetch('/api/articles'),
      fetch('/api/messages')
    ]);
    const [articleResult, messageResult] = await Promise.all([
      parseResponse(articleResponse),
      parseResponse(messageResponse)
    ]);
    const articles = articleResult.success && Array.isArray(articleResult.data) ? articleResult.data : [];
    const messages = messageResult.success && Array.isArray(messageResult.data) ? messageResult.data : [];

    latestArticle.value = [...articles]
      .sort((a, b) => new Date(b.created_at || b.updated_at || 0) - new Date(a.created_at || a.updated_at || 0))[0] || null;
    plazaMessages.value = [...messages]
      .filter((item) => !item.parent_id)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  } catch (_) {
    latestArticle.value = null;
    plazaMessages.value = [];
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
            <a href="/room" class="primary-btn hub-primary" @click.prevent="$emit('go', '/room')">进入私人居所</a>
            <a href="/plaza" class="nav-link hub-secondary" @click.prevent="$emit('go', '/plaza')">浏览月读广场</a>
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
          <span>设计系统</span>
          <small>Design System</small>
        </div>
        <div class="hub-palette" aria-label="Color palette">
          <span style="--swatch:#0b1020"></span>
          <span style="--swatch:#131a2f"></span>
          <span style="--swatch:#1e2a44"></span>
          <span style="--swatch:#7b8cf6"></span>
          <span style="--swatch:#ff7ac8"></span>
          <span style="--swatch:#aef2ff"></span>
        </div>
        <div class="hub-stat-grid">
          <div v-for="item in stats" :key="item.label">
            <strong>{{ item.value }}</strong>
            <span>{{ item.label }}</span>
          </div>
        </div>
        <div class="hub-side-card">
          <span>Assistant Character</span>
          <strong>月见八千代</strong>
          <p>以温柔、克制、带一点月光般疏离的方式陪伴访客。</p>
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
          @click="scene.kind !== 'plaza' && scene.spa && ($event.preventDefault(), $emit('go', scene.href))"
        >
          <span class="scene-icon" aria-hidden="true">{{ scene.icon }}</span>
          <span v-if="scene.label" class="scene-label">{{ scene.label }}</span>
          <span v-if="scene.kind !== 'plaza'" class="scene-main">
            <span class="scene-name">{{ scene.name }}</span>
            <span class="scene-desc">{{ scene.desc }}</span>
          </span>
          <span v-else class="scene-main plaza-card-body">
            <button class="scene-name hub-plaza-title" type="button" @click="$emit('go', scene.href)">{{ scene.name }}</button>
            <span v-if="!plazaPreviewMessages.length" class="scene-desc">还没有留言，写下第一句问候。</span>
            <span v-else class="hub-plaza-list">
              <span v-for="msg in plazaPreviewMessages" :key="msg.id" class="hub-plaza-message">
                <strong>{{ msg.author || '访客' }}</strong>
                <span>{{ msg.content }}</span>
              </span>
            </span>
            <form class="hub-plaza-form" @submit.prevent="submitPlazaQuick">
              <input v-model="plazaQuick.content" type="text" placeholder="快速留言...">
              <button type="submit" :disabled="plazaQuick.loading">{{ plazaQuick.loading ? '发送中' : '发送' }}</button>
            </form>
            <span v-if="plazaQuick.message" class="hub-plaza-feedback">{{ plazaQuick.message }}</span>
          </span>
        </component>
      </div>
    </section>
  </main>
</template>
