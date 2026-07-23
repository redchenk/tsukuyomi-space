<script setup>
import { computed, ref } from 'vue';
import TsIcon from './TsIcon.vue';
import { buildSocialShareLinks, normalizedSharePayload } from '../services/socialShare';
import { recordShareGrowth } from '../services/userGrowth';

const props = defineProps({
  title: { type: String, default: '' },
  text: { type: String, default: '' },
  url: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  downloadUrl: { type: String, default: '' },
  downloadName: { type: String, default: 'tsukuyomi-share.png' },
  lang: { type: String, default: 'zh' }
});

const status = ref('');
const payload = computed(() => normalizedSharePayload(props));
const links = computed(() => buildSocialShareLinks(payload.value));
const canNativeShare = computed(() => typeof navigator !== 'undefined' && typeof navigator.share === 'function');
const labels = computed(() => props.lang === 'en' ? {
  system: 'Share', copy: 'Copy link', copied: 'Link copied', download: 'Download image',
  qqOpening: 'Opening QQ. Share text copied.'
} : props.lang === 'ja' ? {
  system: '共有', copy: 'リンクコピー', copied: 'コピーしました', download: '画像を保存',
  qqOpening: 'QQを開いています。共有内容をコピーしました。'
} : {
  system: '系统分享', copy: '复制链接', copied: '链接已复制', download: '保存图片',
  qqOpening: '正在打开 QQ，分享内容已复制'
});

function openComposer(platform, url) {
  window.open(url, '_blank', 'noopener,noreferrer,width=760,height=680');
  recordShareGrowth(platform).catch(() => {});
}

function legacyCopy(value) {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function shareToQQ() {
  const shareText = [payload.value.title, payload.value.text, payload.value.url].filter(Boolean).join('\n');
  try {
    const write = navigator.clipboard?.writeText?.(shareText);
    write?.catch(() => legacyCopy(shareText));
    if (!write) legacyCopy(shareText);
  } catch (_) {
    legacyCopy(shareText);
  }
  status.value = labels.value.qqOpening;
  window.location.href = links.value.qq;
  recordShareGrowth('qq').catch(() => {});
  window.setTimeout(() => { status.value = ''; }, 2600);
}

async function nativeShare() {
  if (!canNativeShare.value) return;
  try {
    await navigator.share({ title: payload.value.title, text: payload.value.text, url: payload.value.url });
    await recordShareGrowth('native').catch(() => {});
  } catch (error) {
    if (error?.name !== 'AbortError') status.value = error?.message || '';
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(payload.value.url);
  } catch (_) {
    legacyCopy(payload.value.url);
  }
  status.value = labels.value.copied;
  recordShareGrowth('copy').catch(() => {});
  window.setTimeout(() => { status.value = ''; }, 1800);
}
</script>

<template>
  <div class="social-share-actions">
    <button v-if="canNativeShare" class="social-share-button primary" type="button" @click="nativeShare">
      <TsIcon name="send" :size="17" />
      <span>{{ labels.system }}</span>
    </button>
    <button class="social-share-button" type="button" @click="shareToQQ">
      <TsIcon name="message" :size="17" />
      <span>QQ</span>
    </button>
    <button class="social-share-button" type="button" @click="openComposer('qzone', links.qzone)">
      <TsIcon name="sparkles" :size="17" />
      <span>QQ 空间</span>
    </button>
    <button class="social-share-button" type="button" @click="openComposer('weibo', links.weibo)">
      <TsIcon name="send" :size="17" />
      <span>微博</span>
    </button>
    <button class="social-share-button" type="button" @click="openComposer('x', links.x)">
      <TsIcon name="external" :size="17" />
      <span>X</span>
    </button>
    <button class="social-share-button" type="button" @click="openComposer('telegram', links.telegram)">
      <TsIcon name="send" :size="17" />
      <span>Telegram</span>
    </button>
    <button class="social-share-button" type="button" @click="copyLink">
      <TsIcon name="copy" :size="17" />
      <span>{{ labels.copy }}</span>
    </button>
    <a v-if="downloadUrl" class="social-share-button" :href="downloadUrl" :download="downloadName">
      <TsIcon name="download" :size="17" />
      <span>{{ labels.download }}</span>
    </a>
    <span class="social-share-status" role="status" aria-live="polite">{{ status }}</span>
  </div>
</template>

<style scoped>
.social-share-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
}

.social-share-button {
  min-width: 0;
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.42rem;
  padding: 0.62rem 0.8rem;
  border: 1px solid rgba(218, 239, 255, 0.18);
  border-radius: 14px;
  color: var(--ts-text, #eef7ff);
  background: rgba(255, 255, 255, 0.08);
  text-decoration: none;
  font: inherit;
  font-size: 0.86rem;
  font-weight: 800;
  cursor: pointer;
}

.social-share-button:hover,
.social-share-button:focus-visible {
  border-color: rgba(174, 242, 255, 0.42);
  background: rgba(174, 242, 255, 0.14);
}

.social-share-button.primary {
  color: #fff;
  border-color: rgba(148, 197, 255, 0.45);
  background: rgba(91, 121, 214, 0.72);
}

.social-share-button span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.social-share-status {
  min-height: 1.2rem;
  grid-column: 1 / -1;
  color: rgba(231, 249, 255, 0.72);
  text-align: center;
  font-size: 0.78rem;
}

@media (min-width: 560px) {
  .social-share-actions { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
</style>
