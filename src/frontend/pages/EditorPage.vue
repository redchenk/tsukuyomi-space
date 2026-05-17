<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { authHeaders, getSession, parseResponse } from '../api/client';
import { compressImage } from '../utils/image';
import { renderMarkdown } from '../utils/markdown';

const props = defineProps({
  t: { type: Object, required: true }
});

const emit = defineEmits(['go']);
const route = useRoute();
const editorCoverInput = ref(null);
const editorBodyImageInput = ref(null);
const editorContentInput = ref(null);
const session = ref(getSession());
const BODY_IMAGE_SCHEME = 'tsukuyomi-image:';

const categories = [
  { value: '\u516c\u544a', labelKey: 'editorCatAnnouncement' },
  { value: '\u4f20\u8bf4', labelKey: 'editorCatLegend' },
  { value: '\u6280\u672f', labelKey: 'editorCatTechnology' },
  { value: '\u5176\u4ed6', labelKey: 'editorCatOther' }
];

const editor = reactive({
  coverImageBase64: null,
  coverImageSize: 0,
  currentArticle: null,
  message: '',
  messageType: 'error',
  submitting: false,
  loading: true,
  bodyImageUploading: false,
  bodyImages: {},
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

function createBodyImageId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function registerBodyImage(dataUrl) {
  const id = createBodyImageId();
  editor.bodyImages[id] = dataUrl;
  return id;
}

function makeBodyImageMarkdown(alt, id) {
  return `![${alt}](${BODY_IMAGE_SCHEME}${id})`;
}

function maskEditorContentImages(content) {
  editor.bodyImages = {};
  return String(content || '').replace(/!\[([^\]\n]*)\]\((data:image\/(?:png|jpe?g|gif|webp);base64,[^)]+)\)/gi, (_, alt, dataUrl) => {
    const id = registerBodyImage(dataUrl);
    return makeBodyImageMarkdown(alt, id);
  });
}

function serializeEditorContent(content) {
  return String(content || '').replace(/!\[([^\]\n]*)\]\(tsukuyomi-image:([^)]+)\)/g, (match, alt, id) => {
    const dataUrl = editor.bodyImages[id];
    return dataUrl ? `![${alt}](${dataUrl})` : match;
  });
}

function resetEditorForm(article = null) {
  editor.currentArticle = article;
  editor.coverImageBase64 = article?.cover_image || null;
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
  if (type === 'bilibili') {
    const target = window.prompt('输入 B 站 BV 号或视频链接');
    if (!target) return;
    const title = window.prompt('视频标题', 'Bilibili 视频') || 'Bilibili 视频';
    replaceContentSelection(`\n::bilibili[${title.replace(/[\]\r\n]/g, ' ')}](${target.trim()})\n`);
    return;
  }

  if (type === 'media') {
    const url = window.prompt('输入媒体链接');
    if (!url) return;
    const title = window.prompt('卡片标题', '媒体卡片') || '媒体卡片';
    const description = window.prompt('卡片描述，可留空', '') || '';
    replaceContentSelection(`\n::media[${title.replace(/[\]\r\n]/g, ' ')}](${url.trim()} "${description.replace(/["\r\n]/g, ' ')}")\n`);
    return;
  }

  if (type === 'iframe') {
    const url = window.prompt('输入 iframe 地址，仅支持 HTTPS');
    if (!url) return;
    const title = window.prompt('iframe 标题', '嵌入内容') || '嵌入内容';
    const height = window.prompt('高度，220-900', '420') || '420';
    replaceContentSelection(`\n::iframe[${title.replace(/[\]\r\n]/g, ' ')}](${url.trim()} "${height.replace(/["\r\n]/g, ' ')}")\n`);
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
    editor.coverImageSize = Math.round(editor.coverImageBase64.length * 3 / 4);
  } catch (_) {
    showMessage('error', props.t.editorImageFailed);
  }
}

async function handleBodyImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showMessage('error', props.t.editorImageOnly);
    return;
  }

  editor.bodyImageUploading = true;
  try {
    const image = await compressImage(file, { maxWidth: 1400, maxHeight: 1200, quality: 0.78 });
    const alt = file.name.replace(/\.[^.]+$/, '').replace(/[\\[\]\r\n]/g, ' ').trim() || 'article image';
    const id = registerBodyImage(image);
    replaceContentSelection(`\n${makeBodyImageMarkdown(alt, id)}\n`, 3, alt.length);
    editor.message = '';
  } catch (_) {
    showMessage('error', props.t.editorImageFailed);
  } finally {
    editor.bodyImageUploading = false;
    if (editorBodyImageInput.value) editorBodyImageInput.value.value = '';
  }
}

function removeEditorCover() {
  editor.coverImageBase64 = null;
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
      cover_image_asset_id: editor.currentArticle?.cover_image_asset_id || null
    };
    let url = '/api/articles';
    let method = 'POST';

    if (id) {
      url = session.value?.admin ? `/api/admin/articles/${id}` : `/api/user/articles/${id}`;
      method = 'PUT';
    }

    const response = await fetch(url, {
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
      const response = await fetch(url, { headers: { Authorization: `Bearer ${session.value.token}` } });
      const result = await parseResponse(response);
      if (!result.success) throw new Error(result.message || props.t.unknown);
      const validCategories = categories.map((item) => item.value);
      resetEditorForm({
        ...result.data,
        category: validCategories.includes(result.data.category) ? result.data.category : '\u5176\u4ed6'
      });
    } catch (error) {
      editor.message = props.t.editorLoadFailed + (error.message || props.t.editorNetworkFailed);
      editor.messageType = 'error';
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
  <main class="page editor-page">
    <div class="editor-container">
      <header class="editor-header">
        <h1 class="section-title">{{ t.editorTitle }}</h1>
        <p class="section-subtitle">{{ t.editorSubtitle }}</p>
      </header>

      <div v-if="!isAuthed" class="panel editor-login-notice">
        <p>{{ t.editorNeedLogin }}</p>
        <a class="primary-btn" href="/login" @click.prevent="go('/login')">{{ t.editorLogin }}</a>
      </div>

      <div v-else-if="editor.loading" class="editor-status">{{ t.loading }}</div>

      <form v-else class="editor-form" @submit.prevent="handleEditorSubmit">
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
            <button type="button" class="ghost-btn" @click="insertRichEmbed('bilibili')">B站</button>
            <button type="button" class="ghost-btn" @click="insertRichEmbed('media')">媒体卡片</button>
            <button type="button" class="ghost-btn" @click="insertRichEmbed('iframe')">iframe</button>
            <button
              type="button"
              class="primary-btn markdown-image-btn"
              :disabled="editor.bodyImageUploading"
              @click="editorBodyImageInput?.click()"
            >
              {{ editor.bodyImageUploading ? '图片处理中...' : '插入图片' }}
            </button>
            <input
              ref="editorBodyImageInput"
              class="markdown-image-input"
              type="file"
              accept="image/*"
              @change="handleBodyImageUpload"
            >
          </div>
          <textarea
            id="editorContent"
            ref="editorContentInput"
            v-model="editor.form.content"
            required
            style="min-height:400px"
            :placeholder="t.editorContentPh"
          ></textarea>
          <div class="help-text">{{ t.editorContentHint }}</div>
        </div>

        <div class="form-group">
          <div class="editor-preview-head">
            <label>Markdown 预览</label>
            <span>图片、链接、列表、引用和代码块会按文章页样式渲染</span>
          </div>
          <section class="article-content editor-markdown-preview" v-html="contentPreview"></section>
        </div>

        <div class="btn-group">
          <button type="submit" class="primary-btn" :disabled="editor.submitting">{{ submitLabel }}</button>
          <button type="button" class="ghost-btn" @click="cancelEdit">{{ t.cancel }}</button>
        </div>
      </form>
    </div>
  </main>
</template>
