<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { authHeaders, getSession, parseResponse } from '../api/client';
import { compressImage } from '../utils/image';

const props = defineProps({
  t: { type: Object, required: true }
});

const emit = defineEmits(['go']);
const route = useRoute();
const editorCoverInput = ref(null);
const session = ref(getSession());

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

function resetEditorForm(article = null) {
  editor.currentArticle = article;
  editor.coverImageBase64 = article?.cover_image || null;
  editor.coverImageSize = 0;
  editor.form.title = article?.title || '';
  editor.form.category = article?.category || '';
  editor.form.readTime = article?.read_time || '5 min';
  editor.form.excerpt = article?.excerpt || '';
  editor.form.content = article?.content || '';
  if (editorCoverInput.value) editorCoverInput.value.value = '';
}

function showMessage(type, msg) {
  editor.message = msg;
  editor.messageType = type;
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
  const content = editor.form.content.trim();

  if (!title || !category || !readTime || !excerpt || !content) {
    showMessage('error', props.t.editorRequired);
    return;
  }

  editor.submitting = true;
  try {
    const id = currentArticleId.value;
    const body = { title, category, read_time: readTime, excerpt, content, cover_image: editor.coverImageBase64 };
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
          <textarea
            id="editorContent"
            v-model="editor.form.content"
            required
            style="min-height:400px"
            :placeholder="t.editorContentPh"
          ></textarea>
          <div class="help-text">{{ t.editorContentHint }}</div>
        </div>

        <div class="btn-group">
          <button type="submit" class="primary-btn" :disabled="editor.submitting">{{ submitLabel }}</button>
          <button type="button" class="ghost-btn" @click="cancelEdit">{{ t.cancel }}</button>
        </div>
      </form>
    </div>
  </main>
</template>
