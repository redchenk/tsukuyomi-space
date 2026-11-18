<script setup>
import { computed, ref } from 'vue';
import badge from '../../../assets/icons/icon-512.png';
import corridor from '../assets/entry/moonlight-corridor.webp';
import welcome from '../assets/entry/yachiyo-room-guide.webp';
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
  zh: { skip: '跳过开场', guide: '月见八千代', greeting: '来啦？', invitation: '给你留了个位子。', arrival: '月光之门', frames: ['月光小屋', '辉夜', '超时空辉夜姬 Wiki', '酒寄彩叶', '公开图库', '月见八千代'] },
  ja: { skip: 'スキップ', guide: '月見ヤチヨ', greeting: '来てくれたんだ。', invitation: 'こっち、空いてるよ。', arrival: '月明かりの扉', frames: ['月明かりの小屋', 'かぐや', '超かぐや姫！ Wiki', '酒寄彩葉', 'ギャラリー', '月見ヤチヨ'] },
  en: { skip: 'Skip intro', guide: 'Yachiyo Runami', greeting: 'Come on in.', invitation: 'I saved you a seat.', arrival: 'The Moonlight Door', frames: ['Moonlight Cottage', 'Kaguya', 'Cosmic Princess Kaguya Wiki', 'Iroha Sakayori', 'Gallery', 'Yachiyo Runami'] }
};
const copy = computed(() => labels[props.lang] || labels.zh);
const guideReady = ref(false);
const frames = [moonHouse, kaguya, wiki, iroha, gallery, yachiyo];
</script>

<template>
  <div class="moonlight-entry" :class="{ 'is-direct': !fromAccess, 'is-water-mirror': fromAccess }"
    role="dialog" aria-modal="true" :aria-label="copy.arrival" @keydown.tab.prevent>
    <div v-if="!fromAccess" class="moon-entry-set" aria-hidden="true">
      <img class="moon-entry-corridor" :src="corridor" alt="" data-image-bloom="off" fetchpriority="high">
      <div class="moon-entry-vignette"></div>
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
      <div class="moon-entry-welcome">
        <div class="moon-entry-portrait">
          <img :src="welcome" alt="" width="1055" height="1490" data-image-bloom="off" fetchpriority="high" @load="guideReady = true">
          <span v-show="guideReady" class="moon-entry-hand-light"><i class="moon-entry-hand-ring"></i></span>
        </div>
        <div class="moon-entry-slogan">
          <p class="moon-entry-speaker">{{ copy.guide }}</p>
          <p class="moon-entry-words"><span>{{ copy.greeting }}</span> <span>{{ copy.invitation }}</span></p>
        </div>
      </div>
      <div class="moon-entry-glare"></div>
    </div>
    <span v-if="waiting" class="moon-entry-loading" role="status">{{ t.accessOpening }} · {{ progress }}%</span>
    <button class="moon-entry-skip" type="button" @click="$emit('skip')">{{ copy.skip }}</button>
  </div>
</template>
