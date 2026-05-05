<script setup>
import { computed } from 'vue';

const props = defineProps({
  t: { type: Object, required: true }
});

defineEmits(['go']);

const sceneLinks = computed(() => [
  { href: '/room', name: props.t.room, desc: props.t.roomDesc, code: 'Live2D', tone: 'pink', spa: true },
  { href: '/plaza', name: props.t.plaza, desc: props.t.plazaDesc, code: 'Plaza', tone: 'cyan', spa: true },
  { href: '/stage', name: props.t.stage, desc: props.t.stageDesc, code: 'Blog', tone: 'gold', spa: true },
  { href: '/arena/', name: props.t.arena, desc: props.t.arenaDesc, code: 'Game', tone: 'violet', spa: false },
  { href: '/reality', name: props.t.reality, desc: props.t.realityDesc, code: 'World', tone: 'green', spa: true }
]);

const primaryScene = computed(() => sceneLinks.value[0]);
const secondaryScenes = computed(() => sceneLinks.value.slice(1));

const notes = computed(() => [
  { label: 'Room', value: props.t.roomDesc },
  { label: 'Plaza', value: props.t.plazaDesc },
  { label: 'Arena', value: props.t.arenaDesc }
]);
</script>

<template>
  <main class="page hub">
    <section class="hub-hero">
      <div class="hub-copy">
        <div class="hub-kicker">Tsukuyomi Space</div>
        <h1 class="section-title">{{ t.hubTitle }}</h1>
        <p class="section-subtitle">{{ t.hubSubtitle }}</p>
        <div class="hub-status-row">
          <span>{{ t.room }}</span>
          <span>{{ t.stage }}</span>
          <span>{{ t.plaza }}</span>
        </div>
      </div>

      <aside class="hub-feature">
        <div class="hub-feature-head">
          <span class="hub-feature-label">Today</span>
          <span>{{ sceneLinks.length }} 个入口</span>
        </div>
        <a
          class="hub-feature-link"
          :href="primaryScene.href"
          @click="primaryScene.spa && ($event.preventDefault(), $emit('go', primaryScene.href))"
        >
          <span class="scene-code">{{ primaryScene.code }}</span>
          <span class="hub-feature-body">
            <span class="hub-feature-title">{{ primaryScene.name }}</span>
            <span class="scene-desc">{{ primaryScene.desc }}</span>
          </span>
          <span class="scene-arrow">&gt;</span>
        </a>
        <div class="hub-notes">
          <div v-for="note in notes" :key="note.label">
            <strong>{{ note.label }}</strong>
            <span>{{ note.value }}</span>
          </div>
        </div>
      </aside>
    </section>

    <section class="hub-grid-wrap">
      <div class="hub-section-head">
        <h2>去哪里</h2>
        <span>选择一个空间继续</span>
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
