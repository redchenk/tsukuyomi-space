<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue';

const props = defineProps({
  user: { type: Object, default: null }
});

defineEmits(['go']);

const scripts = [
  '/lib/live2dcubismcore-v5.min.js',
  '/lib/bundled/live2d-room.iife.js?v=20260505-fast1',
  '/assets/js/room-runtime.js?v=20260505-fast1'
];

const preloadResources = [
  { href: '/lib/live2dcubismcore-v5.min.js', as: 'script' },
  { href: '/lib/bundled/live2d-room.iife.js?v=20260505-fast1', as: 'script' },
  { href: '/assets/js/room-runtime.js?v=20260505-fast1', as: 'script' },
  { href: '/models/tsukimi-yachiyo/tsukimi-yachiyo.model3.json', as: 'fetch', type: 'application/json' },
  { href: '/models/tsukimi-yachiyo/tsukimi-yachiyo.moc3', as: 'fetch', type: 'application/octet-stream' },
  { href: '/models/tsukimi-yachiyo/textures/texture_00.webp', as: 'image', type: 'image/webp' },
  { href: '/models/tsukimi-yachiyo/textures/texture_01.webp', as: 'image', type: 'image/webp' }
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
  window.TSUKUYOMI_EXTERNAL_LIVE2D = true;
  window.TSUKUYOMI_LIVE2D_READY = false;
  window.destroyTsukuyomiLive2DRoom?.();

  const container = document.getElementById('live2d-container');
  container?.querySelectorAll('canvas:not(#live2d-canvas)').forEach((node) => node.remove());

  preloadRoomResources();

  for (const src of scripts) {
    await loadScript(src);
  }

  window.initTsukuyomiLive2DRoom?.();
  window.initTsukuyomiRoomRuntime?.();
});

onBeforeUnmount(() => {
  document.body.classList.remove('vue-room-route');
  window.destroyTsukuyomiRoomRuntime?.();
  window.destroyTsukuyomiLive2DRoom?.();
});
</script>

<template>
  <main class="room-page" aria-label="&#31169;&#20154;&#23621;&#25152;" :data-room-user-id="roomUserId" :data-room-user-name="roomUserName">
    <div class="room-backdrop" aria-hidden="true"></div>

    <section class="room-stage" aria-label="Live2D &#33310;&#21488;">
      <div class="room-stage-copy">
        <p>Live2D Room</p>
        <h1>&#20843;&#21315;&#20195;&#36745;&#22812;&#23020;&#27491;&#22312;&#25151;&#38388;&#37324;&#31561;&#20320;</h1>
      </div>
      <div id="live2d-container" class="room-live2d-container"></div>
    </section>

    <aside class="room-weather-card" aria-label="房间天气">
      <div class="room-weather-head">
        <span id="roomWeatherIcon" class="room-weather-icon" aria-hidden="true">☾</span>
        <div>
          <small>Room Weather</small>
          <strong id="roomWeatherLabel">同步中</strong>
        </div>
      </div>
      <div class="room-weather-meta">
        <span id="roomWeatherTemperature">--°C</span>
        <span id="roomWeatherWind">风速 --</span>
      </div>
      <p id="roomWeatherDetail">正在读取当前时间、季节和天气。</p>
    </aside>

    <div class="panel-controls room-dock" aria-label="&#25151;&#38388;&#24037;&#20855;">
      <button class="panel-toggle-btn" type="button" data-panel-toggle="chatPanel">&#32842;&#22825;</button>
      <button class="panel-toggle-btn" type="button" data-panel-toggle="profilePanel">&#36164;&#26009;</button>
      <button class="panel-toggle-btn" type="button" data-panel-toggle="notePanel">&#20415;&#31614;</button>
      <button class="panel-toggle-btn" type="button" @click="$emit('go', '/room/settings')">&#35774;&#32622;</button>
    </div>

    <section id="chatPanel" class="draggable-panel room-panel room-chat-panel" style="top: 6.4rem; right: 1.2rem;">
      <div class="panel-header">
        <span class="panel-title">&#19982;&#36745;&#22812;&#23020;&#32842;&#22825;</span>
        <button class="panel-close" type="button" data-panel-close="chatPanel" aria-label="&#20851;&#38381;&#32842;&#22825;">x</button>
      </div>
      <div class="panel-content chat-body">
        <div id="chatMessages" class="room-chat-messages"></div>
        <div id="chatImagePreview" class="chat-image-preview" hidden></div>
        <div class="chat-input-row">
          <input id="chatImageInput" type="file" accept="image/*" hidden>
          <button id="attachImageBtn" class="panel-btn chat-attach-btn" type="button" title="上传图片" aria-label="上传图片"><span aria-hidden="true">+</span><span>图片</span></button>
          <input id="chatInput" type="text" placeholder="&#36755;&#20837;&#28040;&#24687;&#65292;Enter &#21457;&#36865;">
          <button id="sendChatBtn" class="panel-btn" type="button">&#21457;&#36865;</button>
        </div>
      </div>
    </section>

    <section id="profilePanel" class="draggable-panel room-panel" style="top: 6.4rem; left: 1.2rem;" hidden>
      <div class="panel-header">
        <span class="panel-title">&#20010;&#20154;&#36164;&#26009;</span>
        <button class="panel-close" type="button" data-panel-close="profilePanel" aria-label="&#20851;&#38381;&#36164;&#26009;">x</button>
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

    <section id="notePanel" class="draggable-panel room-panel" style="top: 18.2rem; left: 1.2rem;" hidden>
      <div class="panel-header">
        <span class="panel-title">&#20415;&#31614;</span>
        <button class="panel-close" type="button" data-panel-close="notePanel" aria-label="&#20851;&#38381;&#20415;&#31614;">x</button>
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
