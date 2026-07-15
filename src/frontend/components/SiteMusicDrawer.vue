<script setup>
import TsIcon from './TsIcon.vue';

defineProps({
  music: { type: Object, required: true }
});
</script>

<template>
  <div class="site-music-drawer" :class="{ 'is-open': music.drawer.open, 'is-playing': music.playing.value }">
    <section class="site-music-panel" data-material="popover" aria-label="Music player">
      <div class="site-music-summary">
        <div
          class="music-cover site-music-cover"
          :class="{ 'has-cover': music.coverUrl.value }"
          :style="music.coverUrl.value ? { '--music-cover-image': `url('${music.coverUrl.value}')` } : null"
          role="img"
          aria-label="cover"
        >
          <span><TsIcon name="music" :size="19" :stroke-width="2.15" /></span>
        </div>

        <div class="site-music-summary-main">
          <span class="site-music-kicker">
            <TsIcon name="audioLines" :size="13" :stroke-width="2.1" />
            Music
          </span>
          <div class="music-title-row site-music-title-row">
            <strong>{{ music.currentTrack.value?.title || 'Remember' }}</strong>
          </div>
          <div class="music-meta-row site-music-meta-row">
            <span>Track {{ String(music.trackIndex.value + 1).padStart(2, '0') }}</span>
            <span>/</span>
            <span>{{ music.currentLabel.value }}</span>
            <span>/</span>
            <span>{{ music.durationLabel.value }}</span>
          </div>
        </div>

        <div class="site-music-quick-actions">
          <button class="site-music-play" type="button" :aria-label="music.playing.value ? 'Pause music' : 'Play music'" @click.stop="music.togglePlay">
            <TsIcon :name="music.playing.value ? 'pause' : 'play'" :size="17" :stroke-width="2.4" />
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

      <div v-show="music.drawer.open" class="site-music-body">
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
          <button class="panel-btn music-icon-btn site-music-main-control" type="button" :aria-label="music.playing.value ? 'Pause music' : 'Play music'" @click.stop="music.togglePlay">
            <TsIcon :name="music.playing.value ? 'pause' : 'play'" :size="17" :stroke-width="2.4" />
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

        <div v-if="music.drawer.volume" class="music-drawer site-music-subdrawer site-music-volume-drawer" data-material="popover">
          <div class="music-volume-inline site-music-volume-inline">
            <TsIcon name="volume" :size="15" />
            <input :value="music.volume.value" type="range" min="0" max="1" step="0.01" aria-label="Volume" @input="music.setVolume($event.target.value)">
            <strong>{{ Math.round(music.volume.value * 100) }}%</strong>
          </div>
        </div>

        <div v-if="music.drawer.playlist" class="music-drawer site-music-subdrawer site-music-playlist-drawer" data-material="popover">
          <select :value="music.trackIndex.value" aria-label="Track" @change="music.loadTrack(Number($event.target.value), { play: music.playing.value })">
            <option v-for="(track, index) in music.tracks" :key="track.file" :value="index">{{ String(index + 1).padStart(2, '0') }} - {{ track.title }}</option>
          </select>
        </div>
      </div>
    </section>
  </div>
</template>
