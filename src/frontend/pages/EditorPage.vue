<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { apiUrl, authFetch, authHeaders, getSession, noStoreUrl, parseResponse } from '../api/client';
import { compressImage } from '../utils/image';
import { renderMarkdown } from '../utils/markdown';
import { handleMarkdownClick } from '../utils/markdownActions';
import { markdownTemplates, continueMarkdownList } from '../utils/markdownTemplates';
import { applyGrowthResult } from '../services/userGrowth';
import { useArticleCategories } from '../composables/useArticleCategories';

const props = defineProps({
  lang: { type: String, default: 'zh' },
  t: { type: Object, required: true }
});

const emit = defineEmits(['go']);
const route = useRoute();
const editorCoverInput = ref(null);
const editorContentInput = ref(null);
const editorAssetUploadInput = ref(null);
const session = ref(getSession());
const uploadAccept = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/flac,audio/wav,audio/ogg,audio/mp4,application/pdf,text/plain,text/markdown';

const { categories, revision: categoryRevision, refresh: refreshCategories } = useArticleCategories();
const categoryLabelKeys = {
  '\u516c\u544a': 'editorCatAnnouncement', '\u4f20\u8bf4': 'editorCatLegend',
  '\u6280\u672f': 'editorCatTechnology', '\u4e8c\u521b': 'editorCatFanwork', '\u5176\u4ed6': 'editorCatOther'
};

const editor = reactive({
  coverImageBase64: null,
  coverImageAssetId: null,
  coverImageSize: 0,
  currentArticle: null,
  message: '',
  messageType: 'error',
  loadError: '',
  submitting: false,
  summarizing: false,
  summaryMessage: '',
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
const canModerateContent = computed(() => Boolean(session.value?.admin || ['admin', 'super_admin'].includes(session.value?.user?.role)));
const canPublishAnnouncement = computed(() => canModerateContent.value);
const availableCategories = computed(() => categories.value.filter((category) => canPublishAnnouncement.value || category.name !== '\u516c\u544a'));
const currentArticleId = computed(() => route.query.id || '');
const submitLabel = computed(() => {
  if (editor.submitting) return editor.currentArticle ? props.t.editorSaving : props.t.editorPublishing;
  return editor.currentArticle ? props.t.editorUpdate : props.t.editorSubmit;
});
const previewSource = ref('');
const editorView = ref(typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches ? 'write' : 'split');
const english = computed(() => props.lang === 'en');
const snippets = computed(() => markdownTemplates(english.value));
const copy = computed(() => english.value ? {
  write: 'Write', split: 'Split view', preview: 'Preview', insert: 'Insert a block…', help: 'Markdown guide',
  hint: 'Ctrl / ⌘ + B bold · I italic · K link · Shift + C code block. Lists continue with Enter.',
  empty: 'Your formatted article will appear here.', body: 'Article body', chars: 'characters',
  attachment: 'Upload / choose attachment', mark: 'Highlight', spoiler: 'Spoiler', strike: 'Strikethrough',
  sync: 'Preview uses the same formatting as the published article.', examples: 'Insert example',
  assetHint: 'Choose files from your attachment library. Images, video and audio keep their original links.'
} : {
  write: '撰写', split: '分栏', preview: '预览', insert: '插入内容块…', help: 'Markdown 语法指南',
  hint: 'Ctrl / ⌘ + B 加粗 · I 斜体 · K 链接 · Shift + C 代码块；列表按 Enter 自动续写。',
  empty: '在左侧写下内容，这里会显示文章效果。', body: '文章正文', chars: '字符',
  attachment: '上传 / 选择附件', mark: '高亮', spoiler: '防剧透', strike: '删除线',
  sync: '预览与发布后的文章使用同一套排版。', examples: '插入示例',
  assetHint: '可以上传或选择自己的附件；图片、视频和音频保留原始资源链接。'
});
const contentPreview = computed(() => renderMarkdown(previewSource.value, { lang: props.lang }));
const contentLength = computed(() => Array.from(editor.form.content).length);
let previewTimer;
watch(() => editor.form.content, value => {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => { previewSource.value = serializeEditorContent(value); }, 180);
});
watch(editorView, () => { clearTimeout(previewTimer); previewSource.value = serializeEditorContent(editor.form.content); });
onBeforeUnmount(() => clearTimeout(previewTimer));

function maskEditorContentImages(content) {
  return String(content || '');
}

function serializeEditorContent(content) {
  return String(content || '');
}

function resetEditorForm(article = null) {
  editor.summaryMessage = '';
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
  const input = editorContentInput.value;
  input?.focus();
  input?.setSelectionRange(start, end);
  // Native insertion retains the browser's undo history for toolbar operations.
  let inserted = false;
  try { inserted = Boolean(input && document.execCommand('insertText', false, markdown)); } catch (_) { /* Use the controlled value below. */ }
  editor.form.content = inserted ? input.value : `${before}${markdown}${after}`;
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
    mark: () => wrapContentSelection('==', '==', english.value ? 'highlight' : '高亮文字'),
    spoiler: () => wrapContentSelection(':spoiler[', ']', english.value ? 'spoiler' : '隐藏的内容'),
    strike: () => wrapContentSelection('~~', '~~', english.value ? 'text' : '删除的文字'),
    link: () => wrapContentSelection('[', '](https://example.com)', english.value ? 'Link text' : '链接文字'),
    hr: () => replaceContentSelection('\n---\n')
  };
  if (editorView.value === 'preview') editorView.value = 'write';
  actions[type]?.();
}

function insertSnippet(snippet) {
  if (!snippet) return;
  if (editorView.value === 'preview') editorView.value = 'write';
  const { start, end } = selectedContentRange();
  const selected = editor.form.content.slice(start, end);
  let source = snippet.source;
  if (selected && snippet.id === 'codeblock') {
    const fence = '`'.repeat(Math.max(3, ...Array.from(selected.matchAll(/`+/g), match => match[0].length + 1)));
    source = fence + 'text\n' + selected + '\n' + fence;
  }
  if (selected && ['callout', 'details'].includes(snippet.id)) {
    const lines = source.split('\n'); source = lines[0] + '\n' + selected + '\n:::';
  }
  replaceContentSelection((start ? '\n\n' : '') + source + '\n\n');
}
function insertSelectedSnippet(event) {
  insertSnippet(snippets.value.find(item => item.id === event.target.value));
  event.target.value = '';
}
function handleContentKeydown(event) {
  if (event.isComposing) return;
  if (event.metaKey || event.ctrlKey) {
    const key = event.key.toLowerCase();
    if (event.altKey || !['b', 'i', 'k', 'c'].includes(key)) return;
    if (key === 'c' && !event.shiftKey) return;
    event.preventDefault();
    if (key === 'c') insertSnippet(snippets.value.find(item => item.id === 'codeblock'));
    else insertMarkdownTemplate({ b: 'bold', i: 'italic', k: 'link' }[key]);
  } else if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
    const { start, end } = selectedContentRange();
    const edit = continueMarkdownList(editor.form.content, start, end);
    if (!edit) return;
    event.preventDefault();
    editorContentInput.value.setSelectionRange(edit.start, edit.end);
    replaceContentSelection(edit.text);
  }
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
    editor.coverImageBase64 = url;
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
  if (editor.submitting || editor.summarizing) return;
  const title = editor.form.title.trim();
  const category = editor.form.category;
  const readTime = editor.form.readTime.trim();
  const excerpt = editor.form.excerpt.trim();
  const content = serializeEditorContent(editor.form.content).trim();

  if (!title || !category || !readTime || !content) {
    if (!content) editorView.value = 'write';
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
      status: editor.currentArticle?.status || 'published',
      cover_image: editor.coverImageBase64,
      cover_image_asset_id: editor.coverImageAssetId || null
    };
    let url = '/api/articles';
    let method = 'POST';

    if (id) {
      if (session.value?.admin) {
        url = `/api/admin/articles/${id}`;
        method = 'PUT';
      } else if (canModerateContent.value) {
        url = `/api/moderation/articles/${id}/save`;
        method = 'POST';
      } else {
        url = `/api/user/articles/${id}`;
        method = 'PUT';
      }
    }

    const response = await authFetch(url, {
      method,
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body)
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.unknown);
    if (result.growth) applyGrowthResult(result.growth);

    showMessage('success', id ? props.t.editorSaved : props.t.editorPublished);
    setTimeout(() => emit('go', '/stage'), 1000);
  } catch (error) {
    showMessage('error', props.t.editorSubmitFailed + (error.message || props.t.editorNetworkFailed));
  } finally {
    editor.submitting = false;
  }
}

async function generateExcerpt() {
  if (editor.summarizing || editor.submitting) return;
  const content = serializeEditorContent(editor.form.content).trim();
  if (!content) {
    editor.summaryMessage = props.t.editorSummaryNeedsContent;
    return;
  }
  const previousExcerpt = editor.form.excerpt;
  const articleId = currentArticleId.value;
  editor.summarizing = true;
  editor.summaryMessage = '';
  try {
    const response = await authFetch(session.value?.admin ? '/api/admin/articles/summarize' : '/api/articles/summarize', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ content, content_format: 'markdown' })
    });
    const result = await parseResponse(response);
    if (articleId !== currentArticleId.value) return;
    if (!result.success) throw new Error(result.message || props.t.editorSummaryFailed);
    // A slow response must not replace newer typing or another article's form.
    if (content !== serializeEditorContent(editor.form.content).trim() || previousExcerpt !== editor.form.excerpt) {
      editor.summaryMessage = props.t.editorSummaryChanged;
      return;
    }
    editor.form.excerpt = result.data.excerpt;
    editor.summaryMessage = props.t.editorSummaryReady;
  } catch (error) {
    if (articleId === currentArticleId.value) editor.summaryMessage = error.message || props.t.editorSummaryFailed;
  } finally {
    editor.summarizing = false;
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

  try { await refreshCategories(); }
  catch (error) {
    editor.loadError = props.t.editorLoadFailed + (error.message || props.t.editorNetworkFailed);
    editor.loading = false;
    return;
  }
  const id = currentArticleId.value;
  if (id) {
    try {
      const url = session.value.admin
        ? `/api/admin/articles/${id}`
        : (canModerateContent.value ? `/api/moderation/articles/${id}` : `/api/user/articles/${id}`);
      const response = await authFetch(noStoreUrl(url), {
        headers: authHeaders(),
        cache: 'no-store'
      });
      const result = await parseResponse(response);
      if (!result.success) throw new Error(result.message || props.t.unknown);
      const validCategories = categories.value.map((item) => item.name);
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
watch(categoryRevision, () => {
  if (editor.form.category && !categories.value.some((item) => item.name === editor.form.category)) {
    editor.form.category = '\u5176\u4ed6';
  }
});
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
              data-image-bloom
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
              <option v-for="category in availableCategories" :key="category.id" :value="category.name">
                {{ t[categoryLabelKeys[category.name]] || category.name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label for="editorReadTime">{{ t.editorFieldReadTime }}</label>
            <input id="editorReadTime" v-model="editor.form.readTime" type="text" required :placeholder="t.editorReadTimePh">
          </div>
        </div>

        <div class="form-group">
          <div class="editor-excerpt-heading">
            <label for="editorExcerpt">{{ t.editorFieldExcerpt }}</label>
            <button class="ghost-btn" type="button" :disabled="editor.summarizing || editor.submitting" :aria-busy="editor.summarizing" @click="generateExcerpt">
              {{ editor.summarizing ? t.editorSummaryGenerating : t.editorSummaryGenerate }}
            </button>
          </div>
          <textarea
            id="editorExcerpt"
            v-model="editor.form.excerpt"
            maxlength="200"
            aria-describedby="editorExcerptHint editorSummaryStatus"
            :placeholder="t.editorExcerptPh"
          ></textarea>
          <div id="editorExcerptHint" class="help-text">{{ t.editorExcerptHint }}</div>
          <div id="editorSummaryStatus" class="help-text" role="status" aria-live="polite">{{ editor.summaryMessage }}</div>
        </div>

        <section class="editor-workbench" :data-view="editorView" :aria-label="copy.body">
          <div class="editor-workbench-head">
            <label for="editorContent">{{ t.editorFieldContent }}</label>
            <div class="editor-view-switch" role="group" :aria-label="copy.preview">
              <button v-for="view in ['write', 'split', 'preview']" :key="view" type="button" :aria-pressed="editorView === view" @click="editorView = view">{{ copy[view] }}</button>
            </div>
          </div>
          <div class="markdown-toolbar" role="group" aria-label="Markdown toolbar">
            <button type="button" class="ghost-btn" title="Heading 2" @click="insertMarkdownTemplate('h2')">H2</button>
            <button type="button" class="ghost-btn" title="Heading 3" @click="insertMarkdownTemplate('h3')">H3</button>
            <button type="button" class="ghost-btn" aria-label="Bold" title="Ctrl / ⌘ + B" @click="insertMarkdownTemplate('bold')"><strong>B</strong></button>
            <button type="button" class="ghost-btn" aria-label="Italic" title="Ctrl / ⌘ + I" @click="insertMarkdownTemplate('italic')"><em>I</em></button>
            <button type="button" class="ghost-btn" :aria-label="copy.strike" @click="insertMarkdownTemplate('strike')"><s>S</s></button>
            <button type="button" class="ghost-btn" @click="insertMarkdownTemplate('mark')">{{ copy.mark }}</button>
            <button type="button" class="ghost-btn" @click="insertMarkdownTemplate('spoiler')">{{ copy.spoiler }}</button>
            <button type="button" class="ghost-btn" aria-label="Quote" @click="insertMarkdownTemplate('quote')">“”</button>
            <button type="button" class="ghost-btn" aria-label="Bullet list" @click="insertMarkdownTemplate('list')">• List</button>
            <button type="button" class="ghost-btn" aria-label="Ordered list" @click="insertMarkdownTemplate('ordered')">1. List</button>
            <button type="button" class="ghost-btn" aria-label="Inline code" @click="insertMarkdownTemplate('code')">{ }</button>
            <button type="button" class="ghost-btn" title="Ctrl / ⌘ + K" @click="insertMarkdownTemplate('link')">Link</button>
            <button type="button" class="ghost-btn" aria-label="Horizontal rule" @click="insertMarkdownTemplate('hr')">—</button>
            <select class="markdown-insert-select" :aria-label="copy.insert" @change="insertSelectedSnippet">
              <option value="">{{ copy.insert }}</option>
              <option v-for="snippet in snippets" :key="snippet.id" :value="snippet.id">{{ snippet.label }}</option>
            </select>
            <button type="button" class="ghost-btn" @click="insertRichEmbed('media')">{{ english ? 'Media card' : '媒体卡片' }}</button>
            <button type="button" class="ghost-btn" @click="insertRichEmbed('iframe')">iframe</button>
            <button type="button" class="primary-btn markdown-image-btn" @click="openAssetPicker('body')">{{ copy.attachment }}</button>
          </div>
          <div class="editor-panes">
            <div class="editor-source-pane">
              <textarea id="editorContent" ref="editorContentInput" v-model="editor.form.content"
                :required="editorView !== 'preview'" :placeholder="t.editorContentPh" aria-describedby="editorMarkdownHint"
                spellcheck="false" @keydown="handleContentKeydown"></textarea>
            </div>
            <div class="editor-preview-pane">
              <div class="editor-preview-head"><strong>{{ copy.preview }}</strong><span>{{ copy.sync }}</span></div>
              <section class="article-content editor-markdown-preview" :aria-label="copy.preview" @click="handleMarkdownClick" v-html="contentPreview"></section>
              <p v-if="!previewSource.trim()" class="editor-preview-empty">{{ copy.empty }}</p>
            </div>
          </div>
          <div class="editor-writing-status"><span id="editorMarkdownHint">{{ copy.hint }}</span><span>{{ contentLength.toLocaleString() }} {{ copy.chars }}</span></div>
          <p class="help-text">{{ copy.assetHint }}</p>
          <details class="editor-markdown-help">
            <summary>{{ copy.help }}</summary>
            <p>{{ english ? 'Select a template to insert at the cursor, then replace the example content. Highlight: ==text== · Spoiler: :spoiler[text] · Inline math: $x^2$.' : '从工具栏选择内容块即可在光标处插入，再替换示例内容。高亮：==文字== · 防剧透：:spoiler[内容] · 行内公式：$x^2$。' }}</p>
            <div class="editor-syntax-grid">
              <article v-for="snippet in snippets" :key="snippet.id"><div><strong>{{ snippet.label }}</strong><button class="ghost-btn" type="button" @click="insertSnippet(snippet)">{{ copy.examples }}</button></div><pre><code>{{ snippet.source }}</code></pre></article>
            </div>
          </details>
        </section>

        <div class="btn-group">
          <button type="submit" class="primary-btn" :disabled="editor.submitting || editor.summarizing" :aria-busy="editor.submitting">{{ submitLabel }}</button>
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
                  <img v-if="assetPreviewType(asset) === 'image'" :src="assetUrl(asset)" alt="" loading="lazy" decoding="async" data-image-bloom>
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
