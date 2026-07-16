<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { apiUrl, authFetch, authHeaders, getSession, noStoreUrl, parseResponse } from '../api/client';
import { compressImage } from '../utils/image';
import { renderMarkdown } from '../utils/markdown';

const props = defineProps({
  t: { type: Object, required: true }
});

const emit = defineEmits(['go']);
const route = useRoute();
const editorCoverInput = ref(null);
const editorContentInput = ref(null);
const editorAssetUploadInput = ref(null);
const session = ref(getSession());
const uploadAccept = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/flac,audio/wav,audio/ogg,audio/mp4,application/pdf,text/plain,text/markdown';

const categories = [
  { value: '\u516c\u544a', labelKey: 'editorCatAnnouncement' },
  { value: '\u4f20\u8bf4', labelKey: 'editorCatLegend' },
  { value: '\u6280\u672f', labelKey: 'editorCatTechnology' },
  { value: '\u4e8c\u521b', labelKey: 'editorCatFanwork' },
  { value: '\u5176\u4ed6', labelKey: 'editorCatOther' }
];

const editor = reactive({
  coverImageBase64: null,
  coverImageAssetId: null,
  coverImageSize: 0,
  currentArticle: null,
  message: '',
  messageType: 'error',
  loadError: '',
  submitting: false,
  loading: true,
  assetPicker: {
    open: false,
    loading: false,
    uploading: false,
    uploadProgress: 0,
    uploadPhase: '',
    mode: 'body',
    assets: [],
    search: '',
    message: '',
    loadError: ''
  },
  form: {
    title: '',
    category: '',
    readTime: '5 min',
    excerpt: '',
    content: ''
  }
});

const isAuthed = computed(() => Boolean(session.value));
const canPublishAnnouncement = computed(() => session.value?.admin || ['admin', 'super_admin'].includes(session.value?.user?.role));
const availableCategories = computed(() => categories.filter((category) => canPublishAnnouncement.value || category.value !== '\u516c\u544a'));
const currentArticleId = computed(() => route.query.id || '');
const submitLabel = computed(() => {
  if (editor.submitting) return editor.currentArticle ? props.t.editorSaving : props.t.editorPublishing;
  return editor.currentArticle ? props.t.editorUpdate : props.t.editorSubmit;
});
const contentPreview = computed(() => renderMarkdown(serializeEditorContent(editor.form.content)));

function maskEditorContentImages(content) {
  return String(content || '');
}

function serializeEditorContent(content) {
  return String(content || '');
}

function resetEditorForm(article = null) {
  editor.currentArticle = article;
  editor.coverImageBase64 = article?.cover_image || null;
  editor.coverImageAssetId = article?.cover_image_asset_id || null;
  editor.coverImageSize = 0;
  editor.form.title = article?.title || '';
  editor.form.category = article?.category || '';
  editor.form.readTime = article?.read_time || '5 min';
  editor.form.excerpt = article?.excerpt || '';
  editor.form.content = maskEditorContentImages(article?.content || '');
  if (editorCoverInput.value) editorCoverInput.value.value = '';
}

function showMessage(type, msg) {
  editor.message = msg;
  editor.messageType = type;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function selectedContentRange() {
  const input = editorContentInput.value;
  return {
    start: input?.selectionStart ?? editor.form.content.length,
    end: input?.selectionEnd ?? editor.form.content.length
  };
}

function replaceContentSelection(markdown, selectOffset = 0, selectLength = 0) {
  const { start, end } = selectedContentRange();
  const before = editor.form.content.slice(0, start);
  const after = editor.form.content.slice(end);
  editor.form.content = `${before}${markdown}${after}`;
  requestAnimationFrame(() => {
    const cursorStart = start + selectOffset;
    const cursorEnd = selectLength ? cursorStart + selectLength : start + markdown.length;
    editorContentInput.value?.focus();
    editorContentInput.value?.setSelectionRange(cursorStart, cursorEnd);
  });
}

function wrapContentSelection(before, after = before, placeholder = 'text') {
  const { start, end } = selectedContentRange();
  const selected = editor.form.content.slice(start, end) || placeholder;
  const markdown = `${before}${selected}${after}`;
  replaceContentSelection(markdown, before.length, selected.length);
}

function insertMarkdownBlock(prefix, placeholder = '内容') {
  const { start, end } = selectedContentRange();
  const selected = editor.form.content.slice(start, end) || placeholder;
  const needsLeadingBreak = start > 0 && !editor.form.content.slice(0, start).endsWith('\n') ? '\n' : '';
  const needsTrailingBreak = !editor.form.content.slice(end).startsWith('\n') ? '\n' : '';
  const markdown = `${needsLeadingBreak}${selected.split('\n').map((line) => `${prefix}${line}`).join('\n')}${needsTrailingBreak}`;
  replaceContentSelection(markdown, needsLeadingBreak.length + prefix.length, selected.length);
}

function insertMarkdownTemplate(type) {
  const actions = {
    h2: () => insertMarkdownBlock('## ', '小标题'),
    h3: () => insertMarkdownBlock('### ', '小标题'),
    bold: () => wrapContentSelection('**', '**', '加粗文字'),
    italic: () => wrapContentSelection('*', '*', '斜体文字'),
    quote: () => insertMarkdownBlock('> ', '引用内容'),
    list: () => insertMarkdownBlock('- ', '列表项'),
    ordered: () => insertMarkdownBlock('1. ', '列表项'),
    code: () => {
      const { start, end } = selectedContentRange();
      const selected = editor.form.content.slice(start, end);
      if (selected.includes('\n')) {
        replaceContentSelection(`\n\`\`\`\n${selected || 'code'}\n\`\`\`\n`, 5, selected.length || 4);
      } else {
        wrapContentSelection('`', '`', 'code');
      }
    },
    link: () => replaceContentSelection('[链接文字](https://example.com)', 1, 4),
    hr: () => replaceContentSelection('\n---\n')
  };
  actions[type]?.();
}

function insertRichEmbed(type) {
  if (type === 'media') {
    const url = window.prompt('输入媒体链接');
    if (!url) return;
    const title = window.prompt('卡片标题', '媒体卡片') || '媒体卡片';
    const description = window.prompt('卡片描述，可留空', '') || '';
    replaceContentSelection(`\n::media[${title.replace(/[\]\r\n]/g, ' ')}](${url.trim()} "${description.replace(/["\r\n]/g, ' ')}")\n`);
    return;
  }

  if (type === 'iframe') {
    const iframe = window.prompt('输入 iframe 地址或完整 iframe 代码，仅支持 HTTPS');
    if (!iframe) return;
    const title = window.prompt('iframe 标题', '嵌入内容') || '嵌入内容';
    const height = window.prompt('高度，220-900', '420') || '420';
    const srcMatch = iframe.match(/src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const src = (srcMatch?.[1] || srcMatch?.[2] || srcMatch?.[3] || iframe).trim();
    replaceContentSelection(`\n::iframe[${title.replace(/[\]\r\n]/g, ' ')}](${src} "${height.replace(/["\r\n]/g, ' ')}")\n`);
  }
}

async function handleEditorCoverUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showMessage('error', props.t.editorImageOnly);
    return;
  }

  try {
    editor.coverImageBase64 = await compressImage(file, { maxWidth: 1200, maxHeight: 630, quality: 0.72 });
    editor.coverImageAssetId = null;
    editor.coverImageSize = Math.round(editor.coverImageBase64.length * 3 / 4);
  } catch (_) {
    showMessage('error', props.t.editorImageFailed);
  }
}

function assetDisplayName(asset) {
  return asset.metadata?.fileName || asset.metadata?.alt || asset.storage_key?.split('/').pop() || asset.id;
}

function assetUrl(asset) {
  return asset.access_url || asset.display_url || asset.url;
}

function assetMarkdownUrl(asset) {
  return asset.markdown_url || asset.display_url || asset.url;
}

async function openAssetPicker(mode = 'body') {
  editor.assetPicker.open = true;
  editor.assetPicker.mode = mode;
  editor.assetPicker.message = '';
  await loadAssetPicker();
}

function closeAssetPicker() {
  editor.assetPicker.open = false;
}

async function loadAssetPicker() {
  editor.assetPicker.loading = true;
  editor.assetPicker.loadError = '';
  try {
    const params = new URLSearchParams({
      type: editor.assetPicker.mode === 'cover' ? 'image' : 'all',
      limit: '60',
      search: editor.assetPicker.search.trim()
    });
    const response = await authFetch(noStoreUrl(`/api/assets?${params}`), {
      headers: authHeaders(),
      cache: 'no-store'
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || '附件读取失败');
    editor.assetPicker.assets = result.data?.assets || [];
  } catch (error) {
    editor.assetPicker.assets = [];
    editor.assetPicker.loadError = error.message || '附件读取失败';
  } finally {
    editor.assetPicker.loading = false;
  }
}

function useAsset(asset) {
  const url = assetMarkdownUrl(asset);
  if (editor.assetPicker.mode === 'cover') {
    editor.coverImageBase64 = assetUrl(asset);
    editor.coverImageAssetId = asset.id;
    editor.coverImageSize = 0;
    closeAssetPicker();
    return;
  }
  const alt = assetDisplayName(asset).replace(/[\]\r\n]/g, ' ');
  const mimeType = String(asset.mime_type || '');
  if (mimeType.startsWith('image/')) {
    replaceContentSelection(`\n![${alt}](${url})\n`, 3, alt.length);
  } else if (mimeType.startsWith('video/')) {
    replaceContentSelection(`\n::media[${alt}](${url} "video")\n`);
  } else if (mimeType.startsWith('audio/')) {
    replaceContentSelection(`\n::media[${alt}](${url} "audio")\n`);
  } else {
    replaceContentSelection(`\n[${alt}](${url})\n`, 2, alt.length);
  }
  closeAssetPicker();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

function postJsonWithProgress(url, payload, headers, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl(url));
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    Object.entries(headers || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) xhr.setRequestHeader(key, value);
    });
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        text: () => Promise.resolve(xhr.responseText || '')
      });
    };
    xhr.onerror = () => reject(new Error('附件上传失败，请检查网络后重试'));
    xhr.send(JSON.stringify(payload));
  });
}

function isSupportedAssetFile(file) {
  const type = file.type || '';
  const name = file.name || '';
  return type.startsWith('image/')
    || type.startsWith('video/')
    || type.startsWith('audio/')
    || ['application/pdf', 'text/plain', 'text/markdown', 'application/zip', 'application/json'].includes(type)
    || /\.(md|txt|pdf|zip|json|mp4|webm|mov|m4v|mkv|mp3|flac|wav|ogg|m4a)$/i.test(name);
}

async function uploadEditorAsset(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (editor.assetPicker.mode === 'cover' && !file.type.startsWith('image/')) {
    editor.assetPicker.message = '封面只能选择图片';
    return;
  }
  if (!isSupportedAssetFile(file)) {
    editor.assetPicker.message = '暂不支持这种文件类型';
    return;
  }
  editor.assetPicker.uploading = true;
  editor.assetPicker.uploadProgress = 4;
  editor.assetPicker.uploadPhase = file.type.startsWith('image/') ? '正在压缩图片...' : '正在读取文件...';
  editor.assetPicker.message = '';
  try {
    const dataUrl = file.type.startsWith('image/')
      ? await compressImage(file, { maxWidth: 1800, maxHeight: 1600, quality: 0.82 })
      : await fileToDataUrl(file);
    editor.assetPicker.uploadProgress = 8;
    editor.assetPicker.uploadPhase = '正在上传...';
    const response = await postJsonWithProgress(
      '/api/assets',
      {
        dataUrl,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        alt: file.name.replace(/\.[^.]+$/, '')
      },
      authHeaders({ 'Content-Type': 'application/json' }),
      (progress) => {
        editor.assetPicker.uploadProgress = Math.max(8, Math.min(96, progress));
      }
    );
    editor.assetPicker.uploadPhase = '正在处理...';
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || '附件上传失败');
    editor.assetPicker.uploadProgress = 100;
    await loadAssetPicker();
    useAsset(result.data);
  } catch (error) {
    editor.assetPicker.message = error.message || '附件上传失败';
  } finally {
    editor.assetPicker.uploading = false;
    editor.assetPicker.uploadPhase = '';
    editor.assetPicker.uploadProgress = 0;
    if (editorAssetUploadInput.value) editorAssetUploadInput.value.value = '';
  }
}

function assetPreviewType(asset) {
  const mimeType = String(asset.mime_type || '');
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

function removeEditorCover() {
  editor.coverImageBase64 = null;
  editor.coverImageAssetId = null;
  editor.coverImageSize = 0;
  if (editorCoverInput.value) editorCoverInput.value.value = '';
}

async function handleEditorSubmit() {
  const title = editor.form.title.trim();
  const category = editor.form.category;
  const readTime = editor.form.readTime.trim();
  const excerpt = editor.form.excerpt.trim();
  const content = serializeEditorContent(editor.form.content).trim();

  if (!title || !category || !readTime || !excerpt || !content) {
    showMessage('error', props.t.editorRequired);
    return;
  }

  editor.submitting = true;
  try {
    const id = currentArticleId.value;
    const body = {
      title,
      category,
      read_time: readTime,
      excerpt,
      content,
      content_format: 'markdown',
      cover_image: editor.coverImageBase64,
      cover_image_asset_id: editor.coverImageAssetId || null
    };
    let url = '/api/articles';
    let method = 'POST';

    if (id) {
      url = session.value?.admin ? `/api/admin/articles/${id}` : `/api/user/articles/${id}`;
      method = 'PUT';
    }

    const response = await authFetch(url, {
      method,
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body)
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.unknown);

    showMessage('success', id ? props.t.editorSaved : props.t.editorPublished);
    setTimeout(() => emit('go', '/stage'), 1000);
  } catch (error) {
    showMessage('error', props.t.editorSubmitFailed + (error.message || props.t.editorNetworkFailed));
  } finally {
    editor.submitting = false;
  }
}

async function initEditor() {
  editor.loading = true;
  editor.loadError = '';
  editor.message = '';
  editor.messageType = 'error';
  session.value = getSession();

  if (!session.value) {
    editor.loading = false;
    resetEditorForm();
    return;
  }

  const id = currentArticleId.value;
  if (id) {
    try {
      const url = session.value.admin ? `/api/admin/articles/${id}` : `/api/user/articles/${id}`;
      const response = await authFetch(noStoreUrl(url), {
        headers: authHeaders(),
        cache: 'no-store'
      });
      const result = await parseResponse(response);
      if (!result.success) throw new Error(result.message || props.t.unknown);
      const validCategories = categories.map((item) => item.value);
      resetEditorForm({
        ...result.data,
        category: validCategories.includes(result.data.category) ? result.data.category : '\u5176\u4ed6'
      });
    } catch (error) {
      editor.loadError = props.t.editorLoadFailed + (error.message || props.t.editorNetworkFailed);
    }
  } else {
    resetEditorForm();
    if (!canPublishAnnouncement.value) editor.form.category = '\u5176\u4ed6';
  }

  editor.loading = false;
}

function go(path) {
  emit('go', path);
}

function cancelEdit() {
  window.history.back();
}

onMounted(initEditor);
watch(currentArticleId, initEditor);
</script>

<template>
  <main class="page editor-page" :aria-busy="editor.loading || editor.submitting">
    <div class="editor-container">
      <header class="editor-header">
        <h1 class="section-title">{{ t.editorTitle }}</h1>
        <p class="section-subtitle">{{ t.editorSubtitle }}</p>
      </header>

      <div v-if="!isAuthed" class="panel editor-login-notice">
        <p>{{ t.editorNeedLogin }}</p>
        <a class="primary-btn" href="/login" @click.prevent="go('/login')">{{ t.editorLogin }}</a>
      </div>

      <LoadingSkeleton v-else-if="editor.loading" variant="editor" :count="1" :label="t.loading" />

      <div v-else-if="editor.loadError" class="editor-status error" role="alert">{{ editor.loadError }}</div>

      <form v-else class="editor-form" :aria-busy="editor.submitting" @submit.prevent="handleEditorSubmit">
        <div v-if="editor.message" class="form-message" :class="editor.messageType">{{ editor.message }}</div>

        <div class="form-group">
          <label>{{ t.editorFieldCover }}</label>
          <div class="editor-cover-upload" :class="{ 'has-image': editor.coverImageBase64 }">
            <input
              ref="editorCoverInput"
              type="file"
              accept="image/*"
              @change="handleEditorCoverUpload"
            >
            <div>
              <strong>{{ t.editorCoverPick }}</strong>
              <div class="help-text">{{ t.editorCoverHint }}</div>
            </div>
            <img
              v-if="editor.coverImageBase64"
              class="editor-cover-preview show"
              :src="editor.coverImageBase64"
              alt=""
            >
            <button
              v-if="editor.coverImageBase64"
              type="button"
              class="editor-cover-remove"
              @click="removeEditorCover"
            >
              {{ t.editorRemove }}
            </button>
          </div>
          <button class="ghost-btn editor-asset-library-btn" type="button" @click="openAssetPicker('cover')">从附件库选择封面</button>
        </div>

        <div class="form-group">
          <label for="editorTitle">{{ t.editorFieldTitle }}</label>
          <input id="editorTitle" v-model="editor.form.title" type="text" required :placeholder="t.editorTitlePh">
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="editorCategory">{{ t.editorFieldCategory }}</label>
            <select id="editorCategory" v-model="editor.form.category" required>
              <option value="">{{ t.editorCategorySelect }}</option>
              <option v-for="category in availableCategories" :key="category.value" :value="category.value">
                {{ t[category.labelKey] }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label for="editorReadTime">{{ t.editorFieldReadTime }}</label>
            <input id="editorReadTime" v-model="editor.form.readTime" type="text" required :placeholder="t.editorReadTimePh">
          </div>
        </div>

        <div class="form-group">
          <label for="editorExcerpt">{{ t.editorFieldExcerpt }}</label>
          <textarea
            id="editorExcerpt"
            v-model="editor.form.excerpt"
            maxlength="200"
            required
            :placeholder="t.editorExcerptPh"
          ></textarea>
          <div class="help-text">{{ t.editorExcerptHint }}</div>
        </div>

        <div class="form-group">
          <label for="editorContent">{{ t.editorFieldContent }}</label>
          <div class="markdown-toolbar" aria-label="Markdown toolbar">
            <button type="button" class="ghost-btn" @click="insertMarkdownTemplate('h2')">H2</button>
            <button type="button" class="ghost-btn" @click="insertMarkdownTemplate('h3')">H3</button>
            <button type="button" class="ghost-btn" @click="insertMarkdownTemplate('bold')">B</button>
            <button type="button" class="ghost-btn" @click="insertMarkdownTemplate('italic')"><em>I</em></button>
            <button type="button" class="ghost-btn" @click="insertMarkdownTemplate('quote')">“”</button>
            <button type="button" class="ghost-btn" @click="insertMarkdownTemplate('list')">• List</button>
            <button type="button" class="ghost-btn" @click="insertMarkdownTemplate('ordered')">1. List</button>
            <button type="button" class="ghost-btn" @click="insertMarkdownTemplate('code')">{ }</button>
            <button type="button" class="ghost-btn" @click="insertMarkdownTemplate('link')">Link</button>
            <button type="button" class="ghost-btn" @click="insertMarkdownTemplate('hr')">—</button>
            <button type="button" class="ghost-btn" @click="insertRichEmbed('media')">媒体卡片</button>
            <button type="button" class="ghost-btn" @click="insertRichEmbed('iframe')">iframe</button>
            <button type="button" class="primary-btn markdown-image-btn" @click="openAssetPicker('body')">上传 / 选择附件</button>
          </div>
          <textarea
            id="editorContent"
            ref="editorContentInput"
            v-model="editor.form.content"
            required
            style="min-height:400px"
            :placeholder="t.editorContentPh"
          ></textarea>
          <div class="help-text">可以上传或选择自己的附件；图片、视频、音频和文件会按类型插入正文，并自动兼容对象存储。</div>
        </div>

        <div class="form-group">
          <div class="editor-preview-head">
            <label>Markdown 预览</label>
            <span>图片、链接、列表、引用和代码块会按文章页样式渲染</span>
          </div>
          <section class="article-content editor-markdown-preview" v-html="contentPreview"></section>
        </div>

        <div class="btn-group">
          <button type="submit" class="primary-btn" :disabled="editor.submitting" :aria-busy="editor.submitting">{{ submitLabel }}</button>
          <button type="button" class="ghost-btn" @click="cancelEdit">{{ t.cancel }}</button>
        </div>
      </form>

      <Teleport to="body">
        <div v-if="editor.assetPicker.open" class="editor-asset-backdrop" role="presentation" @click.self="closeAssetPicker">
          <section class="editor-asset-modal" data-material="popover" role="dialog" aria-modal="true" aria-label="附件库" :aria-busy="editor.assetPicker.loading || editor.assetPicker.uploading">
            <header class="editor-asset-head">
              <div>
                <span>Asset Library</span>
                <h2>{{ editor.assetPicker.mode === 'cover' ? '选择封面图片' : '上传 / 选择附件' }}</h2>
              </div>
              <button class="ghost-btn" type="button" @click="closeAssetPicker">关闭</button>
            </header>
            <div class="editor-asset-tools">
              <input v-model="editor.assetPicker.search" type="search" placeholder="搜索附件" @keydown.enter="loadAssetPicker">
              <button class="ghost-btn" type="button" @click="loadAssetPicker">搜索</button>
              <button class="primary-btn" type="button" :disabled="editor.assetPicker.uploading" :aria-busy="editor.assetPicker.uploading" @click="editorAssetUploadInput?.click()">
                {{ editor.assetPicker.uploading ? '上传中...' : '上传附件' }}
              </button>
              <input ref="editorAssetUploadInput" type="file" :accept="uploadAccept" hidden @change="uploadEditorAsset">
              <button class="primary-btn" type="button" @click="go('/attachments')">管理附件</button>
            </div>
            <div v-if="editor.assetPicker.uploading" class="ts-loader-region" aria-busy="true">
              <StatusLoader :label="editor.assetPicker.uploadPhase || '正在上传...'" :progress="editor.assetPicker.uploadProgress" />
            </div>
            <p v-if="editor.assetPicker.message" class="form-message error">{{ editor.assetPicker.message }}</p>
            <LoadingSkeleton v-if="editor.assetPicker.loading" variant="gallery" :count="6" label="正在加载附件" />
            <div v-else-if="editor.assetPicker.loadError" class="editor-asset-status error" role="alert">{{ editor.assetPicker.loadError }}</div>
            <div v-else-if="!editor.assetPicker.assets.length" class="editor-asset-status">还没有可用附件。可以在这里直接上传，或点击“管理附件”进入附件库。</div>
            <div v-else class="editor-asset-grid">
              <button
                v-for="asset in editor.assetPicker.assets"
                :key="asset.id"
                type="button"
                class="editor-asset-card"
                :aria-label="`选择附件：${assetDisplayName(asset)}`"
                :title="assetDisplayName(asset)"
                @click="useAsset(asset)"
              >
                <div class="editor-asset-preview">
                  <img v-if="assetPreviewType(asset) === 'image'" :src="assetUrl(asset)" alt="" loading="lazy">
                  <video v-else-if="assetPreviewType(asset) === 'video'" :src="assetUrl(asset)" preload="metadata" muted playsinline aria-hidden="true"></video>
                  <audio v-else-if="assetPreviewType(asset) === 'audio'" :src="assetUrl(asset)" preload="metadata" aria-hidden="true"></audio>
                  <div v-else class="editor-asset-file">{{ asset.asset_type || 'file' }}</div>
                </div>
                <span class="editor-asset-name">{{ assetDisplayName(asset) }}</span>
              </button>
            </div>
          </section>
        </div>
      </Teleport>
    </div>
  </main>
</template>
