<script setup>
import { computed } from 'vue';
import { gameCopy } from '../data/gameCopy';
import TsIcon from '../components/TsIcon.vue';
import portrait from '../assets/sakura/yachiyo-portrait.webp';
import runnerArt from '../assets/navigation/kaguya-run.webp';
const props = defineProps({ lang: { type: String, default: 'zh' } });
const emit = defineEmits(['go']);
const copy = computed(() => gameCopy(props.lang));
</script>

<template>
  <main class="page game-center-page">
    <div class="game-center-wrap">
      <header class="game-center-header">
        <p class="game-eyebrow"><TsIcon name="gamepad" :size="18" /> {{ copy.center }}</p>
        <h1>{{ copy.intro }}</h1><p>{{ copy.invitation }}</p>
      </header>
      <section class="game-library" :aria-label="copy.center">
        <article class="game-feature panel">
          <div class="game-feature-art" aria-hidden="true">
            <img :src="portrait" alt="" width="1024" height="1024">
            <div class="game-mini-board"><i v-for="(stone, i) in [1, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0, 1, 2, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0, 1]" :key="i" :class="{ black: stone === 1, white: stone === 2 }"></i></div>
            <span>{{ copy.together }}</span>
          </div>
          <div class="game-card-copy"><p class="game-eyebrow">01 / {{ copy.boardTag }}</p><h2>{{ copy.gomoku }}</h2><p>{{ copy.gomokuDesc }}</p>
            <a class="primary-btn game-entry" href="/game/gomoku" @click.prevent="emit('go', '/game/gomoku')">{{ copy.play }} <TsIcon name="arrowRight" :size="18" /></a>
            <small>{{ copy.available }} · {{ copy.casual }} / {{ copy.challenge }}</small>
          </div>
        </article>
        <article class="game-runner-card panel">
          <img :src="runnerArt" alt="" width="1024" height="768">
          <div class="game-card-copy"><p class="game-eyebrow">02 / {{ copy.runnerTag }}</p><h2>{{ copy.runner }}</h2><p>{{ copy.runnerDesc }}</p>
            <a class="ghost-btn game-entry" href="/game/kaguya-run" @click.prevent="emit('go', '/game/kaguya-run')">{{ copy.run }} <TsIcon name="arrowRight" :size="18" /></a>
          </div>
        </article>
      </section>
      <footer class="game-coming"><TsIcon name="sparkles" :size="22" /><div><strong>{{ copy.more }}</strong><p>{{ copy.moreDesc }}</p></div></footer>
    </div>
  </main>
</template>
