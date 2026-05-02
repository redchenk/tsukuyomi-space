<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { authHeaders, clearSession, getAuthToken, getSession, parseResponse, updateStoredUser } from '../api/client';
import { compressImage } from '../utils/image';

const props = defineProps({
  lang: { type: String, required: true },
  t: { type: Object, required: true }
});

const emit = defineEmits(['auth-changed', 'go']);
const ucAvatarInput = ref(null);
const session = ref(getSession());
const ucUser = ref(session.value?.user || null);
const ucToast = reactive({ text: '', visible: false });
let ucToastTimer = 0;

const uc = reactive({
  tab: 'profile',
  profileMsg: '',
  profileMsgType: 'error',
  passwordMsg: '',
  passwordMsgType: 'error',
  profileSaving: false,
  passwordChanging: false,
  articles: [],
  articleQuery: '',
  articleLoading: true,
  avatarUploading: false,
  profileBio: '',
  password: {
    current: '',
    next: '',
    confirm: ''
  }
});

const isAuthed = computed(() => Boolean(session.value));
const locale = computed(() => props.lang === 'zh' ? 'zh-CN' : 'ja-JP');
const ucAvatarSrc = computed(() => ucUser.value?.avatar || ucDefaultAvatar(ucUser.value?.username));
const ucRoleText = computed(() => {
  if (!ucUser.value) return '';
  return ucUser.value.role === 'admin' ? props.t.ucAdmin : props.t.ucUser;
});
const ucArticlesCount = computed(() => uc.articles.length.toLocaleString(locale.value));
const ucTotalViews = computed(() => {
  const total = uc.articles.reduce((sum, article) => sum + Number(article.view_count || 0), 0);
  return total.toLocaleString(locale.value);
});
const ucJoinDate = computed(() => {
  if (!ucUser.value?.created_at) return '-';
  return new Date(ucUser.value.created_at).toLocaleDateString(locale.value);
});
const ucFilteredArticles = computed(() => {
  if (!uc.articleQuery) return uc.articles;
  const q = uc.articleQuery.toLowerCase();
  return uc.articles.filter((article) => `${article.title || ''} ${article.category || ''}`.toLowerCase().includes(q));
});

function go(path) {
  emit('go', path);
}

function logout() {
  clearSession();
  session.value = null;
  ucUser.value = null;
  emit('auth-changed');
  emit('go', '/access');
}

function ucShowToast(text) {
  ucToast.text = text;
  ucToast.visible = true;
  clearTimeout(ucToastTimer);
  ucToastTimer = setTimeout(() => {
    ucToast.visible = false;
  }, 2200);
}

function ucShowMessage(scope, msg, variant = 'error') {
  const msgKey = `${scope}Msg`;
  const typeKey = `${scope}MsgType`;
  uc[msgKey] = msg;
  uc[typeKey] = variant;
  clearTimeout(uc[`_${scope}Timer`]);
  uc[`_${scope}Timer`] = setTimeout(() => {
    uc[msgKey] = '';
    uc[typeKey] = 'error';
  }, 3200);
}

function ucDefaultAvatar(name) {
  const initial = encodeURIComponent((name || '\u6708').slice(0, 1));
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%23ffb7c5'/%3E%3Cstop offset='1' stop-color='%23ff6b9d'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='50' cy='50' r='50' fill='url(%23g)'/%3E%3Ctext x='50' y='62' text-anchor='middle' font-size='42' font-family='Arial' fill='%231a1025'%3E${initial}%3C/text%3E%3C/svg%3E`;
}

function ucFormatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString(locale.value);
}

async function ucLoadProfile() {
  const token = getAuthToken();
  if (!token) return;
  try {
    const response = await fetch('/api/user/profile', { headers: authHeaders() });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.ucProfileLoadFailed);
    ucUser.value = result.data;
    uc.profileBio = result.data?.bio || '';
    updateStoredUser(result.data);
  } catch (error) {
    ucShowToast(error.message || props.t.ucProfileLoadFailed);
  }
}

async function ucLoadArticles() {
  uc.articleLoading = true;
  const token = getAuthToken();
  if (!token) {
    uc.articleLoading = false;
    return;
  }
  try {
    const response = await fetch('/api/user/articles', { headers: authHeaders() });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.ucArticleLoadFailed);
    uc.articles = result.data || [];
  } catch (error) {
    uc.articles = [];
    ucShowToast(error.message || props.t.ucArticleLoadFailed);
  } finally {
    uc.articleLoading = false;
  }
}

async function ucRefresh() {
  session.value = getSession();
  await Promise.all([ucLoadProfile(), ucLoadArticles()]);
}

async function ucSaveProfile() {
  const bio = uc.profileBio.trim();
  uc.profileSaving = true;
  try {
    const response = await fetch('/api/user/profile', {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ bio })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.ucProfileSaveFailed);
    if (ucUser.value) ucUser.value.bio = bio;
    updateStoredUser(ucUser.value);
    ucShowMessage('profile', props.t.ucProfileSaved, 'success');
    ucShowToast(props.t.ucProfileSaved);
  } catch (error) {
    ucShowMessage('profile', error.message || props.t.ucProfileSaveFailed);
  } finally {
    uc.profileSaving = false;
  }
}

async function ucUploadAvatar(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    ucShowToast(props.t.ucSelectImage);
    return;
  }
  if (file.size > 6 * 1024 * 1024) {
    ucShowToast(props.t.ucAvatarTooBig);
    return;
  }

  uc.avatarUploading = true;
  try {
    const avatar = await compressImage(file, { maxWidth: 420, maxHeight: 420, quality: 0.82 });
    const response = await fetch('/api/user/avatar', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ avatar })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.ucAvatarUploadFailed);
    if (ucUser.value) ucUser.value.avatar = avatar;
    updateStoredUser(ucUser.value);
    ucShowToast(props.t.ucAvatarUpdated);
  } catch (error) {
    ucShowToast(error.message || props.t.ucAvatarUploadFailed);
  } finally {
    uc.avatarUploading = false;
    event.target.value = '';
  }
}

async function ucChangePassword() {
  const currentPassword = uc.password.current;
  const newPassword = uc.password.next;
  const confirmPassword = uc.password.confirm;
  if (!currentPassword || !newPassword || !confirmPassword) {
    ucShowMessage('password', props.t.ucFillAllPasswordFields);
    return;
  }
  if (newPassword !== confirmPassword) {
    ucShowMessage('password', props.t.ucPasswordMismatch);
    return;
  }
  if (newPassword.length < 6) {
    ucShowMessage('password', props.t.ucPasswordTooShort);
    return;
  }

  uc.passwordChanging = true;
  try {
    const response = await fetch('/api/user/password', {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.ucPasswordChangeFailed);
    uc.password.current = '';
    uc.password.next = '';
    uc.password.confirm = '';
    ucShowMessage('password', props.t.ucPasswordChanged, 'success');
    ucShowToast(props.t.ucPasswordChanged);
  } catch (error) {
    ucShowMessage('password', error.message || props.t.ucPasswordChangeFailed);
  } finally {
    uc.passwordChanging = false;
  }
}

async function ucDeleteArticle(id) {
  if (!confirm(props.t.ucDeleteConfirm)) return;
  try {
    const response = await fetch(`/api/user/articles/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.ucArticleDeleteFailed);
    ucShowToast(props.t.ucArticleDeleted);
    await ucLoadArticles();
  } catch (error) {
    ucShowToast(error.message || props.t.ucArticleDeleteFailed);
  }
}

function ucEditArticle(id) {
  emit('go', `/editor?id=${id}`);
}

onMounted(() => {
  if (isAuthed.value) ucRefresh();
});
</script>

<template>
  <main class="page uc-page">
    <div v-if="!isAuthed" class="panel uc-login-notice">
      <div style="text-align:center;">
        <div class="uc-eyebrow">User Center</div>
        <h1>{{ t.ucNeedLogin }}</h1>
        <p>{{ t.ucLoginPrompt }}</p>
        <a class="primary-btn" href="/login" @click.prevent="go('/login')">{{ t.ucGoLogin }}</a>
      </div>
    </div>

    <template v-else>
      <section class="uc-hero">
        <div class="uc-avatar-block">
          <div class="uc-avatar-upload" :title="t.ucChangeAvatar" @click="ucAvatarInput?.click()">
            <img :src="ucAvatarSrc" alt="">
          </div>
          <input ref="ucAvatarInput" type="file" accept="image/*" style="display:none;" @change="ucUploadAvatar">
          <button class="ghost-btn" type="button" :disabled="uc.avatarUploading" @click="ucAvatarInput?.click()">{{ t.ucUploadAvatar }}</button>
        </div>
        <div class="uc-hero-info">
          <div class="uc-role-badge">{{ ucRoleText }}</div>
          <h1 class="uc-username">{{ ucUser?.username || '-' }}</h1>
          <div class="uc-email">{{ ucUser?.email || '-' }}</div>
          <p class="uc-bio-preview">{{ ucUser?.bio || t.ucNoBio }}</p>
        </div>
        <div class="uc-hero-actions">
          <a class="primary-btn" href="/editor" @click.prevent="go('/editor')">{{ t.ucNewPost }}</a>
          <a class="ghost-btn" href="/stage" @click.prevent="go('/stage')">{{ t.ucViewStage }}</a>
          <button class="ghost-btn" type="button" @click="ucRefresh">{{ t.ucRefresh }}</button>
          <button class="danger-btn" type="button" @click="logout">{{ t.ucLogout }}</button>
        </div>
      </section>

      <section class="uc-stats">
        <div class="uc-stat-card"><div class="uc-stat-label">{{ t.ucMyArticles }}</div><div class="uc-stat-value">{{ ucArticlesCount }}</div><div class="uc-stat-note">{{ t.ucPostsTotal }}</div></div>
        <div class="uc-stat-card"><div class="uc-stat-label">{{ t.ucTotalViews }}</div><div class="uc-stat-value">{{ ucTotalViews }}</div><div class="uc-stat-note">{{ t.ucArticleViews }}</div></div>
        <div class="uc-stat-card"><div class="uc-stat-label">{{ t.ucAccountRole }}</div><div class="uc-stat-value">{{ ucRoleText }}</div><div class="uc-stat-note">{{ t.ucPermLevel }}</div></div>
        <div class="uc-stat-card"><div class="uc-stat-label">{{ t.ucJoinDate }}</div><div class="uc-stat-value">{{ ucJoinDate }}</div><div class="uc-stat-note">{{ t.ucTsukuyomiJoin }}</div></div>
      </section>

      <section class="uc-layout">
        <aside class="panel uc-tabs-panel">
          <div class="uc-tabs">
            <button class="tab-btn" :class="{ active: uc.tab === 'profile' }" type="button" @click="uc.tab = 'profile'">{{ t.ucProfile }} <small>Profile</small></button>
            <button class="tab-btn" :class="{ active: uc.tab === 'articles' }" type="button" @click="uc.tab = 'articles'">{{ t.ucArticlesTab }} <small>Posts</small></button>
            <button class="tab-btn" :class="{ active: uc.tab === 'security' }" type="button" @click="uc.tab = 'security'">{{ t.ucSecurity }} <small>Security</small></button>
          </div>
        </aside>

        <section class="panel uc-content-panel">
          <div v-if="uc.tab === 'profile'">
            <div class="uc-section-head">
              <h2 class="uc-section-title"><span>01</span> {{ t.ucProfile }}</h2>
            </div>
            <div v-if="uc.profileMsg" class="form-message" :class="uc.profileMsgType">{{ uc.profileMsg }}</div>
            <div class="form-grid">
              <div class="form-group">
                <label>{{ t.ucUsername }}</label>
                <input type="text" disabled :value="ucUser?.username || ''">
                <div class="help-text">{{ t.ucUsernameHint }}</div>
              </div>
              <div class="form-group">
                <label>{{ t.ucEmail }}</label>
                <input type="email" disabled :value="ucUser?.email || ''">
              </div>
              <div class="form-group">
                <label>{{ t.ucBio }}</label>
                <textarea v-model="uc.profileBio" class="uc-profile-bio" maxlength="300" :placeholder="t.ucBioPlaceholder"></textarea>
                <div class="help-text">{{ uc.profileBio.length || 0 }} / 300</div>
              </div>
              <div>
                <button class="primary-btn" type="button" :disabled="uc.profileSaving" @click="ucSaveProfile">{{ t.ucSaveProfile }}</button>
              </div>
            </div>
          </div>

          <div v-if="uc.tab === 'articles'">
            <div class="uc-section-head">
              <h2 class="uc-section-title"><span>02</span> {{ t.ucArticlesTab }}</h2>
              <div class="uc-article-tools">
                <input v-model="uc.articleQuery" class="uc-search" type="search" :placeholder="t.ucSearchArticles">
                <a class="primary-btn" href="/editor" @click.prevent="go('/editor')">{{ t.ucWriteNew }}</a>
              </div>
            </div>
            <div v-if="uc.articleLoading" class="uc-empty">{{ t.ucLoadingArticles }}</div>
            <div v-else-if="!ucFilteredArticles.length" class="uc-empty">
              <div style="font-weight:700;color:#fff;margin-bottom:0.45rem;">{{ t.ucNoArticles }}</div>
              <div style="margin-bottom:1rem;">{{ t.ucNoArticlesHint }}</div>
              <a class="primary-btn" href="/editor" @click.prevent="go('/editor')">{{ t.ucNewPost }}</a>
            </div>
            <div v-else class="uc-article-list">
              <article v-for="article in ucFilteredArticles" :key="article.id" class="uc-article-item">
                <div>
                  <div class="uc-article-title">{{ article.title || t.ucUntitled }}</div>
                  <div class="uc-article-meta">
                    <span class="uc-status-pill">{{ article.status || 'published' }}</span>
                    <span>{{ article.category || '' }}</span>
                    <span>{{ t.ucReading }} {{ (article.view_count || 0).toLocaleString() }}</span>
                    <span>{{ ucFormatDate(article.created_at) }}</span>
                  </div>
                </div>
                <div class="uc-article-actions">
                  <a class="icon-btn" :href="'/article?id=' + article.id" @click.prevent="go('/article?id=' + article.id)">{{ t.ucView }}</a>
                  <button class="icon-btn" type="button" @click="ucEditArticle(article.id)">{{ t.ucEdit }}</button>
                  <button class="danger-btn" type="button" @click="ucDeleteArticle(article.id)">{{ t.ucDelete }}</button>
                </div>
              </article>
            </div>
          </div>

          <div v-if="uc.tab === 'security'">
            <div class="uc-section-head">
              <h2 class="uc-section-title"><span>03</span> {{ t.ucSecurity }}</h2>
            </div>
            <div v-if="uc.passwordMsg" class="form-message" :class="uc.passwordMsgType">{{ uc.passwordMsg }}</div>
            <div class="uc-security-grid">
              <div>
                <div class="form-grid">
                  <div class="form-group">
                    <label>{{ t.ucCurrentPassword }}</label>
                    <input v-model="uc.password.current" type="password" autocomplete="current-password" :placeholder="t.ucCurrentPasswordPh">
                  </div>
                  <div class="form-group">
                    <label>{{ t.ucNewPassword }}</label>
                    <input v-model="uc.password.next" type="password" autocomplete="new-password" :placeholder="t.ucNewPasswordPh">
                  </div>
                  <div class="form-group">
                    <label>{{ t.ucConfirmNewPassword }}</label>
                    <input v-model="uc.password.confirm" type="password" autocomplete="new-password" :placeholder="t.ucConfirmNewPasswordPh">
                  </div>
                  <div>
                    <button class="primary-btn" type="button" :disabled="uc.passwordChanging" @click="ucChangePassword">{{ t.ucChangePassword }}</button>
                  </div>
                </div>
              </div>
              <aside class="uc-security-card">
                <h3>{{ t.ucSecurityTip }}</h3>
                <p>{{ t.ucSecurityTipText }}</p>
                <div style="margin-top:1rem;">
                  <button class="danger-btn" type="button" @click="logout">{{ t.ucExitLogin }}</button>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </section>
    </template>

    <div v-if="ucToast.visible" class="plaza-toast show">{{ ucToast.text }}</div>
  </main>
</template>
