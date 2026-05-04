<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue';

const props = defineProps({
  routeName: { type: String, default: 'room' },
  theme: { type: String, default: 'light' },
  t: { type: Object, required: true },
  user: { type: Object, default: null }
});

defineEmits(['go', 'logout', 'toggle-theme']);

const scripts = [
  '/lib/live2dcubismcore-v5.min.js',
  '/lib/bundled/live2d-room.iife.js?v=20260503-memory1',
  '/assets/js/room-runtime.js?v=20260503-memory1'
];

const roomUserName = computed(() => props.user?.username || props.user?.email || 'Guest');
const roomUserId = computed(() => props.user?.id || props.user?.username || props.user?.email || '');
const roomUserAvatar = computed(() => props.user?.avatar || '');
const roomUserInitial = computed(() => roomUserName.value.slice(0, 1).toUpperCase());
const isAuthed = computed(() => Boolean(props.user));

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

onMounted(async () => {
  document.body.classList.add('vue-room-route');
  window.TSUKUYOMI_EXTERNAL_LIVE2D = true;
  window.TSUKUYOMI_LIVE2D_READY = false;
  window.destroyTsukuyomiLive2DRoom?.();

  const container = document.getElementById('live2d-container');
  container?.querySelectorAll('canvas:not(#live2d-canvas)').forEach((node) => node.remove());

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

    <nav class="room-commandbar site-commandbar" aria-label="房间导航">
      <a class="room-brand" href="/hub" @click.prevent="$emit('go', '/hub')">
        <span class="room-brand-mark room-user-avatar">
          <img v-if="roomUserAvatar" :src="roomUserAvatar" :alt="roomUserName">
          <span v-else>{{ roomUserInitial }}</span>
        </span>
        <span>
          <strong>{{ roomUserName }}</strong>
          <small>Tsukimi Yachiyo Room</small>
        </span>
      </a>
      <div class="room-nav-links site-nav-links">
        <a href="/hub" :class="{ 'router-link-active': routeName === 'hub' }" @click.prevent="$emit('go', '/hub')">{{ t.hub }}</a>
        <a href="/room" :class="{ 'router-link-active': routeName === 'room' }" @click.prevent="$emit('go', '/room')">{{ t.room }}</a>
        <a href="/stage" :class="{ 'router-link-active': routeName === 'stage' }" @click.prevent="$emit('go', '/stage')">{{ t.stage }}</a>
        <a href="/plaza" :class="{ 'router-link-active': routeName === 'plaza' }" @click.prevent="$emit('go', '/plaza')">{{ t.plaza }}</a>
        <a href="/reality" :class="{ 'router-link-active': routeName === 'reality' }" @click.prevent="$emit('go', '/reality')">{{ t.reality }}</a>
        <a v-if="isAuthed" href="/user-center" :class="{ 'router-link-active': routeName === 'userCenter' }" @click.prevent="$emit('go', '/user-center')">{{ t.ucTitle }}</a>
        <a v-if="!isAuthed" href="/login" :class="{ 'router-link-active': routeName === 'login' }" @click.prevent="$emit('go', '/login')">{{ t.login }}</a>
        <a v-if="!isAuthed" href="/register" :class="{ 'router-link-active': routeName === 'register' }" @click.prevent="$emit('go', '/register')">{{ t.register }}</a>
        <button v-if="isAuthed" class="room-nav-button" type="button" @click="$emit('logout')">{{ t.logout }}</button>
        <button
          class="room-theme-toggle room-nav-button"
          type="button"
          :aria-label="theme === 'dark' ? '切换浅色主题' : '切换深色主题'"
          :title="theme === 'dark' ? '浅色主题' : '深色主题'"
          @click="$emit('toggle-theme')"
        >
          <span aria-hidden="true">{{ theme === 'dark' ? '☀' : '☾' }}</span>
          <span>{{ theme === 'dark' ? 'Light' : 'Dark' }}</span>
        </button>
      </div>
    </nav>

    <section class="room-stage" aria-label="Live2D &#33310;&#21488;">
      <div class="room-stage-copy">
        <p>Live2D Room</p>
        <h1>&#20843;&#21315;&#20195;&#36745;&#22812;&#23020;&#27491;&#22312;&#25151;&#38388;&#37324;&#31561;&#20320;</h1>
      </div>
      <div id="live2d-container" class="room-live2d-container"></div>
    </section>

    <div class="panel-controls room-dock" aria-label="&#25151;&#38388;&#24037;&#20855;">
      <button class="panel-toggle-btn" type="button" data-panel-toggle="chatPanel">&#32842;&#22825;</button>
      <button class="panel-toggle-btn" type="button" data-panel-toggle="profilePanel">&#36164;&#26009;</button>
      <button class="panel-toggle-btn" type="button" data-panel-toggle="notePanel">&#20415;&#31614;</button>
      <button class="panel-toggle-btn" type="button" data-panel-toggle="settingPanel">&#35774;&#32622;</button>
    </div>

    <section id="chatPanel" class="draggable-panel room-panel room-chat-panel" style="top: 6.4rem; right: 1.2rem;">
      <div class="panel-header">
        <span class="panel-title">&#19982;&#36745;&#22812;&#23020;&#32842;&#22825;</span>
        <button class="panel-close" type="button" data-panel-close="chatPanel" aria-label="&#20851;&#38381;&#32842;&#22825;">x</button>
      </div>
      <div class="panel-content chat-body">
        <div id="chatMessages" class="room-chat-messages"></div>
        <div class="chat-input-row">
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

    <section id="settingPanel" class="draggable-panel room-panel room-settings-panel" style="top: 6.4rem; left: 1.2rem;" hidden>
      <div class="panel-header">
        <span class="panel-title">&#25151;&#38388;&#35774;&#32622;</span>
        <button class="panel-close" type="button" data-panel-close="settingPanel" aria-label="&#20851;&#38381;&#35774;&#32622;">x</button>
      </div>
      <div class="panel-content scrollable">
        <div class="field">
          <div class="split"><label for="modelScaleInput">&#27169;&#22411;&#22823;&#23567;</label><span id="modelScaleValue">100%</span></div>
          <input id="modelScaleInput" type="range" min="60" max="160" value="100">
        </div>
        <div class="field">
          <div class="split"><label for="modelXInput">&#27700;&#24179;&#20301;&#32622;</label><span id="modelXValue">0</span></div>
          <input id="modelXInput" type="range" min="-240" max="240" value="0">
        </div>
        <div class="field">
          <div class="split"><label for="modelYInput">&#22402;&#30452;&#20301;&#32622;</label><span id="modelYValue">0</span></div>
          <input id="modelYInput" type="range" min="-180" max="180" value="0">
        </div>
        <div class="button-row">
          <button id="resetModelBtn" class="panel-btn" type="button">&#37325;&#32622;&#27169;&#22411;</button>
          <button id="resetPanelsBtn" class="panel-btn" type="button">&#37325;&#32622;&#38754;&#26495;</button>
        </div>

        <div class="panel-section">
          <div class="panel-section-title">TTS &#35821;&#38899;&#35774;&#32622;</div>
          <div class="field room-check">
            <label><input id="ttsEnabled" type="checkbox"> &#21551;&#29992;&#35821;&#38899;&#21512;&#25104;</label>
          </div>
          <div class="field">
            <label for="ttsProvider">TTS Provider</label>
            <select id="ttsProvider">
              <option value="mimo">MiMo-V2.5-TTS</option>
              <option value="openai">OpenAI TTS</option>
            </select>
          </div>
          <div class="field">
            <label for="ttsApiUrl">TTS API &#31471;&#28857;</label>
            <input id="ttsApiUrl" type="text" placeholder="https://api.xiaomimimo.com/v1/chat/completions">
          </div>
          <div class="field">
            <label for="ttsApiKey">TTS API Key</label>
            <input id="ttsApiKey" type="password" placeholder="sk-...">
          </div>
          <div class="field">
            <label for="ttsVoice">&#38899;&#33394;</label>
            <input id="ttsVoice" type="text" placeholder="mimo_default">
          </div>
          <div class="button-row">
            <button id="saveTTSBtn" class="panel-btn" type="button">&#20445;&#23384; TTS</button>
            <button id="testTTSBtn" class="panel-btn" type="button">&#27979;&#35797;&#35821;&#38899;</button>
          </div>
        </div>

        <div class="panel-section">
          <div class="panel-section-title">LLM API &#35774;&#32622;</div>
          <div class="field">
            <label>&#24555;&#25463;&#39044;&#35774;</label>
            <div class="button-row">
              <button class="panel-btn" type="button" data-llm-preset="deepseek">DeepSeek</button>
              <button class="panel-btn" type="button" data-llm-preset="moonshot">Kimi</button>
              <button class="panel-btn" type="button" data-llm-preset="openai">OpenAI</button>
              <button class="panel-btn" type="button" data-llm-preset="aliyun">&#36890;&#20041;</button>
            </div>
          </div>
          <div class="field">
            <label for="llmApiUrl">API &#31471;&#28857;</label>
            <input id="llmApiUrl" type="text" placeholder="https://api.openai.com/v1/chat/completions">
          </div>
          <div class="field">
            <label for="llmApiKey">API Key</label>
            <input id="llmApiKey" type="password" placeholder="sk-...">
          </div>
          <div class="field">
            <label for="llmModel">&#27169;&#22411;&#21517;&#31216;</label>
            <input id="llmModel" type="text" placeholder="gpt-4o-mini">
          </div>
          <div class="button-row">
            <button id="saveLLMBtn" class="panel-btn" type="button">&#20445;&#23384; API</button>
            <button id="testLLMBtn" class="panel-btn" type="button">&#27979;&#35797;&#36830;&#25509;</button>
          </div>
        </div>

        <div class="panel-section">
          <div class="panel-section-title">&#38271;&#26399;&#35760;&#24518;&#22806;&#25346;</div>
          <div class="field room-check">
            <label><input id="memoryEnabled" type="checkbox"> &#21551;&#29992;&#26412;&#22320;&#35760;&#24518;&#32593;&#32476;</label>
          </div>
          <p class="field-hint">&#35760;&#24518;&#20445;&#23384;&#22312;&#26412;&#26426; IndexedDB&#65292;&#25353;&#29992;&#25143;&#21333;&#29420;&#20998;&#26742;&#65292;&#19981;&#19978;&#20256;&#21040;&#26381;&#21153;&#22120;&#12290;</p>
          <div id="memoryStatus" class="field-hint"></div>
          <div class="button-row">
            <button id="clearMemoryBtn" class="panel-btn" type="button">&#28165;&#31354;&#26412;&#29992;&#25143;&#35760;&#24518;</button>
          </div>
        </div>
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
