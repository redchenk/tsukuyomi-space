<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import TsIcon from './TsIcon.vue';
import { buildSocialShareLinks, normalizedSharePayload } from '../services/socialShare';
import { recordShareGrowth } from '../services/userGrowth';
import { buildQQAppLink, buildQQBridgePayload, buildQQSystemPayload, launchQQApp, loadQQShareSdk, qqShareEnvironment, qqShareResult } from '../services/qqShare';

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
let cancelQQLaunch;
let qqAttempt = 0;
let disposed = false;
const qqLoading = ref(false);
const qqEnvironment = qqShareEnvironment(typeof navigator === 'undefined' ? {} : navigator);
const payload = computed(() => normalizedSharePayload(props));
const links = computed(() => buildSocialShareLinks(payload.value));
const qqAppLink = computed(() => buildQQAppLink(payload.value));
const canNativeShare = computed(() => typeof navigator !== 'undefined' && typeof navigator.share === 'function');
const qqSystemShare = computed(() => qqEnvironment.ios && !qqEnvironment.insideQQ && canNativeShare.value);
const labels = computed(() => props.lang === 'en' ? {
  system: 'Share', copy: 'Copy link', copied: 'Link copied', download: 'Download image',
  copyText: 'Copy share text', textCopied: 'Title and link copied. Paste into QQ and send.',
  copyFailed: 'Could not copy. Select and copy the link below.', link: 'Share link',
  qqHint: qqSystemShare.value ? 'On iPhone or iPad, choose QQ in the share sheet, then choose a friend and send the article card.' : qqEnvironment.mobile ? 'Tap QQ to open the recipient picker, choose a friend and send the article card.' : 'Scan the code on the QQ share page with mobile QQ, then choose a recipient and send.',
  qqSystemOpening: 'Choose QQ in the share sheet, then choose a friend and send.',
  qqOpening: 'Use mobile QQ to scan the code on the opened page, then choose a recipient and send.',
  qqAppOpening: 'Opening QQ. Choose a friend and tap Send.',
  qqUnavailable: canNativeShare.value ? 'If QQ did not open, tap Share and choose QQ, or open this page in QQ and try again.' : 'If QQ did not open, check that QQ is installed, then open this page in QQ and try again.',
  qqFailed: 'QQ could not complete sharing. Please try again.',
  qqConfirmed: 'QQ confirmed the share action.',
  nativeOpened: 'Confirm the recipient and send in the app you chose.', composerOpened: 'Choose a recipient and confirm sending on the share page.'
} : props.lang === 'ja' ? {
  system: '共有', copy: 'リンクコピー', copied: 'コピーしました', download: '画像を保存',
  copyText: '共有テキストをコピー', textCopied: 'タイトルとリンクをコピーしました。QQに貼り付けて送信してください。',
  copyFailed: 'コピーできませんでした。下のリンクを選択してコピーしてください。', link: '共有リンク',
  qqHint: qqSystemShare.value ? 'iPhone・iPadでは共有メニューでQQを選び、相手を選んで記事のカードを送信してください。' : qqEnvironment.mobile ? 'QQをタップして相手を選び、記事のカードを送信してください。' : 'スマホのQQで共有ページのQRコードを読み取り、相手を選んで送信してください。',
  qqSystemOpening: '共有メニューでQQを選び、相手を選んで送信してください。',
  qqOpening: '開いたページのQRコードをスマホのQQで読み取り、相手を選んで送信してください。',
  qqAppOpening: 'QQを開いています。相手を選び、送信してください。',
  qqUnavailable: canNativeShare.value ? 'QQが開かない場合は「共有」でQQを選ぶか、QQ内でこのページを開いて再試行してください。' : 'QQがインストールされていることを確認し、QQ内でこのページを開いて再試行してください。',
  qqFailed: 'QQで共有できませんでした。再試行してください。',
  qqConfirmed: 'QQが共有操作を確認しました。',
  nativeOpened: '選んだアプリで相手を確認して送信してください。', composerOpened: '共有ページで相手を選び、送信してください。'
} : {
  system: '系统分享', copy: '复制链接', copied: '链接已复制', download: '保存图片',
  copyText: '复制分享内容', textCopied: '标题和链接已复制，请粘贴到 QQ 聊天后发送。',
  copyFailed: '复制未成功，请选中下方链接手动复制。', link: '分享链接',
  qqHint: qqSystemShare.value ? 'iPhone、iPad 会打开系统分享面板，请选择 QQ，再选择好友发送文章卡片。' : qqEnvironment.mobile ? '点击 QQ 打开好友选择页，选好友后点发送，即可分享文章卡片。' : '用手机 QQ 扫描分享页的二维码，再选择好友发送。',
  qqSystemOpening: '请在系统分享面板选择 QQ，再选择好友发送。',
  qqOpening: '请用手机 QQ 扫描打开页面的二维码，再选择好友发送。',
  qqAppOpening: '正在打开 QQ，请选择好友并点击发送。',
  qqUnavailable: canNativeShare.value ? '若 QQ 没有打开，可点「系统分享」选择 QQ，或在 QQ 内打开本页后重试。' : '若 QQ 没有打开，请确认已安装 QQ，并在 QQ 内打开本页后重试。',
  qqFailed: 'QQ 未完成分享，请稍后重试。',
  qqConfirmed: 'QQ 已确认分享操作。',
  nativeOpened: '请在所选应用中确认收件人并发送。', composerOpened: '请在分享页选择收件人并确认发送。'
});

function showStatus(value, timeout = 0) {
  window.clearTimeout(statusTimer);
  status.value = value;
  if (timeout) statusTimer = window.setTimeout(() => { status.value = ''; }, timeout);
}

onMounted(() => {
  if (qqEnvironment.insideQQ) loadQQShareSdk().catch(() => {});
});

onBeforeUnmount(() => {
  disposed = true;
  window.clearTimeout(statusTimer);
  cancelQQLaunch?.();
});

function openComposer(platform, url) {
  cancelQQLaunch?.();
  qqAttempt++;
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

async function shareToQQ() {
  if (qqLoading.value) return;
  if (!payload.value.url) return showStatus(labels.value.qqFailed);
  cancelQQLaunch?.();
  const attempt = ++qqAttempt;
  if (!qqEnvironment.mobile) return openComposer('qq', links.value.qq);
  if (qqSystemShare.value) return nativeShare('qq');
  showStatus(labels.value.qqAppOpening);
  if (qqEnvironment.insideQQ) {
    qqLoading.value = true;
    try {
      const sdk = await loadQQShareSdk();
      if (disposed || attempt !== qqAttempt) return;
      let completed = false;
      sdk.ui.shareMessage(buildQQBridgePayload(payload.value), result => {
        if (disposed || completed || attempt !== qqAttempt) return;
        completed = true;
        const outcome = qqShareResult(result);
        if (outcome === 'confirmed') {
          showStatus(labels.value.qqConfirmed);
          recordShareGrowth('qq').catch(() => {});
        } else showStatus(outcome === 'cancelled' ? '' : labels.value.qqFailed);
      });
    } catch (_) {
      if (!disposed && attempt === qqAttempt) showStatus(labels.value.qqFailed);
    } finally {
      if (!disposed) qqLoading.value = false;
    }
    return;
  }
  cancelQQLaunch = launchQQApp(qqAppLink.value, () => {
    if (!disposed && attempt === qqAttempt) showStatus(labels.value.qqUnavailable);
  });
}

async function nativeShare(platform = 'native') {
  if (!canNativeShare.value) return;
  cancelQQLaunch?.();
  qqAttempt++;
  showStatus(platform === 'qq' ? labels.value.qqSystemOpening : '');
  try {
    await navigator.share(platform === 'qq' ? buildQQSystemPayload(payload.value) : { title: payload.value.title, text: payload.value.text, url: payload.value.url });
    showStatus(labels.value.nativeOpened);
    await recordShareGrowth(platform).catch(() => {});
  } catch (error) {
    if (error?.name === 'AbortError') showStatus('');
    else showStatus(platform === 'qq' ? labels.value.qqFailed : error?.message || '');
  }
}

async function copyValue(value, copiedLabel, platform = 'copy') {
  cancelQQLaunch?.();
  qqAttempt++;
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
    <button v-if="canNativeShare" class="social-share-button primary" type="button" @click="nativeShare()">
      <TsIcon name="send" :size="17" />
      <span>{{ labels.system }}</span>
    </button>
    <a v-if="qqEnvironment.mobile && !qqEnvironment.insideQQ && !qqSystemShare" class="social-share-button" :href="qqAppLink" role="button" @click.prevent="shareToQQ" @keydown.space.prevent="shareToQQ">
      <TsIcon name="message" :size="17" />
      <span>QQ</span>
    </a>
    <button v-else class="social-share-button" type="button" :disabled="qqLoading" @click="shareToQQ">
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
