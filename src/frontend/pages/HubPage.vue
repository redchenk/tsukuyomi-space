<script setup>
import { computed, onMounted, ref } from 'vue';
import { parseResponse } from '../api/client';

const props = defineProps({
  t: { type: Object, required: true }
});

defineEmits(['go']);

const latestArticle = ref(null);
const latestMessage = ref(null);

const sceneLinks = computed(() => [
  {
    href: '/plaza',
    name: props.t.plaza,
    desc: latestMessage.value ? String(latestMessage.value.content || '').slice(0, 42) : '交流、分享、发现',
    code: latestMessage.value?.author || 'Plaza',
    icon: '☽',
    tone: 'cyan',
    spa: true,
    image: '/assets/images/tsukuyomi-bg.png',
    label: latestMessage.value ? '最新留言' : 'Plaza'
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
    latestMessage.value = [...messages]
      .filter((item) => !item.parent_id)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
  } catch (_) {
    latestArticle.value = null;
    latestMessage.value = null;
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
        <a
          v-for="scene in sceneLinks"
          :key="scene.href"
          class="scene-card"
          :class="`tone-${scene.tone}`"
          :style="{ '--scene-image': `url(${scene.image})` }"
          :href="scene.href"
          @click="scene.spa && ($event.preventDefault(), $emit('go', scene.href))"
        >
          <span class="scene-icon" aria-hidden="true">{{ scene.icon }}</span>
          <span v-if="scene.label" class="scene-label">{{ scene.label }}</span>
          <span class="scene-main">
            <span class="scene-name">{{ scene.name }}</span>
            <span class="scene-desc">{{ scene.desc }}</span>
          </span>
          <span class="scene-code">{{ scene.code }}</span>
        </a>
      </div>
    </section>
  </main>
</template>
