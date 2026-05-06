<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useRoomPanels } from '../composables/useRoomPanels';
import { useRoomWorld } from '../composables/useRoomWorld';

const props = defineProps({
  user: { type: Object, default: null }
});

defineEmits(['go']);

const scripts = [
  '/lib/live2dcubismcore-v5.min.js',
  '/lib/bundled/live2d-room.iife.js?v=20260505-fast1',
  '/assets/js/room-runtime.js?v=20260506-vue-room1'
];

const preloadResources = [
  { href: '/lib/live2dcubismcore-v5.min.js', as: 'script' },
  { href: '/lib/bundled/live2d-room.iife.js?v=20260505-fast1', as: 'script' },
  { href: '/assets/js/room-runtime.js?v=20260506-vue-room1', as: 'script' },
  { href: '/models/tsukimi-yachiyo/tsukimi-yachiyo.model3.json', as: 'fetch', type: 'application/json' },
  { href: '/models/tsukimi-yachiyo/tsukimi-yachiyo.moc3', as: 'fetch', type: 'application/octet-stream' }
];

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
const {
  world,
  weatherCard,
  weatherParticles,
  particleStyle,
  initRoomWorld,
  destroyRoomWorld
} = useRoomWorld();
const {
  activePanels,
  panelButtons,
  panelStyle,
  bringPanelForward,
  togglePanel,
  closePanel,
  startPanelDrag,
  onPointerMove,
  onPointerUp
} = useRoomPanels();
function loadScript(src, options = {}) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-room-script="${src}"]`);
    if (existing) {
      if (options.reload) {
        existing.remove();
      } else {
        if (existing.dataset.loaded === 'true') resolve();
        else existing.addEventListener('load', resolve, { once: true });
        return;
      }
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.defer = true;
    script.dataset.roomScript = src;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.body.appendChild(script);
  });
}

function preloadRoomResources() {
  preloadResources.forEach((resource) => {
    const existing = document.head.querySelector(`link[data-room-preload="${resource.href}"]`);
    if (existing) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = resource.href;
    link.as = resource.as;
    link.dataset.roomPreload = resource.href;
    if (resource.type) link.type = resource.type;
    if (resource.as === 'fetch') link.crossOrigin = 'anonymous';
    link.fetchPriority = resource.as === 'image' || resource.as === 'script' ? 'high' : 'auto';
    document.head.appendChild(link);
  });
}

onMounted(async () => {
  document.body.classList.add('vue-room-route');
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  initRoomWorld();
  window.TSUKUYOMI_LIVE2D_READY = false;
  window.destroyTsukuyomiLive2DRoom?.();

  const container = document.getElementById('live2d-container');
  container?.querySelectorAll('canvas').forEach((node) => node.remove());

  preloadRoomResources();

  for (const src of scripts) {
    await loadScript(src);
  }

  window.initTsukuyomiLive2DRoom?.();
  window.initTsukuyomiRoomRuntime?.();
});

onBeforeUnmount(() => {
  document.body.classList.remove('vue-room-route');
  document.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerup', onPointerUp);
  destroyRoomWorld();
  window.destroyTsukuyomiRoomRuntime?.();
  window.destroyTsukuyomiLive2DRoom?.();
});
</script>

<template>
  <main
    class="room-page"
    aria-label="&#31169;&#20154;&#23621;&#25152;"
    :data-room-user-id="roomUserId"
    :data-room-user-name="roomUserName"
    :data-time-phase="world.timePhase"
    :data-season="world.season"
    :data-weather="world.weather"
    :style="world.temperature == null ? null : { '--room-temperature': world.temperature }"
  >
    <div class="room-backdrop" aria-hidden="true"></div>
    <div
      v-if="['rain', 'storm', 'snow', 'fog', 'cloudy'].includes(world.weather)"
      class="room-weather-layer"
      data-room-weather-layer="true"
      :data-weather="world.weather"
      aria-hidden="true"
    >
      <span
        v-for="particle in weatherParticles"
        :key="particle.id"
        class="room-weather-particle"
        :style="particleStyle(particle)"
      ></span>
    </div>

    <section class="room-stage" aria-label="Live2D &#33310;&#21488;">
      <div class="room-stage-copy">
        <p>Live2D Room</p>
        <h1>&#20843;&#21315;&#20195;&#36745;&#22812;&#23020;&#27491;&#22312;&#25151;&#38388;&#37324;&#31561;&#20320;</h1>
      </div>
      <div id="live2d-container" class="room-live2d-container"></div>
    </section>

    <aside class="room-weather-card" aria-label="Room weather">
      <div class="room-weather-head">
        <span id="roomWeatherIcon" class="room-weather-icon" aria-hidden="true">{{ weatherCard.icon }}</span>
        <div>
          <small id="roomWeatherCity">{{ weatherCard.city }}</small>
          <small>Room Weather</small>
          <strong id="roomWeatherLabel">{{ weatherCard.label }}</strong>
        </div>
      </div>
      <div class="room-weather-meta">
        <span id="roomWeatherTemperature">{{ weatherCard.temperature }}</span>
        <span id="roomWeatherWind">{{ weatherCard.wind }}</span>
      </div>
      <p id="roomWeatherDetail">{{ weatherCard.detail }}</p>
    </aside>

    <div class="panel-controls room-dock" aria-label="Room tools">
      <button
        v-for="button in panelButtons"
        :key="button.id"
        class="panel-toggle-btn"
        :class="{ 'is-active': activePanels[button.id] }"
        type="button"
        :aria-pressed="activePanels[button.id] ? 'true' : 'false'"
        @click="togglePanel(button.id)"
      >{{ button.label }}</button>
      <button class="panel-toggle-btn" type="button" @click="$emit('go', '/room/settings')">&#35774;&#32622;</button>
    </div>

    <section id="chatPanel" v-show="activePanels.chatPanel" class="draggable-panel room-panel room-chat-panel" :style="panelStyle('chatPanel')" @pointerdown="bringPanelForward('chatPanel')">
      <div class="panel-header" @pointerdown="startPanelDrag('chatPanel', $event)">
        <span class="panel-title">&#19982;&#36745;&#22812;&#23020;&#32842;&#22825;</span>
        <button class="panel-close" type="button" aria-label="Close chat" @pointerdown.stop @click.stop="closePanel('chatPanel')">x</button>
      </div>
      <div class="panel-content chat-body">
        <div id="chatMessages" class="room-chat-messages"></div>
        <div id="chatImagePreview" class="chat-image-preview" hidden></div>
        <div class="chat-input-row">
          <input id="chatImageInput" type="file" accept="image/*" hidden>
          <button id="attachImageBtn" class="panel-btn chat-attach-btn" type="button" title="&#19978;&#20256;&#22270;&#29255;" aria-label="&#19978;&#20256;&#22270;&#29255;"><span aria-hidden="true">+</span><span>&#22270;&#29255;</span></button>
          <input id="chatInput" type="text" placeholder="&#36755;&#20837;&#28040;&#24687;&#65292;Enter &#21457;&#36865;">
          <button id="sendChatBtn" class="panel-btn" type="button">&#21457;&#36865;</button>
        </div>
      </div>
    </section>

    <section id="musicPanel" v-show="activePanels.musicPanel" class="draggable-panel room-panel room-music-panel" :style="panelStyle('musicPanel')" @pointerdown="bringPanelForward('musicPanel')">
      <div class="panel-header music-card-main" @pointerdown="startPanelDrag('musicPanel', $event)">
        <div id="musicCover" class="music-cover" role="img" aria-label="&#24403;&#21069;&#27468;&#26354;&#23553;&#38754;">
          <span id="musicCoverGlyph">&#9834;</span>
          <button id="musicPlayBtn" class="music-cover-play" type="button" aria-label="&#25773;&#25918;&#38899;&#20048;">&#9654;</button>
        </div>
        <div class="music-main-info">
          <div class="music-title-row">
            <strong id="musicTitle">Remember</strong>
            <span id="musicTrackIndex">Track 01</span>
          </div>
          <div class="music-progress-row">
            <input id="musicProgress" class="music-progress" type="range" min="0" max="1000" value="0" aria-label="&#38899;&#20048;&#36827;&#24230;">
          </div>
          <div class="music-meta-row">
            <span id="musicCurrentTime">0:00</span>
            <span>/</span>
            <span id="musicDuration">0:00</span>
            <button id="musicVolumeBtn" class="music-mini-btn" type="button" aria-label="&#23637;&#24320;&#38899;&#37327;">&#9834;</button>
            <button id="musicMenuBtn" class="music-mini-btn" type="button" aria-label="&#23637;&#24320;&#25773;&#25918;&#21015;&#34920;">&#9776;</button>
          </div>
        </div>
        <button class="panel-close music-close" type="button" aria-label="Close music" @pointerdown.stop @click.stop="closePanel('musicPanel')">x</button>
      </div>
      <div id="musicVolumeDrawer" class="music-drawer music-volume-drawer" hidden>
        <div class="music-volume-inline">
          <span>&#38899;&#37327;</span>
          <input id="musicVolume" type="range" min="0" max="1" step="0.01" value="0.72" aria-label="&#38899;&#37327;&#35843;&#33410;">
        </div>
      </div>
      <div id="musicPlaylistDrawer" class="music-drawer music-playlist-drawer" hidden>
        <select id="musicTrackSelect" aria-label="&#36873;&#25321;&#27468;&#26354;"></select>
        <div class="music-drawer-actions">
          <button id="musicPrevBtn" class="panel-btn music-icon-btn" type="button" aria-label="&#19978;&#19968;&#39318;">&#8592;</button>
          <button id="musicNextBtn" class="panel-btn music-icon-btn" type="button" aria-label="&#19979;&#19968;&#39318;">&#8594;</button>
        </div>
      </div>
    </section>

    <section id="profilePanel" v-show="activePanels.profilePanel" class="draggable-panel room-panel" :style="panelStyle('profilePanel')" @pointerdown="bringPanelForward('profilePanel')">
      <div class="panel-header" @pointerdown="startPanelDrag('profilePanel', $event)">
        <span class="panel-title">&#20010;&#20154;&#36164;&#26009;</span>
        <button class="panel-close" type="button" aria-label="Close profile" @pointerdown.stop @click.stop="closePanel('profilePanel')">x</button>
      </div>
      <div class="panel-content">
        <div class="field">
          <label for="nicknameInput">&#26165;&#31216;</label>
          <input id="nicknameInput" type="text" placeholder="&#32473;&#33258;&#24049;&#36215;&#19968;&#20010;&#21517;&#23383;">
        </div>
        <div class="field">
          <label for="signatureInput">&#31614;&#21517;</label>
          <textarea id="signatureInput" placeholder="&#20889;&#19968;&#21477;&#20170;&#22825;&#24819;&#30041;&#19979;&#30340;&#35805;"></textarea>
        </div>
        <button id="saveProfileBtn" class="panel-btn" type="button">&#20445;&#23384;&#36164;&#26009;</button>
        <div id="profileDisplay" class="panel-section"></div>
      </div>
    </section>

    <section id="notePanel" v-show="activePanels.notePanel" class="draggable-panel room-panel" :style="panelStyle('notePanel')" @pointerdown="bringPanelForward('notePanel')">
      <div class="panel-header" @pointerdown="startPanelDrag('notePanel', $event)">
        <span class="panel-title">&#20415;&#31614;</span>
        <button class="panel-close" type="button" aria-label="Close note" @pointerdown.stop @click.stop="closePanel('notePanel')">x</button>
      </div>
      <div class="panel-content">
        <textarea id="noteContent" placeholder="&#25226;&#28789;&#24863;&#20808;&#25918;&#22312;&#36825;&#37324;"></textarea>
        <button id="saveNoteBtn" class="panel-btn" type="button">&#20445;&#23384;&#20415;&#31614;</button>
      </div>
    </section>

    <div id="loadingOverlay" class="status-layer active" role="status" aria-live="polite">
      <div class="status-box">
        <div class="status-spinner"></div>
        <div class="status-progress" aria-hidden="true"><span></span></div>
        <div id="loadingTitle" class="status-title">SYNCHRONIZING...</div>
        <div id="loadingDetail" class="status-detail">Loading Cubism Core and model assets...</div>
      </div>
    </div>
  </main>
</template>
