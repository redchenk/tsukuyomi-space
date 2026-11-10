<script setup>
import { computed } from 'vue';
import badge from '../../../assets/icons/icon-512.png';
import corridor from '../assets/entry/moonlight-corridor.webp';
import welcome from '../assets/entry/yachiyo-welcome.webp';
import moonHouse from '../assets/pixel/moon-house.png';
import wiki from '../assets/entry/wiki-frame.webp';
import kaguya from '../assets/entry/kaguya-frame.webp';
import iroha from '../assets/entry/iroha-frame.webp';
import yachiyo from '../assets/entry/yachiyo-frame.webp';
import gallery from '../assets/entry/gallery-frame.webp';

const props = defineProps({
  lang: { type: String, default: 'zh' },
  t: { type: Object, required: true },
  fromAccess: Boolean,
  waiting: Boolean,
  progress: { type: Number, default: 0 }
});
defineEmits(['skip']);

const labels = {
  zh: { skip: '跳过开场', slogan: '给日常留一点月光。', arrival: '月光之门', frames: ['月光小屋', '辉夜', '超时空辉夜姬 Wiki', '酒寄彩叶', '公开图库', '月见八千代'] },
  ja: { skip: 'スキップ', slogan: '日々に、少しの月明かりを。', arrival: '月明かりの扉', frames: ['月明かりの小屋', 'かぐや', '超かぐや姫！ Wiki', '酒寄彩葉', 'ギャラリー', '月見ヤチヨ'] },
  en: { skip: 'Skip intro', slogan: 'Make room for a little moonlight.', arrival: 'The Moonlight Door', frames: ['Moonlight Cottage', 'Kaguya', 'Cosmic Princess Kaguya Wiki', 'Iroha Sakayori', 'Gallery', 'Tsukimi Yachiyo'] }
};
const copy = computed(() => labels[props.lang] || labels.zh);
const frames = [moonHouse, kaguya, wiki, iroha, gallery, yachiyo];
</script>

<template>
  <div class="moonlight-entry" :class="{ 'is-direct': !fromAccess, 'is-water-mirror': fromAccess }"
    :style="{ '--moon-entry-progress': 100 - progress }" role="dialog" aria-modal="true" :aria-label="copy.arrival" @keydown.tab.prevent>
    <div v-if="!fromAccess" class="moon-entry-set" aria-hidden="true">
      <img class="moon-entry-corridor" :src="corridor" alt="" data-image-bloom="off" fetchpriority="high">
      <div class="moon-entry-vignette"></div>
      <canvas class="moon-entry-dust"></canvas>
      <div class="moon-entry-ripple"></div>
      <div class="moon-entry-direct-copy">
        <p class="access-kicker">TSUKUYOMI SPACE</p>
        <p class="access-title">{{ t.title }}</p>
        <p class="access-subtitle">{{ t.subtitle }}</p>
      </div>
      <div class="moon-entry-frames">
        <figure v-for="(art, index) in frames" :key="art" class="moon-entry-frame"
          :class="{ 'moon-entry-frame-pixel': index === 0 }">
          <img :src="art" alt="" data-image-bloom="off">
          <figcaption><span>0{{ index + 1 }}</span>{{ copy.frames[index] }}</figcaption>
        </figure>
      </div>
      <div class="moon-entry-seal">
        <div class="moon-entry-orbit">
          <div class="moon-entry-ticks"></div>
          <i v-for="index in 8" :key="index" :style="{ '--orbit-angle': (index - 1) * 45 + 'deg' }"></i>
        </div>
        <div class="moon-entry-badge"><img :src="badge" alt="" data-image-bloom="off" fetchpriority="high"></div>
      </div>
      <div class="moon-entry-beam"></div>
      <div class="moon-entry-portrait">
        <img :src="welcome" alt="" data-image-bloom="off">
      </div>
      <div class="moon-entry-slogan">
        <p>{{ copy.slogan }}</p>
        <p>{{ t.accessInvitation }}</p>
      </div>
      <svg class="moon-entry-trail" aria-hidden="true">
        <path class="moon-entry-trail-base" pathLength="100"/>
        <path class="moon-entry-trail-light" pathLength="100"/>
      </svg>
      <div class="moon-entry-dock"></div>
      <div class="moon-entry-pet"></div>
      <div class="moon-entry-glare"></div>
    </div>
    <span v-if="waiting" class="moon-entry-loading" role="status">{{ t.accessOpening }} · {{ progress }}%</span>
    <button class="moon-entry-skip" type="button" @click="$emit('skip')">{{ copy.skip }}</button>
  </div>
</template>
