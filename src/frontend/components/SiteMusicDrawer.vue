<script setup>
defineProps({
  music: { type: Object, required: true }
});
</script>

<template>
  <div class="site-music-drawer" :class="{ 'is-open': music.drawer.open }">
    <button class="site-music-handle" type="button" :aria-expanded="music.drawer.open ? 'true' : 'false'" :aria-label="music.drawer.open ? 'Collapse music drawer' : 'Expand music drawer'" @click="music.toggleShell">
      <span aria-hidden="true">{{ music.drawer.open ? '⌃' : '⌄' }}</span>
      <span class="sr-only">{{ music.drawer.open ? 'Collapse music drawer' : 'Expand music drawer' }}</span>
    </button>

    <section class="site-music-panel" aria-label="Music player">
      <div class="site-music-summary">
        <div
          class="music-cover site-music-cover"
          :class="{ 'has-cover': music.coverUrl.value }"
          :style="music.coverUrl.value ? { '--music-cover-image': `url('${music.coverUrl.value}')` } : null"
          role="img"
          aria-label="cover"
        >
          <span>{{ music.currentTrack.value?.title?.slice(0, 1) || '♪' }}</span>
        </div>
        <div class="site-music-summary-main">
          <div class="music-title-row site-music-title-row">
            <strong>{{ music.currentTrack.value?.title || 'Remember' }}</strong>
            <span>Track {{ String(music.trackIndex.value + 1).padStart(2, '0') }}</span>
          </div>
          <div class="music-meta-row site-music-meta-row">
            <span>{{ music.currentLabel.value }}</span>
            <span>/</span>
            <span>{{ music.durationLabel.value }}</span>
          </div>
        </div>
        <button class="site-music-play" type="button" :aria-label="music.playing.value ? 'Pause music' : 'Play music'" @click.stop="music.togglePlay">
          {{ music.playing.value ? 'Ⅱ' : '▶' }}
        </button>
      </div>

      <div v-show="music.drawer.open" class="site-music-body">
        <div class="music-progress-row site-music-progress-row">
          <input v-model.number="music.progress.value" class="music-progress site-music-progress" type="range" min="0" max="1000" aria-label="Music progress">
        </div>

        <div class="site-music-controls">
          <button class="panel-btn music-icon-btn" type="button" aria-label="Previous" @click="music.prev">&#8592;</button>
          <button class="panel-btn music-icon-btn" type="button" aria-label="Next" @click="music.next">&#8594;</button>
          <button class="music-mini-btn site-music-mini-btn" :class="{ 'is-active': music.drawer.volume }" type="button" aria-label="Volume" @click.stop="music.toggleDrawer('volume')">&#9834;</button>
          <button class="music-mini-btn site-music-mini-btn" :class="{ 'is-active': music.drawer.playlist }" type="button" aria-label="Playlist" @click.stop="music.toggleDrawer('playlist')">&#9776;</button>
        </div>

        <div v-if="music.drawer.volume" class="music-drawer site-music-subdrawer site-music-volume-drawer">
          <div class="music-volume-inline site-music-volume-inline">
            <span>音量</span>
            <input :value="music.volume.value" type="range" min="0" max="1" step="0.01" aria-label="Volume" @input="music.setVolume($event.target.value)">
          </div>
        </div>

        <div v-if="music.drawer.playlist" class="music-drawer site-music-subdrawer site-music-playlist-drawer">
          <select :value="music.trackIndex.value" aria-label="Track" @change="music.loadTrack(Number($event.target.value), { play: music.playing.value })">
            <option v-for="(track, index) in music.tracks" :key="track.file" :value="index">{{ String(index + 1).padStart(2, '0') }} - {{ track.title }}</option>
          </select>
        </div>
      </div>
    </section>
  </div>
</template>
