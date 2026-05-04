<script setup>
import { computed } from 'vue';

const props = defineProps({
  t: { type: Object, required: true }
});

defineEmits(['go']);

const sceneLinks = computed(() => [
  { href: '/room', name: props.t.room, desc: props.t.roomDesc, code: '01', tone: 'pink', spa: true },
  { href: '/plaza', name: props.t.plaza, desc: props.t.plazaDesc, code: '02', tone: 'cyan', spa: true },
  { href: '/stage', name: props.t.stage, desc: props.t.stageDesc, code: '03', tone: 'gold', spa: true },
  { href: '/arena/', name: props.t.arena, desc: props.t.arenaDesc, code: '04', tone: 'violet', spa: false },
  { href: '/reality', name: props.t.reality, desc: props.t.realityDesc, code: '05', tone: 'green', spa: true }
]);

const primaryScene = computed(() => sceneLinks.value[0]);
const secondaryScenes = computed(() => sceneLinks.value.slice(1));
</script>

<template>
  <main class="page hub">
    <section class="hub-hero">
      <div class="hub-copy">
        <div class="hub-kicker">Tsukuyomi Hub</div>
        <h1 class="section-title">{{ t.hubTitle }}</h1>
        <p class="section-subtitle">{{ t.hubSubtitle }}</p>
        <div class="hub-status-row">
          <span>Live2D</span>
          <span>Articles</span>
          <span>Plaza</span>
          <span>{{ t.terminal }}</span>
        </div>
      </div>

      <a
        class="hub-feature"
        :href="primaryScene.href"
        @click="primaryScene.spa && ($event.preventDefault(), $emit('go', primaryScene.href))"
      >
        <span class="scene-code">{{ primaryScene.code }}</span>
        <span class="hub-feature-body">
          <span class="hub-feature-label">Recommended</span>
          <span class="hub-feature-title">{{ primaryScene.name }}</span>
          <span class="scene-desc">{{ primaryScene.desc }}</span>
        </span>
        <span class="scene-arrow">&gt;</span>
      </a>
    </section>

    <section class="hub-grid-wrap">
      <div class="hub-section-head">
        <h2>入口</h2>
        <span>{{ sceneLinks.length }} routes</span>
      </div>
      <div class="scene-grid">
        <a
          v-for="scene in secondaryScenes"
          :key="scene.href"
          class="scene-card"
          :class="`tone-${scene.tone}`"
          :href="scene.href"
          @click="scene.spa && ($event.preventDefault(), $emit('go', scene.href))"
        >
          <span class="scene-code">{{ scene.code }}</span>
          <span class="scene-main">
            <span class="scene-name">{{ scene.name }}</span>
            <span class="scene-desc">{{ scene.desc }}</span>
          </span>
          <span class="scene-arrow">&gt;</span>
        </a>
      </div>
    </section>
    <div class="hub-footer-line">
      <span>STATUS: ONLINE</span>
      <span>{{ t.brand }}</span>
    </div>
  </main>
</template>
