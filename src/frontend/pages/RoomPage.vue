<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import TsIcon from '../components/TsIcon.vue';
import { apiFetch, parseResponse } from '../api/client';
import RoomChatPanel from '../components/room/RoomChatPanel.vue';
import RoomDiaryPanel from '../components/room/RoomDiaryPanel.vue';
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
const mobileRoom = ref(window.matchMedia('(max-width: 860px)').matches);
const mobileTools = computed(() => room.panels.panelButtons.filter((button) => button.id !== 'chatPanel'));
const companionStatus = computed(() => room.live2d.error.value ? '角色暂未连接' : room.live2d.ready.value ? '在这里，陪着你' : '正在准备与你见面…');
let mobileQuery;

function updateMobileRoom(event) {
  mobileRoom.value = event.matches;
}

function selectMobilePanel(panelId) {
  const wasOpen = room.panels.activePanels[panelId];
  for (const button of mobileTools.value) room.panels.closePanel(button.id);
  if (!wasOpen) room.panels.openPanel(panelId);
}

onMounted(() => {
  mobileQuery = window.matchMedia('(max-width: 860px)');
  mobileQuery.addEventListener('change', updateMobileRoom);
});
onBeforeUnmount(() => mobileQuery?.removeEventListener('change', updateMobileRoom));

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
    class="room-page room-conversation-layout"
    :class="{ 'room-companion-only': !room.panels.activePanels.chatPanel }"
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

    <header class="room-mobile-header">
      <a href="/hub" aria-label="返回大厅" @click.prevent="emit('go', '/hub')"><TsIcon name="arrowLeft" :size="21" /></a>
      <div><strong>私人居所</strong><span>留一点时间，与你相伴</span></div>
      <button class="room-mobile-music" type="button" aria-label="房间音乐" :aria-expanded="room.music.drawer.open" @click="room.music.toggleShell"><TsIcon name="audioLines" :size="20" /></button>
    </header>
    <RoomStage :live2d="room.live2d" :character-name="room.stageCharacterName.value" />
    <RoomWeatherCard :weather="room.world.weatherCard.value" />
    <section class="room-companion-bar" aria-label="角色与房间工具">
      <div class="room-companion-identity">
        <img :src="'/assets/images/wiki/entries/characters/yachiyo-tsukuyomi.webp'" alt="" width="42" height="42">
        <div><h1>{{ room.chat.characterName.value }}</h1><p :class="{ 'is-ready': room.live2d.ready.value }">{{ companionStatus }}</p></div>
        <button type="button" class="room-companion-mode" :aria-label="room.panels.activePanels.chatPanel ? '展开角色舞台' : '返回聊天'" @click="room.panels.togglePanel('chatPanel')">
          <TsIcon :name="room.panels.activePanels.chatPanel ? 'maximize' : 'message'" :size="18" />
        </button>
      </div>
      <nav class="room-mobile-tools" aria-label="房间功能">
        <button v-for="button in mobileTools" :key="button.id" type="button" :aria-pressed="room.panels.activePanels[button.id]" @click="selectMobilePanel(button.id)">
          <TsIcon :name="button.icon" :size="17" /><span>{{ button.label }}</span>
        </button>
        <button type="button" @click="emit('go', '/room/settings')"><TsIcon name="settings" :size="17" /><span>设置</span></button>
      </nav>
    </section>
    <RoomDock
      :buttons="room.panels.panelButtons"
      :active-panels="room.panels.activePanels"
      @toggle="room.panels.togglePanel"
      @settings="emit('go', '/room/settings')"
    />

    <RoomChatPanel
      v-if="room.panels.activePanels.chatPanel"
      :chat="room.chat"
      :panel-style="mobileRoom ? {} : room.panels.panelStyle('chatPanel')"
      @close="room.panels.closePanel('chatPanel')"
      @focus="!mobileRoom && room.panels.bringPanelForward('chatPanel')"
      @drag-start="room.panels.startPanelDrag('chatPanel', $event)"
      @share="openConversationShare"
      @growth="emit('go', '/growth')"
      @open-diary="room.panels.openPanel('diaryPanel')"
    />
    <RoomDiaryPanel
      v-if="room.panels.activePanels.diaryPanel"
      :diary="room.diary"
      :panel-style="room.panels.panelStyle('diaryPanel')"
      @close="room.panels.closePanel('diaryPanel')"
      @focus="room.panels.bringPanelForward('diaryPanel')"
      @drag-start="room.panels.startPanelDrag('diaryPanel', $event)"
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
