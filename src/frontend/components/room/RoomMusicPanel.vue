<script setup>
import RoomDraggablePanel from './RoomDraggablePanel.vue';

defineProps({
  music: { type: Object, required: true },
  panelStyle: { type: Object, required: true }
});

const emit = defineEmits(['close', 'focus', 'drag-start']);
</script>

<template>
  <RoomDraggablePanel
    panel-id="musicPanel"
    panel-class="room-music-panel"
    :panel-style="panelStyle"
    @close="emit('close')"
    @focus="emit('focus')"
    @drag-start="emit('drag-start', $event)"
  >
    <template #header>
      <div class="music-card-main">
        <div id="musicCover" class="music-cover" :class="{ 'has-cover': music.coverUrl.value }" :style="music.coverUrl.value ? { '--music-cover-image': `url('${music.coverUrl.value}')` } : null" role="img" aria-label="cover">
          <span id="musicCoverGlyph">{{ music.currentTrack.value?.title?.slice(0, 1) || '♪' }}</span>
          <button id="musicPlayBtn" class="music-cover-play" type="button" aria-label="Play music" @click.stop="music.togglePlay">{{ music.playing.value ? 'Ⅱ' : '▶' }}</button>
        </div>
        <div class="music-main-info">
          <div class="music-title-row">
            <strong id="musicTitle">{{ music.currentTrack.value?.title || 'Remember' }}</strong>
            <span id="musicTrackIndex">Track {{ String(music.trackIndex.value + 1).padStart(2, '0') }}</span>
          </div>
          <div class="music-progress-row">
            <input id="musicProgress" v-model.number="music.progress.value" class="music-progress" type="range" min="0" max="1000" aria-label="Music progress">
          </div>
          <div class="music-meta-row">
            <span id="musicCurrentTime">{{ music.currentLabel.value }}</span>
            <span>/</span>
            <span id="musicDuration">{{ music.durationLabel.value }}</span>
            <button id="musicVolumeBtn" class="music-mini-btn" :class="{ 'is-active': music.drawer.volume }" type="button" aria-label="Volume" @click.stop="music.toggleDrawer('volume')">&#9834;</button>
            <button id="musicMenuBtn" class="music-mini-btn" :class="{ 'is-active': music.drawer.playlist }" type="button" aria-label="Playlist" @click.stop="music.toggleDrawer('playlist')">&#9776;</button>
          </div>
        </div>
        <button class="panel-close music-close" type="button" aria-label="Close music" @pointerdown.stop @click.stop="emit('close')">x</button>
      </div>
    </template>
    <div v-if="music.drawer.volume" id="musicVolumeDrawer" class="music-drawer music-volume-drawer">
      <div class="music-volume-inline">
        <span>&#38899;&#37327;</span>
        <input :value="music.volume.value" type="range" min="0" max="1" step="0.01" aria-label="Volume" @input="music.setVolume($event.target.value)">
      </div>
    </div>
    <div v-if="music.drawer.playlist" id="musicPlaylistDrawer" class="music-drawer music-playlist-drawer">
      <select id="musicTrackSelect" :value="music.trackIndex.value" aria-label="Track" @change="music.loadTrack(Number($event.target.value), { play: music.playing.value })">
        <option v-for="(track, index) in music.tracks" :key="track.file" :value="index">{{ String(index + 1).padStart(2, '0') }} - {{ track.title }}</option>
      </select>
      <div class="music-drawer-actions">
        <button id="musicPrevBtn" class="panel-btn music-icon-btn" type="button" aria-label="Previous" @click="music.prev">&#8592;</button>
        <button id="musicNextBtn" class="panel-btn music-icon-btn" type="button" aria-label="Next" @click="music.next">&#8594;</button>
      </div>
    </div>
  </RoomDraggablePanel>
</template>
