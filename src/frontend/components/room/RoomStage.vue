<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import TsIcon from '../TsIcon.vue';
import { BUILT_IN_CHARACTER_NAME } from '../../composables/room/useRoomChat';
import { dispatchRoomLive2D } from '../../services/room/live2dControl';

const props = defineProps({
  live2d: { type: Object, required: true },
  characterName: { type: String, default: '' },
  music: { type: Object, required: true },
  weather: { type: Object, default: () => ({}) }
});
const emit = defineEmits(['settings']);
const stage = ref(null);
const openMenu = ref('');
const feedback = ref('');
const fullscreen = ref(false);
const capturing = ref(false);
let feedbackTimer;
let cancelCapture;

// Falls back to the built-in full name so the stage always greets someone.
const stageName = computed(() => String(props.characterName || '').trim() || BUILT_IN_CHARACTER_NAME);
const displayName = computed(() => stageName.value === BUILT_IN_CHARACTER_NAME ? '八千代' : stageName.value);
const expressions = [{ id: 'smile', label: '微笑' }, { id: 'shy', label: '害羞' }, { id: 'surprised', label: '惊讶' }, { id: 'neutral', label: '自然' }];
const motions = [{ id: 'nod', label: '点点头' }, { id: 'sway', label: '轻轻摇摆' }, { id: 'lean_in', label: '靠近一点' }];
function notify(message) {
  feedback.value = message;
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => { feedback.value = ''; }, 3200);
}
function act(kind, item) {
  dispatchRoomLive2D({ [kind]: item.id, durationMs: 2400, intensity: 0.65 });
  openMenu.value = '';
  notify(item.label);
}
function closeMenus(event) {
  if (event.type === 'keydown' ? event.key === 'Escape' : !event.target.closest?.('.room-stage-menu-anchor')) openMenu.value = '';
}
function updateFullscreen() { fullscreen.value = document.fullscreenElement === stage.value; }
async function toggleFullscreen() {
  try {
    if (fullscreen.value) await document.exitFullscreen();
    else if (stage.value?.requestFullscreen) await stage.value.requestFullscreen();
    else notify('当前浏览器暂不支持全屏。');
  } catch (_) { notify('暂时无法进入全屏，请稍后再试。'); }
}
async function openMusic() {
  if (fullscreen.value) await toggleFullscreen();
  props.music.toggleShell();
}
async function captureCharacter() {
  const canvas = stage.value?.querySelector('canvas');
  const bridge = window.TSUKUYOMI_LOCAL_CUBISM_BRIDGE;
  if (!canvas || !bridge?.subscribeBeforeRender || capturing.value) return notify('角色仍在准备，请稍后再试。');
  capturing.value = true;
  // Copy immediately after a real render, before WebGL discards its drawing buffer.
  // This uses the existing bridge; no model or runtime asset needs rebuilding.
  let unsubscribe;
  let timer;
  const cleanup = () => { unsubscribe?.(); clearTimeout(timer); capturing.value = false; cancelCapture = null; };
  cancelCapture = cleanup;
  timer = setTimeout(() => { cleanup(); notify('截图未完成，请保持页面可见后重试。'); }, 2500);
  unsubscribe = bridge.subscribeBeforeRender(() => {
    unsubscribe?.();
    queueMicrotask(() => {
      if (!capturing.value) return;
      try {
        canvas.toBlob((blob) => {
          if (!capturing.value) return;
          cleanup();
          if (!blob) return notify('截图未完成，请重试。');
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'yachiyo-room.png';
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          notify('角色截图已保存');
        }, 'image/png');
      } catch (_) { cleanup(); notify('浏览器无法保存截图。'); }
    });
  });
}
onMounted(() => {
  document.addEventListener('pointerdown', closeMenus);
  document.addEventListener('keydown', closeMenus);
  document.addEventListener('fullscreenchange', updateFullscreen);
});
onBeforeUnmount(() => {
  clearTimeout(feedbackTimer);
  cancelCapture?.();
  document.removeEventListener('pointerdown', closeMenus);
  document.removeEventListener('keydown', closeMenus);
  document.removeEventListener('fullscreenchange', updateFullscreen);
});
</script>

<template>
  <section ref="stage" class="room-stage" aria-label="Live2D stage">
    <div class="room-stage-copy">
      <p>Live2D Room</p>
      <h1><span class="room-stage-mobile-title">{{ stageName }}正在房间里等你</span><span class="room-stage-desktop-title">{{ displayName }}的房间</span></h1>
      <span class="room-stage-subtitle">和{{ displayName }}一起，把时间慢下来。</span>
    </div>
    <div id="live2d-container" class="room-live2d-container"></div>
    <div class="room-stage-desktop-ui">
      <div class="room-stage-scene room-stage-menu-anchor">
        <button type="button" class="room-scene-trigger" :aria-expanded="openMenu === 'scene'" @click="openMenu = openMenu === 'scene' ? '' : 'scene'"><TsIcon name="moon" :size="17" /><span>月夜小屋</span><TsIcon name="chevronDown" :size="12" /></button>
        <span class="room-mobile-presence">{{ live2d.ready.value ? '在这里，陪着你' : live2d.error.value ? '角色暂未连接' : '正在准备与你见面…' }}</span>
        <div v-if="openMenu === 'scene'" class="room-stage-popover room-scene-info"><strong>窗外的此刻</strong><p>{{ weather.city }} · {{ weather.temperature }} {{ weather.label }}</p><small>{{ weather.detail }}</small><button type="button" @click="openMenu = ''; emit('settings')">房间与角色设置 <TsIcon name="arrowRight" :size="14" /></button></div>
      </div>
      <div class="room-stage-greeting" aria-hidden="true"><span><TsIcon name="sparkles" :size="16" /></span><p>你来啦。刚好，<br>给自己留一点放空的时间。</p></div>
      <div class="room-stage-signature"><span>YACHIYO</span><strong>{{ displayName }}</strong><p><i :class="{ ready: live2d.ready.value }"></i>{{ live2d.ready.value ? '正在听你说' : '等待与你见面' }}</p></div>
      <span class="room-stage-caption" aria-hidden="true">此刻，在月读相遇。</span>
      <div v-if="feedback" class="room-stage-feedback" role="status">{{ feedback }}</div>
      <div class="room-stage-toolbar" aria-label="角色与音乐控制">
        <div class="room-stage-music">
          <button type="button" class="room-stage-track" aria-label="打开房间音乐列表" :aria-expanded="music.drawer.open" @click="openMusic"><TsIcon name="audioLines" :size="21" /><span><strong>房间音乐</strong><small>{{ music.currentTrack.value?.title || '选择一首喜欢的歌' }}</small></span></button>
          <button type="button" class="room-music-switch" role="switch" :aria-checked="music.playing.value" aria-label="播放房间音乐" @click="music.togglePlay"><span></span></button>
        </div>
        <div class="room-stage-actions">
          <div class="room-stage-menu-anchor"><button type="button" :disabled="!live2d.ready.value" aria-label="表情" :aria-expanded="openMenu === 'expression'" @click="openMenu = openMenu === 'expression' ? '' : 'expression'"><TsIcon name="heart" :size="18" /><span>表情</span></button><div v-if="openMenu === 'expression'" class="room-stage-popover"><button v-for="item in expressions" :key="item.id" type="button" @click="act('expression', item)">{{ item.label }}</button></div></div>
          <div class="room-stage-menu-anchor"><button type="button" :disabled="!live2d.ready.value" aria-label="动作" :aria-expanded="openMenu === 'motion'" @click="openMenu = openMenu === 'motion' ? '' : 'motion'"><TsIcon name="sparkles" :size="18" /><span>动作</span></button><div v-if="openMenu === 'motion'" class="room-stage-popover"><button v-for="item in motions" :key="item.id" type="button" @click="act('bodyPose', item)">{{ item.label }}</button></div></div>
        </div>
        <div class="room-stage-view-tools"><button type="button" :disabled="!live2d.ready.value || capturing" aria-label="保存角色截图" title="保存角色截图" @click="captureCharacter"><TsIcon name="image" :size="19" /></button><button type="button" :aria-label="fullscreen ? '退出全屏' : '全屏角色舞台'" :aria-pressed="fullscreen" @click="toggleFullscreen"><TsIcon name="maximize" :size="19" /></button></div>
        <button type="button" class="room-stage-voice" aria-label="语音设置" @click="emit('settings')"><TsIcon name="volume" :size="18" /><span>语音设置</span></button>
      </div>
    </div>
    <div v-if="live2d.error.value" class="room-stage-error">{{ live2d.error.value }}</div>
  </section>
</template>
