<script setup>
import { computed } from 'vue';

const props = defineProps({
  t: { type: Object, required: true }
});

defineEmits(['go']);

const sceneLinks = computed(() => [
  { href: '/pages/room', name: props.t.room, desc: props.t.roomDesc, spa: false },
  { href: '/plaza', name: props.t.plaza, desc: props.t.plazaDesc, spa: true },
  { href: '/stage', name: props.t.stage, desc: props.t.stageDesc, spa: true },
  { href: '/pages/arena', name: props.t.arena, desc: props.t.arenaDesc, spa: false },
  { href: '/reality', name: props.t.reality, desc: props.t.realityDesc, spa: true }
]);
</script>

<template>
  <main class="page hub">
    <h1 class="section-title">{{ t.hubTitle }}</h1>
    <p class="section-subtitle">{{ t.hubSubtitle }}</p>
    <div class="scene-grid">
      <a
        v-for="scene in sceneLinks"
        :key="scene.href"
        class="scene-card"
        :href="scene.href"
        @click="scene.spa && ($event.preventDefault(), $emit('go', scene.href))"
      >
        <span>
          <span class="scene-name">{{ scene.name }}</span>
          <span class="scene-desc">{{ scene.desc }}</span>
        </span>
        <span class="scene-arrow">&gt;</span>
      </a>
    </div>
  </main>
</template>
