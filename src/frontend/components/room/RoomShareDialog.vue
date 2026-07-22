<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { authFetch, authHeaders, parseResponse } from '../../api/client';
import SocialShareActions from '../SocialShareActions.vue';
import TsIcon from '../TsIcon.vue';
import { renderRoomShareCard } from '../../services/room/roomShareCard';

const props = defineProps({
  open: { type: Boolean, default: false },
  turn: { type: Object, default: null },
  scene: { type: Object, default: () => ({}) },
  lang: { type: String, default: 'zh' }
});

const emit = defineEmits(['close']);
const title = ref('');
const previewUrl = ref('');
const generatingPreview = ref(false);
const publishing = ref(false);
const error = ref('');
const share = ref(null);
const closeButton = ref(null);
let renderedTitle = '';

const shareUrl = computed(() => share.value?.path ? new URL(share.value.path, location.origin).href : '');
const shareImageUrl = computed(() => share.value?.ogImageUrl ? new URL(share.value.ogImageUrl, location.origin).href : previewUrl.value);
const downloadName = computed(() => `tsukuyomi-room-${props.turn?.turnId || 'memory'}.jpg`);

function defaultTitle() {
  const city = String(props.scene?.city || '').trim();
  return city ? `${city} · 与八千代的一次对话` : '与八千代的一次对话';
}

async function refreshPreview() {
  if (!props.turn) return;
  generatingPreview.value = true;
  error.value = '';
  try {
    previewUrl.value = await renderRoomShareCard({
      title: title.value,
      userMessage: props.turn.userMessage,
      assistantMessage: props.turn.assistantMessage,
      scene: props.scene
    });
    renderedTitle = title.value;
  } catch (err) {
    error.value = err.message || '无法生成分享卡';
  } finally {
    generatingPreview.value = false;
  }
}

async function publishShare() {
  if (!props.turn?.turnId || publishing.value) return;
  publishing.value = true;
  error.value = '';
  let uploadedAssetId = '';
  try {
    if (!previewUrl.value || renderedTitle !== title.value) await refreshPreview();
    if (!previewUrl.value) throw new Error('分享卡尚未生成');

    const assetResponse = await authFetch('/api/assets', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        dataUrl: previewUrl.value,
        fileName: `${downloadName.value}`,
        mimeType: 'image/jpeg',
        alt: title.value,
        storage: 'auto',
        collection: 'share-card'
      })
    });
    const assetResult = await parseResponse(assetResponse);
    if (!assetResponse.ok || !assetResult.success) throw new Error(assetResult.message || '分享卡上传失败');
    uploadedAssetId = assetResult.data?.id || '';

    const response = await authFetch('/api/room/shares', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        turnId: props.turn.turnId,
        title: title.value,
        ogImageAssetId: uploadedAssetId,
        scene: props.scene
      })
    });
    const result = await parseResponse(response);
    if (!response.ok || !result.success) throw new Error(result.message || '分享链接创建失败');
    share.value = result.data;
  } catch (err) {
    if (uploadedAssetId) {
      authFetch(`/api/assets/${encodeURIComponent(uploadedAssetId)}`, {
        method: 'DELETE', headers: authHeaders()
      }).catch(() => {});
    }
    error.value = err.message || '分享失败';
  } finally {
    publishing.value = false;
  }
}

async function revokeShare() {
  if (!share.value?.shareKey || publishing.value) return;
  publishing.value = true;
  error.value = '';
  try {
    const response = await authFetch(`/api/room/shares/${encodeURIComponent(share.value.shareKey)}`, {
      method: 'DELETE', headers: authHeaders()
    });
    const result = await parseResponse(response);
    if (!response.ok || !result.success) throw new Error(result.message || '撤销失败');
    share.value = null;
  } catch (err) {
    error.value = err.message || '撤销失败';
  } finally {
    publishing.value = false;
  }
}

watch(() => props.open, async (open) => {
  if (!open || !props.turn) return;
  const sameTurn = share.value?.turnId === props.turn.turnId;
  if (!sameTurn) {
    share.value = null;
    previewUrl.value = '';
    title.value = defaultTitle();
    await refreshPreview();
  }
  await nextTick();
  closeButton.value?.focus();
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="room-share-overlay" role="presentation" @click.self="emit('close')" @keydown.esc="emit('close')">
      <section class="room-share-dialog" data-material="popover" role="dialog" aria-modal="true" aria-labelledby="room-share-title" :aria-busy="generatingPreview || publishing">
        <header>
          <div>
            <span>ROOM MEMORY</span>
            <h2 id="room-share-title">对话分享卡</h2>
          </div>
          <button ref="closeButton" class="room-share-close" type="button" aria-label="关闭" @click="emit('close')">
            <TsIcon name="x" :size="18" />
          </button>
        </header>

        <label class="room-share-title-field">
          <span>标题</span>
          <input v-model.trim="title" maxlength="80" type="text" :disabled="publishing">
        </label>

        <div class="room-share-preview" :aria-busy="generatingPreview">
          <StatusLoader v-if="generatingPreview" compact label="正在生成分享卡" />
          <img v-else-if="previewUrl" :src="previewUrl" :alt="title">
        </div>

        <div v-if="error" class="room-share-error" role="alert">{{ error }}</div>

        <SocialShareActions
          v-if="share"
          :title="share.title"
          :text="share.assistantMessage"
          :url="shareUrl"
          :image-url="shareImageUrl"
          :download-url="previewUrl"
          :download-name="downloadName"
          :lang="lang"
        />
        <div v-else class="room-share-publish-row">
          <button class="primary-btn" type="button" :disabled="publishing || generatingPreview || !title" @click="publishShare">
            <TsIcon :class="{ 'ts-status-loader-icon': publishing }" :name="publishing ? 'loader' : 'external'" :size="17" />
            <span>{{ publishing ? '正在创建' : '创建公开链接' }}</span>
          </button>
          <button class="ghost-btn" type="button" :disabled="publishing || generatingPreview" @click="refreshPreview">
            <TsIcon name="refresh" :size="17" />
            <span>更新预览</span>
          </button>
        </div>
        <button v-if="share" class="room-share-revoke" type="button" :disabled="publishing" @click="revokeShare">撤销公开链接</button>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.room-share-overlay { position: fixed; inset: 0; z-index: 1700; display: grid; place-items: center; padding: 1rem; background: rgba(4, 10, 22, 0.66); }
.room-share-dialog { width: min(620px, 100%); max-height: calc(100dvh - 2rem); overflow: auto; display: grid; gap: 0.85rem; padding: 1rem; border: 1px solid rgba(218, 239, 255, 0.18); border-radius: 18px; color: var(--ts-text, #eef7ff); background: rgba(20, 30, 54, 0.94); box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38); backdrop-filter: blur(24px) saturate(1.15); }
.room-share-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.room-share-dialog header span { color: rgba(174, 242, 255, 0.7); font-size: 0.7rem; font-weight: 900; }
.room-share-dialog h2 { margin: 0.12rem 0 0; font-size: 1.18rem; }
.room-share-close { width: 40px; height: 40px; display: grid; place-items: center; border: 1px solid rgba(218, 239, 255, 0.16); border-radius: 14px; color: inherit; background: rgba(255, 255, 255, 0.07); cursor: pointer; }
.room-share-title-field { display: grid; gap: 0.35rem; color: rgba(231, 249, 255, 0.72); font-size: 0.78rem; font-weight: 800; }
.room-share-title-field input { width: 100%; min-height: 42px; box-sizing: border-box; border: 1px solid rgba(218, 239, 255, 0.16); border-radius: 12px; padding: 0.68rem 0.78rem; color: #f7fbff; background: rgba(255, 255, 255, 0.07); font: inherit; }
.room-share-preview { min-height: 180px; display: grid; place-items: center; overflow: hidden; border-radius: 12px; background: rgba(0, 0, 0, 0.2); }
.room-share-preview img { display: block; width: 100%; height: auto; }
.room-share-error { padding: 0.7rem; border-radius: 10px; color: #ffdce3; background: rgba(165, 54, 76, 0.18); font-size: 0.84rem; }
.room-share-publish-row { display: flex; flex-wrap: wrap; gap: 0.55rem; }
.room-share-publish-row button { flex: 1 1 180px; }
.room-share-revoke { justify-self: center; border: 0; color: rgba(255, 199, 210, 0.78); background: transparent; cursor: pointer; font: inherit; font-size: 0.78rem; }
@media (max-width: 480px) { .room-share-overlay { align-items: end; padding: 0; } .room-share-dialog { max-height: 90dvh; border-radius: 18px 18px 0 0; padding: 0.9rem; } }
</style>
