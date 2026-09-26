<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
const desktopPanel = ref('chatPanel');
const panelHostReady = ref(false);
const desktopTabs = [
  { id: 'chatPanel', label: '聊天', icon: 'message' },
  { id: 'diaryPanel', label: '日记', icon: 'book' },
  { id: 'profilePanel', label: '资料', icon: 'user' },
  { id: 'notePanel', label: '便签', icon: 'note' }
];
function openDiary() {
  if (mobileRoom.value) room.panels.openPanel('diaryPanel');
  else desktopPanel.value = 'diaryPanel';
}
function closeUtility(panelId) {
  if (mobileRoom.value) room.panels.closePanel(panelId);
  else desktopPanel.value = 'chatPanel';
}
function changeDesktopTab(event, index) {
  const key = event.key;
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
  event.preventDefault();
  const next = key === 'Home' ? 0 : key === 'End' ? desktopTabs.length - 1 : (index + (key === 'ArrowRight' ? 1 : -1) + desktopTabs.length) % desktopTabs.length;
  desktopPanel.value = desktopTabs[next].id;
  event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus();
}
const mobileTools = computed(() => room.panels.panelButtons.filter((button) => button.id !== 'chatPanel'));
const companionName = computed(() => room.chat.characterName.value === '八千代辉夜姬' ? '八千代' : room.chat.characterName.value);
const companionStatus = computed(() => room.live2d.error.value ? '角色暂未连接' : room.live2d.ready.value ? '在这里，陪着你' : '正在准备与你见面…');
const mobileToolsMenu = ref(null);
const chatPanel = ref(null);
const mobileSessionBusy = computed(() => room.chat.sending.value || room.chat.resetting.value || room.chat.endChatState.value.status === 'generating');
let mobileQuery;

async function newMobileConversation() {
  closeMobileTools();
  room.panels.openPanel('chatPanel');
  await room.chat.startNewSession();
}

async function showMobileHistory() {
  closeMobileTools();
  room.panels.openPanel('chatPanel');
  await nextTick();
  chatPanel.value?.readEarlierMessages();
}

function endMobileConversation() {
  closeMobileTools();
  room.panels.openPanel('chatPanel');
  room.chat.openEndChatDialog();
}

function closeMobileTools(event) {
  const menu = mobileToolsMenu.value;
  if (!menu?.open) return;
  if (event?.type === 'pointerdown' && menu.contains(event.target)) return;
  if (event?.type === 'keydown' && event.key !== 'Escape') return;
  menu.open = false;
  if (event?.type === 'keydown') menu.querySelector('summary')?.focus();
}

function updateMobileRoom(event) {
  mobileRoom.value = event.matches;
}

function selectMobilePanel(panelId) {
  closeMobileTools();
  const wasOpen = room.panels.activePanels[panelId];
  for (const button of mobileTools.value) room.panels.closePanel(button.id);
  if (!wasOpen) room.panels.openPanel(panelId);
}

onMounted(() => {
  panelHostReady.value = true;
  mobileQuery = window.matchMedia('(max-width: 860px)');
  mobileQuery.addEventListener('change', updateMobileRoom);
  document.addEventListener('pointerdown', closeMobileTools);
  document.addEventListener('keydown', closeMobileTools);
});
onBeforeUnmount(() => {
  mobileQuery?.removeEventListener('change', updateMobileRoom);
  document.removeEventListener('pointerdown', closeMobileTools);
  document.removeEventListener('keydown', closeMobileTools);
});

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
    :class="{ 'room-companion-only': mobileRoom && !room.panels.activePanels.chatPanel }"
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
      <details ref="mobileToolsMenu" class="room-tools-disclosure">
        <summary aria-label="房间功能"><TsIcon name="message" :size="22" /></summary>
        <nav class="room-mobile-tools" aria-label="房间功能">
          <span class="room-tools-heading">这一刻，慢慢聊</span>
          <button type="button" :disabled="mobileSessionBusy" @click="newMobileConversation"><TsIcon name="plus" :size="18" /><span>{{ room.chat.resetting.value ? '正在新建' : '新建会话' }}</span></button>
          <button type="button" @click="showMobileHistory"><TsIcon name="undo" :size="18" /><span>查看对话开头</span></button>
          <button v-for="button in mobileTools" :key="button.id" type="button" :aria-pressed="room.panels.activePanels[button.id]" @click="selectMobilePanel(button.id)"><TsIcon :name="button.icon" :size="18" /><span>{{ button.label }}</span></button>
          <button type="button" :disabled="mobileSessionBusy" aria-label="结束聊天" @click="endMobileConversation"><TsIcon name="book" :size="18" /><span>结束并写日记</span></button>
          <button type="button" @click="closeMobileTools(); room.music.toggleShell()"><TsIcon name="audioLines" :size="18" /><span>房间音乐</span></button>
          <button type="button" @click="closeMobileTools(); emit('go', '/growth')"><TsIcon name="sparkles" :size="18" /><span>月契成长</span></button>
          <button type="button" :aria-pressed="!room.panels.activePanels.chatPanel" @click="closeMobileTools(); room.panels.togglePanel('chatPanel')"><TsIcon :name="room.panels.activePanels.chatPanel ? 'maximize' : 'message'" :size="18" /><span>{{ room.panels.activePanels.chatPanel ? '安静陪伴' : '返回聊天' }}</span></button>
        </nav>
      </details>
      <a class="room-mobile-settings" href="/room/settings" aria-label="房间设置与长期记忆" @click.prevent="emit('go', '/room/settings')"><TsIcon name="settings" :size="23" /></a>
    </header>
    <RoomStage :live2d="room.live2d" :character-name="room.stageCharacterName.value" :music="room.music" :weather="room.world.weatherCard.value" @settings="emit('go', '/room/settings')" />
    <RoomWeatherCard :weather="room.world.weatherCard.value" />
    <RoomDock
      :buttons="room.panels.panelButtons"
      :active-panels="room.panels.activePanels"
      @toggle="room.panels.togglePanel"
      @settings="emit('go', '/room/settings')"
    />

    <div class="room-conversation-surface">
      <section class="room-companion-bar" aria-label="角色与房间工具">
        <div class="room-companion-identity">
          <img :src="'/assets/images/wiki/entries/characters/yachiyo-tsukuyomi.webp'" alt="" width="42" height="42" data-image-bloom="subtle">
          <span class="room-companion-avatar" aria-hidden="true"></span>
          <div><h1>{{ companionName }}</h1><p :class="{ 'is-ready': room.live2d.ready.value }">{{ companionStatus }}</p></div>
        </div>
      </section>
      <nav class="room-desktop-tabs" role="tablist" aria-label="房间工作区">
        <button v-for="(tab, index) in desktopTabs" :id="`room-tab-${tab.id}`" :key="tab.id" type="button" role="tab" :aria-selected="desktopPanel === tab.id" :aria-controls="tab.id === 'chatPanel' ? 'room-chat-workspace' : 'room-desktop-panel-host'" :tabindex="desktopPanel === tab.id ? 0 : -1" @click="desktopPanel = tab.id" @keydown="changeDesktopTab($event, index)">
          <TsIcon :name="tab.icon" :size="16" /><span>{{ tab.label }}</span>
        </button>
        <a class="room-desktop-settings" href="/room/settings" aria-label="房间设置与长期记忆" @click.prevent="emit('go', '/room/settings')"><TsIcon name="settings" :size="18" /></a>
      </nav>
      <div id="room-chat-workspace" v-show="mobileRoom || desktopPanel === 'chatPanel'" class="room-chat-workspace" :role="mobileRoom ? undefined : 'tabpanel'" :aria-labelledby="mobileRoom ? undefined : 'room-tab-chatPanel'">
        <RoomChatPanel
          v-if="!mobileRoom || room.panels.activePanels.chatPanel"
          ref="chatPanel"
          :chat="room.chat"
          :mobile="mobileRoom"
          :panel-style="{}"
          @close="room.panels.closePanel('chatPanel')"
          @focus="mobileRoom && room.panels.bringPanelForward('chatPanel')"
          @drag-start="mobileRoom && room.panels.startPanelDrag('chatPanel', $event)"
          @share="openConversationShare"
          @growth="emit('go', '/growth')"
          @open-diary="openDiary"
        />
      </div>
      <div id="room-desktop-panel-host" v-show="!mobileRoom && desktopPanel !== 'chatPanel'" role="tabpanel" :aria-labelledby="`room-tab-${desktopPanel}`"></div>
    </div>
    <Teleport v-if="panelHostReady" to="#room-desktop-panel-host" :disabled="mobileRoom">
      <RoomDiaryPanel
        v-if="mobileRoom ? room.panels.activePanels.diaryPanel : desktopPanel === 'diaryPanel'"
        :diary="room.diary"
        :panel-style="mobileRoom ? room.panels.panelStyle('diaryPanel') : {}"
        @close="closeUtility('diaryPanel')"
        @focus="mobileRoom && room.panels.bringPanelForward('diaryPanel')"
        @drag-start="mobileRoom && room.panels.startPanelDrag('diaryPanel', $event)"
      />
      <RoomProfilePanel
        v-if="mobileRoom ? room.panels.activePanels.profilePanel : desktopPanel === 'profilePanel'"
        :profile="room.profile.profile"
        :panel-style="mobileRoom ? room.panels.panelStyle('profilePanel') : {}"
        @close="closeUtility('profilePanel')"
        @focus="mobileRoom && room.panels.bringPanelForward('profilePanel')"
        @drag-start="mobileRoom && room.panels.startPanelDrag('profilePanel', $event)"
        @save="room.profile.saveProfile()"
      />
      <RoomNotePanel
        v-if="mobileRoom ? room.panels.activePanels.notePanel : desktopPanel === 'notePanel'"
        :note="room.note.note"
        :panel-style="mobileRoom ? room.panels.panelStyle('notePanel') : {}"
        @close="closeUtility('notePanel')"
        @focus="mobileRoom && room.panels.bringPanelForward('notePanel')"
        @drag-start="mobileRoom && room.panels.startPanelDrag('notePanel', $event)"
        @save="room.note.saveNote()"
      />
    </Teleport>
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
