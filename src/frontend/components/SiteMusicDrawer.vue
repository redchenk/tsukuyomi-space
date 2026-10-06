<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import TsIcon from './TsIcon.vue';
import SiteMusicLibrary from './SiteMusicLibrary.vue';

const props = defineProps({
  music: { type: Object, required: true },
  lang: { type: String, default: 'zh' }
});
const tr = (zh, en, ja = zh) => props.lang === 'en' ? en : props.lang === 'ja' ? ja : zh;
const active = computed(() => props.music.playing.value || props.music.playPending.value);
const visualOpen = ref(props.music.drawer.open);
const morphing = ref(false);
const drawerElement = ref(null);
const panelElement = ref(null);
let epoch = 0;
let animations = [];
function cancelMorph() {
  animations.forEach(animation => animation.cancel()); animations = [];
  if (panelElement.value) panelElement.value.style.width = '';
  morphing.value = false;
}
// Measure only when toggled, freeze the inner layout and morph its small outer
// box. No polling, animation-frame loop or observer runs while music is playing.
watch(() => props.music.drawer.open, async open => {
  const id = ++epoch;
  const element = drawerElement.value;
  const from = element?.getBoundingClientRect();
  cancelMorph();
  visualOpen.value = open;
  await nextTick();
  if (id !== epoch || !element || !from) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !element.animate) return;
  const target = element.getBoundingClientRect();
  if (!open) { visualOpen.value = true; await nextTick(); }
  if (id !== epoch) return;
  const panel = panelElement.value;
  panel.style.width = `${open ? target.width : from.width}px`;
  morphing.value = true;
  await nextTick();
  if (id !== epoch) return;
  const options = { duration: open ? 320 : 260, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' };
  const baseBottom = open ? target.bottom : from.bottom;
  const animation = element.animate([
    { width: `${from.width}px`, height: `${from.height}px`, transform: `translateY(${from.bottom - baseBottom}px)` },
    { width: `${target.width}px`, height: `${target.height}px`, transform: `translateY(${target.bottom - baseBottom}px)` }
  ], options);
  const body = panel.querySelector('.site-music-body');
  animations = [animation, body.animate(open ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], options)];
  try { await animation.finished; } catch { return; }
  if (id !== epoch) return;
  visualOpen.value = open;
  await nextTick();
  if (id === epoch) cancelMorph();
}, { flush: 'pre' });
onBeforeUnmount(() => { epoch++; cancelMorph(); });
</script>

<template>
  <div ref="drawerElement" class="site-music-drawer" :class="{ 'is-open': visualOpen, 'is-morphing': morphing, 'is-playing': music.playing.value }">
    <section ref="panelElement" class="site-music-panel" :data-material="visualOpen ? 'popover' : null" aria-label="Music player">
      <div class="site-music-summary">
        <div
          class="music-cover site-music-cover"
          :class="{ 'has-cover': music.coverUrl.value }"
          :style="music.coverUrl.value ? { '--music-cover-image': `url(${JSON.stringify(music.coverUrl.value)})` } : null"
          role="img"
          aria-label="cover"
        >
          <span><TsIcon name="music" :size="19" :stroke-width="2.15" /></span>
        </div>

        <div class="site-music-summary-main">
          <span class="site-music-kicker">
            <TsIcon name="audioLines" :size="13" :stroke-width="2.1" />
            {{ music.source.value === 'netease' ? '网易云 · Music' : 'Music' }}
          </span>
          <div class="music-title-row site-music-title-row">
            <strong>{{ music.currentTrack.value?.title || 'Remember' }}</strong>
          </div>
          <div class="music-meta-row site-music-meta-row">
            <span>{{ music.currentTrack.value?.artist || `Track ${String(music.trackIndex.value + 1).padStart(2, '0')}` }}</span>
            <span>/</span>
            <span>{{ music.currentLabel.value }}</span>
            <span>/</span>
            <span>{{ music.durationLabel.value }}</span>
          </div>
        </div>

        <div class="site-music-quick-actions">
          <button class="site-music-play" type="button" :aria-label="active ? 'Pause music' : 'Play music'" @click.stop="music.togglePlay">
            <TsIcon :name="active ? 'pause' : 'play'" :size="17" :stroke-width="2.4" />
          </button>
          <button class="site-music-handle" type="button" :aria-expanded="music.drawer.open ? 'true' : 'false'" :aria-label="music.drawer.open ? 'Collapse music drawer' : 'Expand music drawer'" @click="music.toggleShell">
            <TsIcon :name="music.drawer.open ? 'chevronUp' : 'audioLines'" :size="17" :stroke-width="2.4" />
            <span class="sr-only">{{ music.drawer.open ? 'Collapse music drawer' : 'Expand music drawer' }}</span>
          </button>
        </div>
      </div>

      <div class="site-music-mini-progress" aria-hidden="true">
        <span :style="{ width: `${Math.min(100, Math.max(0, music.progress.value / 10))}%` }"></span>
      </div>

      <div v-show="visualOpen" class="site-music-body" :inert="!music.drawer.open" :aria-hidden="!music.drawer.open">
        <div class="music-progress-row site-music-progress-row">
          <span>{{ music.currentLabel.value }}</span>
          <input
            v-model.number="music.progress.value"
            class="music-progress site-music-progress"
            type="range"
            min="0"
            max="1000"
            aria-label="Music progress"
            :style="{ '--music-progress': `${Math.min(100, Math.max(0, music.progress.value / 10))}%` }"
          >
          <span>{{ music.durationLabel.value }}</span>
        </div>

        <div class="site-music-controls">
          <button class="panel-btn music-icon-btn" type="button" aria-label="Previous" @click="music.prev">
            <TsIcon name="skipBack" :size="17" />
          </button>
          <button class="panel-btn music-icon-btn site-music-main-control" type="button" :aria-label="active ? 'Pause music' : 'Play music'" @click.stop="music.togglePlay">
            <TsIcon :name="active ? 'pause' : 'play'" :size="17" :stroke-width="2.4" />
          </button>
          <button class="panel-btn music-icon-btn" type="button" aria-label="Next" @click="music.next">
            <TsIcon name="skipForward" :size="17" />
          </button>
          <button class="music-mini-btn site-music-mini-btn" :class="{ 'is-active': music.drawer.volume }" type="button" aria-label="Volume" @click.stop="music.toggleDrawer('volume')">
            <TsIcon name="volume" :size="17" />
          </button>
          <button class="music-mini-btn site-music-mini-btn" :class="{ 'is-active': music.drawer.playlist }" type="button" aria-label="Playlist" @click.stop="music.toggleDrawer('playlist')">
            <TsIcon name="list" :size="17" />
          </button>
        </div>

        <label class="site-music-order">
          <span>{{ tr('播放顺序', 'Playback mode', '再生モード') }}</span>
          <span class="music-select-wrap">
            <select :value="music.mode.value" autocomplete="off" @change="music.setMode($event.target.value)">
              <option value="sequence">{{ tr('顺序播放', 'In order', '順番に再生') }}</option>
              <option value="loop">{{ tr('列表循环', 'Repeat queue', 'リストを繰り返す') }}</option>
              <option value="shuffle">{{ tr('随机播放', 'Shuffle', 'シャッフル') }}</option>
              <option value="single">{{ tr('单曲循环', 'Repeat one', '1曲を繰り返す') }}</option>
            </select>
            <TsIcon name="chevronDown" :size="14" />
          </span>
        </label>

        <div v-if="music.drawer.volume" class="music-drawer site-music-subdrawer site-music-volume-drawer" data-material="popover">
          <div class="music-volume-inline site-music-volume-inline">
            <TsIcon name="volume" :size="15" />
            <input :value="music.volume.value" type="range" min="0" max="1" step="0.01" aria-label="Volume" @input="music.setVolume($event.target.value)">
            <strong>{{ Math.round(music.volume.value * 100) }}%</strong>
          </div>
        </div>

        <div v-if="music.drawer.playlist" class="music-drawer site-music-subdrawer site-music-playlist-drawer" data-material="popover">
          <div class="music-select-wrap">
            <select :value="music.trackIndex.value" aria-label="Track" @change="music.loadTrack(Number($event.target.value), { play: music.playing.value })">
              <option v-for="(track, index) in music.tracks" :key="track.file || track.id" :value="index">{{ String(index + 1).padStart(2, '0') }} - {{ track.title }}</option>
            </select>
            <TsIcon name="chevronDown" :size="14" />
          </div>
        </div>
        <p v-if="music.loading.value || music.playbackError.value || music.preview.value" class="music-playback-status" role="status">{{ music.loading.value ? '正在准备音频…' : music.playbackError.value || '当前为网易云试听片段' }}</p>
        <SiteMusicLibrary :music="music" :lang="lang" />
      </div>
    </section>
  </div>
</template>
