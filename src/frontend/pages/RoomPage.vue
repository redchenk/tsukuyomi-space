<script setup>
import { computed } from 'vue';
import RoomChatPanel from '../components/room/RoomChatPanel.vue';
import RoomDock from '../components/room/RoomDock.vue';
import RoomLoadingOverlay from '../components/room/RoomLoadingOverlay.vue';
import RoomMusicPanel from '../components/room/RoomMusicPanel.vue';
import RoomNotePanel from '../components/room/RoomNotePanel.vue';
import RoomProfilePanel from '../components/room/RoomProfilePanel.vue';
import RoomStage from '../components/room/RoomStage.vue';
import RoomWeatherCard from '../components/room/RoomWeatherCard.vue';
import { useRoomState } from '../composables/room/useRoomState';

const props = defineProps({
  user: { type: Object, default: null }
});

const emit = defineEmits(['go']);
const room = useRoomState();

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('tsukuyomi_user') || 'null');
  } catch (_) {
    return null;
  }
}

const roomUser = computed(() => readStoredUser() || (props.user?.id && localStorage.getItem('tsukuyomi_token') ? props.user : null));
const roomUserName = computed(() => roomUser.value?.username || roomUser.value?.email || 'Guest');
const roomUserId = computed(() => roomUser.value?.id || roomUser.value?.username || roomUser.value?.email || '');
</script>

<template>
  <main
    class="room-page"
    aria-label="&#31169;&#20154;&#23621;&#25152;"
    :data-room-user-id="roomUserId"
    :data-room-user-name="roomUserName"
    :data-time-phase="room.world.world.value.timePhase"
    :data-season="room.world.world.value.season"
    :data-weather="room.world.world.value.weather"
    :style="room.roomStyle.value"
  >
    <div class="room-backdrop" aria-hidden="true"></div>
    <div
      v-if="['rain', 'storm', 'snow', 'fog', 'cloudy'].includes(room.world.world.value.weather)"
      class="room-weather-layer"
      data-room-weather-layer="true"
      :data-weather="room.world.world.value.weather"
      aria-hidden="true"
    >
      <span
        v-for="particle in room.world.weatherParticles.value"
        :key="particle.id"
        class="room-weather-particle"
        :style="room.world.particleStyle(particle)"
      ></span>
    </div>

    <RoomStage :live2d="room.live2d" />
    <RoomWeatherCard :weather="room.world.weatherCard.value" />
    <RoomDock
      :buttons="room.panels.panelButtons"
      :active-panels="room.panels.activePanels"
      @toggle="room.panels.togglePanel"
      @settings="emit('go', '/room/settings')"
    />

    <RoomChatPanel
      v-if="room.panels.activePanels.chatPanel"
      :chat="room.chat"
      :panel-style="room.panels.panelStyle('chatPanel')"
      @close="room.panels.closePanel('chatPanel')"
      @focus="room.panels.bringPanelForward('chatPanel')"
      @drag-start="room.panels.startPanelDrag('chatPanel', $event)"
    />
    <RoomMusicPanel
      v-if="room.panels.activePanels.musicPanel"
      :music="room.music"
      :panel-style="room.panels.panelStyle('musicPanel')"
      @close="room.panels.closePanel('musicPanel')"
      @focus="room.panels.bringPanelForward('musicPanel')"
      @drag-start="room.panels.startPanelDrag('musicPanel', $event)"
    />
    <RoomProfilePanel
      v-if="room.panels.activePanels.profilePanel"
      :profile="room.profile.profile"
      :panel-style="room.panels.panelStyle('profilePanel')"
      @close="room.panels.closePanel('profilePanel')"
      @focus="room.panels.bringPanelForward('profilePanel')"
      @drag-start="room.panels.startPanelDrag('profilePanel', $event)"
      @save="room.profile.saveProfile()"
    />
    <RoomNotePanel
      v-if="room.panels.activePanels.notePanel"
      :note="room.note.note"
      :panel-style="room.panels.panelStyle('notePanel')"
      @close="room.panels.closePanel('notePanel')"
      @focus="room.panels.bringPanelForward('notePanel')"
      @drag-start="room.panels.startPanelDrag('notePanel', $event)"
      @save="room.note.saveNote()"
    />
    <RoomLoadingOverlay :active="room.loading.active" :title="room.loading.title" :detail="room.loading.detail" />
  </main>
</template>
