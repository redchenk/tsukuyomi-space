<script setup>
import { computed } from 'vue';

const props = defineProps({
  t: { type: Object, required: true }
});

defineEmits(['go']);

const sceneLinks = computed(() => [
  { href: '/room', name: props.t.room, desc: '你的专属小屋', code: 'Room', icon: '⌂', tone: 'violet', spa: true, image: '/assets/images/room-bg.png' },
  { href: '/plaza', name: props.t.plaza, desc: '交流、分享、发现', code: 'Plaza', icon: '☽', tone: 'cyan', spa: true, image: '/assets/images/tsukuyomi-bg.png' },
  { href: '/stage', name: props.t.stage, desc: '记录、创作、知识', code: 'Stage', icon: '▤', tone: 'blue', spa: true, image: '/assets/images/room-bg.png' },
  { href: '/user-center', name: props.t.ucTitle, desc: '个人信息与成长', code: 'User', icon: '◉', tone: 'pink', spa: true, image: '/models/tsukimi-yachiyo/八千代辉夜姬头像1.png' },
  { href: '/arena/', name: props.t.arena, desc: '超时空辉夜姬竞技场', code: 'Arena', icon: '◇', tone: 'gold', spa: false, image: '/assets/images/tsukuyomi-bg.png' }
]);

const stats = computed(() => [
  { label: '今日场景', value: sceneLinks.value.length },
  { label: '月读广场', value: 'OPEN' },
  { label: '私人居所', value: 'LIVE' }
]);
</script>

<template>
  <main class="page hub">
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

        <figure class="hub-character" aria-label="月见八千代">
          <img
            :src="'/assets/images/yachiyo-hub-stand.jpg'"
            alt="月见八千代"
            @error="$event.currentTarget.src = '/assets/images/tsukuyomi-bg.png'"
          >
        </figure>

        <div class="hub-entry-row" aria-label="主要入口">
          <a
            v-for="scene in sceneLinks"
            :key="scene.href"
            class="hub-entry"
            :class="`tone-${scene.tone}`"
            :href="scene.href"
            @click="scene.spa && ($event.preventDefault(), $emit('go', scene.href))"
          >
            <img class="hub-entry-cover" :src="scene.image" :alt="scene.name">
            <span class="hub-entry-shade"></span>
            <span class="hub-entry-icon" aria-hidden="true">{{ scene.icon }}</span>
            <span class="hub-entry-text">
              <strong>{{ scene.name }}</strong>
              <small>{{ scene.desc }}</small>
            </span>
          </a>
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
          :href="scene.href"
          @click="scene.spa && ($event.preventDefault(), $emit('go', scene.href))"
        >
          <span class="scene-icon" aria-hidden="true">{{ scene.icon }}</span>
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
