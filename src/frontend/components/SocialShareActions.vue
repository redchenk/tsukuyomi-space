<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
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
let statusTimer;
const payload = computed(() => normalizedSharePayload(props));
const links = computed(() => buildSocialShareLinks(payload.value));
const canNativeShare = computed(() => typeof navigator !== 'undefined' && typeof navigator.share === 'function');
const labels = computed(() => props.lang === 'en' ? {
  system: 'Share', copy: 'Copy link', copied: 'Link copied', download: 'Download image',
  copyText: 'Copy share text', textCopied: 'Title and link copied. Paste into QQ and send.',
  copyFailed: 'Could not copy. Select and copy the link below.', link: 'Share link',
  qqHint: 'For QQ, scan the code on the QQ share page with mobile QQ, then choose a recipient and send. You can also paste the share text into a QQ chat.',
  qqOpening: 'Use mobile QQ to scan the code on the opened page, then choose a recipient and send.',
  nativeOpened: 'Confirm the recipient and send in the app you chose.', composerOpened: 'Choose a recipient and confirm sending on the share page.'
} : props.lang === 'ja' ? {
  system: '共有', copy: 'リンクコピー', copied: 'コピーしました', download: '画像を保存',
  copyText: '共有テキストをコピー', textCopied: 'タイトルとリンクをコピーしました。QQに貼り付けて送信してください。',
  copyFailed: 'コピーできませんでした。下のリンクを選択してコピーしてください。', link: '共有リンク',
  qqHint: 'スマホのQQで共有ページのQRコードを読み取り、相手を選んで送信してください。共有テキストをQQに貼り付けて送信することもできます。',
  qqOpening: '開いたページのQRコードをスマホのQQで読み取り、相手を選んで送信してください。',
  nativeOpened: '選んだアプリで相手を確認して送信してください。', composerOpened: '共有ページで相手を選び、送信してください。'
} : {
  system: '系统分享', copy: '复制链接', copied: '链接已复制', download: '保存图片',
  copyText: '复制分享内容', textCopied: '标题和链接已复制，请粘贴到 QQ 聊天后发送。',
  copyFailed: '复制未成功，请选中下方链接手动复制。', link: '分享链接',
  qqHint: 'QQ 分享：用手机 QQ 扫描分享页的二维码，再选择好友发送；也可以复制分享内容，粘贴到 QQ 聊天后发送。',
  qqOpening: '请用手机 QQ 扫描打开页面的二维码，再选择好友发送。',
  nativeOpened: '请在所选应用中确认收件人并发送。', composerOpened: '请在分享页选择收件人并确认发送。'
});

function showStatus(value, timeout = 0) {
  window.clearTimeout(statusTimer);
  status.value = value;
  if (timeout) statusTimer = window.setTimeout(() => { status.value = ''; }, timeout);
}

onBeforeUnmount(() => window.clearTimeout(statusTimer));

function openComposer(platform, url) {
  showStatus(platform === 'qq' ? labels.value.qqOpening : labels.value.composerOpened);
  window.open(url, '_blank', 'noopener,noreferrer,width=760,height=680');
}

function legacyCopy(value) {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  const previousFocus = document.activeElement;
  try {
    textarea.select();
    if (!document.execCommand('copy')) throw new Error('Copy failed');
  } finally {
    textarea.remove();
    previousFocus?.focus({ preventScroll: true });
  }
}

function shareToQQ() {
  openComposer('qq', links.value.qq);
}

async function nativeShare() {
  if (!canNativeShare.value) return;
  showStatus('');
  try {
    await navigator.share({ title: payload.value.title, text: payload.value.text, url: payload.value.url });
    showStatus(labels.value.nativeOpened);
    await recordShareGrowth('native').catch(() => {});
  } catch (error) {
    if (error?.name !== 'AbortError') showStatus(error?.message || '');
  }
}

async function copyValue(value, copiedLabel, platform = 'copy') {
  try {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
    } catch (_) {
      legacyCopy(value);
    }
    showStatus(copiedLabel, 5000);
    recordShareGrowth(platform).catch(() => {});
  } catch (_) {
    showStatus(labels.value.copyFailed);
  }
}

function copyLink() {
  return copyValue(payload.value.url, labels.value.copied);
}

function copyShareText() {
  return copyValue([payload.value.title, payload.value.url].filter(Boolean).join('\n'), labels.value.textCopied);
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
    <button class="social-share-button" type="button" @click="copyShareText">
      <TsIcon name="copy" :size="17" />
      <span>{{ labels.copyText }}</span>
    </button>
    <a v-if="downloadUrl" class="social-share-button" :href="downloadUrl" :download="downloadName">
      <TsIcon name="download" :size="17" />
      <span>{{ labels.download }}</span>
    </a>
    <span class="social-share-status" role="status" aria-live="polite">{{ status }}</span>
    <label class="social-share-link">
      <span>{{ labels.link }}</span>
      <input :value="payload.url" readonly type="text" @focus="$event.target.select()">
    </label>
    <p class="social-share-hint">{{ labels.qqHint }}</p>
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
  border-radius: var(--ts-radius-button, 999px);
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
  color: var(--ts-muted, #b8c7dc);
  text-align: center;
  font-size: 0.78rem;
}

.social-share-link, .social-share-hint { grid-column: 1 / -1; }
.social-share-link { display: grid; gap: 0.35rem; font-size: 0.78rem; }
.social-share-link input { width: 100%; min-width: 0; box-sizing: border-box; padding: 0.6rem 0.75rem; border: 1px solid rgba(218, 239, 255, 0.24); border-radius: 9px; color: inherit; background: rgba(255, 255, 255, 0.06); font: inherit; }
.social-share-hint { margin: 0; color: var(--ts-muted, #b8c7dc); font-size: 0.78rem; line-height: 1.6; }

@media (min-width: 560px) {
  .social-share-actions { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
</style>
