<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { apiFetch, parseResponse } from '../api/client';
import RoomChatPanel from '../components/room/RoomChatPanel.vue';
import RoomDock from '../components/room/RoomDock.vue';
import RoomLoadingOverlay from '../components/room/RoomLoadingOverlay.vue';
import RoomNotePanel from '../components/room/RoomNotePanel.vue';
import RoomProfilePanel from '../components/room/RoomProfilePanel.vue';
import RoomStage from '../components/room/RoomStage.vue';
import RoomWeatherCard from '../components/room/RoomWeatherCard.vue';
import RoomShareDialog from '../components/room/RoomShareDialog.vue';
import { getSession } from '../api/client';
import { useRoomState } from '../composables/room/useRoomState';

const props = defineProps({
  user: { type: Object, default: null },
  shareId: { type: String, default: '' },
  lang: { type: String, default: 'zh' }
});

const emit = defineEmits(['go']);
const room = useRoomState();

function readStoredUser() {
  return getSession()?.user || null;
}

const roomUser = computed(() => readStoredUser() || (props.user?.id ? props.user : null));
const roomUserName = computed(() => roomUser.value?.username || roomUser.value?.email || 'Guest');
const roomUserId = computed(() => roomUser.value?.id || roomUser.value?.username || roomUser.value?.email || '');
const shareDialogOpen = ref(false);
const selectedShareTurn = ref(null);

function openConversationShare(message) {
  const turn = room.chat.getShareTurn(message);
  if (!turn) return;
  selectedShareTurn.value = turn;
  shareDialogOpen.value = true;
}

async function loadSharedConversation() {
  const shareId = String(props.shareId || '').trim();
  if (!shareId) return;
  try {
    const response = await apiFetch(`/api/room/shares/${encodeURIComponent(shareId)}`, { cache: 'no-store' });
    const result = await parseResponse(response);
    if (!response.ok || !result.success) throw new Error(result.message || '分享内容不存在');
    room.world.applySharedWorld(result.data.scene || {});
    room.chat.showSharedConversation(result.data);
    room.panels.activePanels.chatPanel = true;
    room.panels.bringPanelForward('chatPanel');
  } catch (error) {
    room.chat.addMessage('system', error.message || '分享内容无法加载', { shareable: false });
  }
}

onMounted(loadSharedConversation);
watch(() => props.shareId, loadSharedConversation);
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
    :aria-busy="room.loading.active"
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
      @share="openConversationShare"
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
    <RoomLoadingOverlay :active="room.loading.active" :error="room.loading.error" :title="room.loading.title" :detail="room.loading.detail" />
    <RoomShareDialog
      :open="shareDialogOpen"
      :turn="selectedShareTurn"
      :scene="room.world.world.value"
      :lang="lang"
      @close="shareDialogOpen = false"
    />
  </main>
</template>
