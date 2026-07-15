<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { authFetch, authHeaders, loadCurrentSession, logoutSession, noStoreUrl, parseResponse, updateStoredUser } from '../api/client';
import PixelCanvasCells from '../components/PixelCanvasCells.vue';
import TsIcon from '../components/TsIcon.vue';
import { compressImage } from '../utils/image';
import { formatDateOnly } from '../utils/time';

const props = defineProps({
  lang: { type: String, required: true },
  t: { type: Object, required: true },
  user: { type: Object, default: null }
});

const emit = defineEmits(['auth-changed', 'go']);
const ucAvatarInput = ref(null);
const ucUser = ref(props.user || null);
const sessionChecking = ref(!props.user);
const ucToast = reactive({ text: '', visible: false });
let ucToastTimer = 0;
let loadedUserId = '';
const pixelFallbackPalette = ['#0b1020', '#ffffff', '#aef2ff', '#7b8cf6', '#ff9aba', '#f1d98e'];

const uc = reactive({
  tab: 'profile',
  profileMsg: '',
  profileMsgType: 'error',
  passwordMsg: '',
  passwordMsgType: 'error',
  profileSaving: false,
  profileLoading: false,
  profileError: '',
  passwordChanging: false,
  articles: [],
  messages: [],
  bookmarks: [],
  pixelArtworks: [],
  articleQuery: '',
  messageQuery: '',
  bookmarkQuery: '',
  pixelQuery: '',
  articleLoading: true,
  articleError: '',
  messageLoading: true,
  messageError: '',
  bookmarkLoading: true,
  bookmarkError: '',
  pixelLoading: true,
  pixelError: '',
  pixelDeleting: '',
  messageEditing: '',
  messageSaving: '',
  messageDeleting: '',
  messageDrafts: {},
  avatarUploading: false,
  profileBio: '',
  password: {
    current: '',
    next: '',
    confirm: ''
  }
});

const isAuthed = computed(() => Boolean(ucUser.value));
const ucRefreshing = computed(() => uc.profileLoading || uc.articleLoading || uc.messageLoading || uc.bookmarkLoading || uc.pixelLoading);
const isAdminUser = computed(() => ['admin', 'super_admin'].includes(ucUser.value?.role) || ucUser.value?.scope === 'admin');
const locale = computed(() => props.lang === 'zh' ? 'zh-CN' : 'ja-JP');
const ucAvatarSrc = computed(() => ucUser.value?.avatar || ucDefaultAvatar(ucUser.value?.username));
const ucRoleText = computed(() => {
  if (!ucUser.value) return '';
  return isAdminUser.value ? props.t.ucAdmin : props.t.ucUser;
});
const ucEmailText = computed(() => ucUser.value?.email || (props.lang === 'zh' ? '未绑定邮箱' : 'メール未連携'));
const ucArticlesCount = computed(() => uc.articles.length.toLocaleString(locale.value));
const ucPixelArtworkCount = computed(() => uc.pixelArtworks.length.toLocaleString(locale.value));
const ucTotalViews = computed(() => {
  const total = uc.articles.reduce((sum, article) => sum + Number(article.view_count || 0), 0);
  return total.toLocaleString(locale.value);
});
const ucJoinDate = computed(() => {
  if (!ucUser.value?.created_at) return '-';
  return formatDateOnly(ucUser.value.created_at, locale.value);
});
const ucOAuthAccounts = computed(() => Array.isArray(ucUser.value?.oauth_accounts) ? ucUser.value.oauth_accounts : []);
const ucQQAccount = computed(() => ucOAuthAccounts.value.find((account) => account?.provider === 'qq') || null);
const ucQQSyncing = computed(() => uc.profileLoading && !Array.isArray(ucUser.value?.oauth_accounts));
const ucQQBound = computed(() => Boolean(ucQQAccount.value));
const ucQQBoundDate = computed(() => {
  if (!ucQQAccount.value?.created_at) return '';
  return formatDateOnly(ucQQAccount.value.created_at, locale.value);
});
const ucQQDisplayName = computed(() => ucQQAccount.value?.nickname || ucUser.value?.username || 'QQ');
const ucQQStatusText = computed(() => {
  if (ucQQSyncing.value) return '同步中';
  return ucQQBound.value ? '已绑定' : '未绑定';
});
const ucQQDescription = computed(() => {
  if (ucQQSyncing.value) return '正在同步最新账号绑定状态，请稍候。';
  return ucQQBound.value
    ? `已连接 ${ucQQDisplayName.value}，可使用 QQ 或邮箱登录同一账号。`
    : '未连接 QQ。登录页使用 QQ 授权后，可绑定到当前账号。';
});
const ucFilteredArticles = computed(() => {
  if (!uc.articleQuery) return uc.articles;
  const q = uc.articleQuery.toLowerCase();
  return uc.articles.filter((article) => `${article.title || ''} ${article.category || ''}`.toLowerCase().includes(q));
});
const ucFilteredMessages = computed(() => {
  if (!uc.messageQuery) return uc.messages;
  const q = uc.messageQuery.toLowerCase();
  return uc.messages.filter((message) => `${message.content || ''} ${message.article_title || ''} ${message.status || ''}`.toLowerCase().includes(q));
});
const ucFilteredBookmarks = computed(() => {
  if (!uc.bookmarkQuery) return uc.bookmarks;
  const q = uc.bookmarkQuery.toLowerCase();
  return uc.bookmarks.filter((article) => `${article.title || ''} ${article.category || ''} ${article.author_username || ''}`.toLowerCase().includes(q));
});
const ucFilteredPixelArtworks = computed(() => {
  if (!uc.pixelQuery) return uc.pixelArtworks;
  const q = uc.pixelQuery.toLowerCase();
  return uc.pixelArtworks.filter((artwork) => `${artwork.title || ''} ${artwork.description || ''} ${artwork.author || ''}`.toLowerCase().includes(q));
});

function go(path) {
  emit('go', path);
}

function articlePath(article) {
  return `/articles/${encodeURIComponent(article.id)}${article.slug ? `/${encodeURIComponent(article.slug)}` : ''}`;
}

function messagePath(message) {
  const anchorId = message.parent_id || message.id;
  if (!message.article_id) return `/plaza#msg-${encodeURIComponent(anchorId)}`;
  const slug = message.article_slug ? `/${encodeURIComponent(message.article_slug)}` : '';
  return `/articles/${encodeURIComponent(message.article_id)}${slug}#comment-${encodeURIComponent(anchorId)}`;
}

function messageSource(message) {
  return message.article_id ? (message.article_title || `文章 #${message.article_id}`) : '留言墙';
}

function pixelArtworkPath(artwork) {
  return `/pixel?art=${encodeURIComponent(artwork.id)}#pixel-art-${encodeURIComponent(artwork.id)}`;
}

function pixelArtworkEditPath(artwork) {
  return `/pixel?edit=${encodeURIComponent(artwork.id)}`;
}

async function logout() {
  await logoutSession();
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
  return formatDateOnly(value, locale.value);
}

function pixelArtworkDimension(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function pixelArtworkWidth(artwork) {
  return pixelArtworkDimension(artwork?.width ?? artwork?.size, 96);
}

function pixelArtworkHeight(artwork) {
  return pixelArtworkDimension(artwork?.height ?? artwork?.size, 54);
}

function pixelArtworkPalette(artwork) {
  return Array.isArray(artwork?.palette) && artwork.palette.length ? artwork.palette : pixelFallbackPalette;
}

function pixelArtworkPixels(artwork) {
  return Array.isArray(artwork?.pixels) ? artwork.pixels : [];
}

function pixelArtworkBackground(artwork) {
  return artwork?.background_color || artwork?.backgroundColor || '#0b1020';
}

async function ucLoadProfile() {
  uc.profileLoading = true;
  uc.profileError = '';
  if (!isAuthed.value) {
    uc.profileLoading = false;
    return;
  }
  try {
    const response = await authFetch(noStoreUrl('/api/user/profile'), {
      headers: authHeaders(),
      cache: 'no-store'
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.ucProfileLoadFailed);
    ucUser.value = result.data;
    uc.profileBio = result.data?.bio || '';
    loadedUserId = result.data?.id || '';
    updateStoredUser(result.data);
  } catch (error) {
    uc.profileError = error.message || props.t.ucProfileLoadFailed;
    ucShowToast(error.message || props.t.ucProfileLoadFailed);
  } finally {
    uc.profileLoading = false;
  }
}

async function ucLoadArticles() {
  uc.articleLoading = true;
  uc.articleError = '';
  if (!isAuthed.value) {
    uc.articleLoading = false;
    return;
  }
  try {
    const response = await authFetch(`/api/user/articles/live/${Date.now()}`, {
      headers: authHeaders(),
      cache: 'no-store'
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.ucArticleLoadFailed);
    uc.articles = result.data || [];
  } catch (error) {
    uc.articles = [];
    uc.articleError = error.message || props.t.ucArticleLoadFailed;
    ucShowToast(error.message || props.t.ucArticleLoadFailed);
  } finally {
    uc.articleLoading = false;
  }
}

async function ucLoadBookmarks() {
  uc.bookmarkLoading = true;
  uc.bookmarkError = '';
  if (!isAuthed.value) {
    uc.bookmarkLoading = false;
    return;
  }
  try {
    const response = await authFetch(`/api/user/bookmarks?limit=80&_=${Date.now()}`, {
      headers: authHeaders(),
      cache: 'no-store'
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || '收藏列表读取失败');
    uc.bookmarks = Array.isArray(result.data) ? result.data : [];
  } catch (error) {
    uc.bookmarks = [];
    uc.bookmarkError = error.message || '收藏列表读取失败';
    ucShowToast(error.message || '收藏列表读取失败');
  } finally {
    uc.bookmarkLoading = false;
  }
}

async function ucLoadMessages() {
  uc.messageLoading = true;
  uc.messageError = '';
  if (!isAuthed.value) {
    uc.messageLoading = false;
    return;
  }
  try {
    const response = await authFetch(`/api/messages/mine?limit=100&_=${Date.now()}`, {
      headers: authHeaders(),
      cache: 'no-store'
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || '留言列表读取失败');
    uc.messages = Array.isArray(result.data) ? result.data : [];
  } catch (error) {
    uc.messages = [];
    uc.messageError = error.message || '留言列表读取失败';
    ucShowToast(error.message || '留言列表读取失败');
  } finally {
    uc.messageLoading = false;
  }
}

async function ucLoadPixelArtworks() {
  uc.pixelLoading = true;
  uc.pixelError = '';
  if (!isAuthed.value) {
    uc.pixelLoading = false;
    return;
  }
  try {
    const response = await authFetch(`/api/pixel-art/manage?limit=100&_=${Date.now()}`, {
      headers: authHeaders(),
      cache: 'no-store'
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || '像素画列表读取失败');
    uc.pixelArtworks = Array.isArray(result.data) ? result.data : [];
  } catch (error) {
    uc.pixelArtworks = [];
    uc.pixelError = error.message || '像素画列表读取失败';
    ucShowToast(error.message || '像素画列表读取失败');
  } finally {
    uc.pixelLoading = false;
  }
}

async function ucRefresh() {
  await Promise.all([ucLoadProfile(), ucLoadArticles(), ucLoadMessages(), ucLoadBookmarks(), ucLoadPixelArtworks()]);
}

async function ucEnsureSession() {
  if (props.user) {
    ucUser.value = props.user;
    sessionChecking.value = false;
    return true;
  }

  sessionChecking.value = true;
  try {
    const currentSession = await loadCurrentSession();
    if (currentSession?.user) {
      ucUser.value = currentSession.user;
      return true;
    }
  } catch (_) {
    // The login notice below is the right fallback for an invalid session.
  } finally {
    sessionChecking.value = false;
  }

  ucUser.value = null;
  uc.profileBio = '';
  uc.articles = [];
  uc.messages = [];
  uc.bookmarks = [];
  uc.pixelArtworks = [];
  uc.profileError = '';
  uc.articleError = '';
  uc.messageError = '';
  uc.bookmarkError = '';
  uc.pixelError = '';
  uc.articleLoading = false;
  uc.messageLoading = false;
  uc.bookmarkLoading = false;
  uc.pixelLoading = false;
  return false;
}

async function ucSaveProfile() {
  const bio = uc.profileBio.trim();
  uc.profileSaving = true;
  try {
    const response = await authFetch('/api/user/profile', {
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
    const response = await authFetch('/api/user/avatar', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ avatar })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.ucAvatarUploadFailed);
    if (ucUser.value) ucUser.value.avatar = avatar;
    updateStoredUser(ucUser.value);
    emit('auth-changed');
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
    const response = await authFetch('/api/user/password', {
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
    const response = await authFetch(`/api/user/articles/${id}`, {
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

function ucStartMessageEdit(message) {
  uc.messageEditing = message.id;
  uc.messageDrafts[message.id] = message.content || '';
}

function ucCancelMessageEdit(id) {
  uc.messageEditing = '';
  delete uc.messageDrafts[id];
}

async function ucSaveMessage(message) {
  const content = String(uc.messageDrafts[message.id] || '').trim();
  if (!content) {
    ucShowToast('留言内容不能为空');
    return;
  }
  uc.messageSaving = message.id;
  try {
    const response = await authFetch(`/api/messages/${encodeURIComponent(message.id)}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ content })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || '留言更新失败');
    const index = uc.messages.findIndex(item => item.id === message.id);
    if (index >= 0) uc.messages.splice(index, 1, { ...uc.messages[index], ...result.data });
    ucCancelMessageEdit(message.id);
    ucShowToast(result.message || '留言已更新');
  } catch (error) {
    ucShowToast(error.message || '留言更新失败');
  } finally {
    uc.messageSaving = '';
  }
}

async function ucDeleteMessage(message) {
  if (!confirm('确定删除这条留言吗？删除后不可恢复。')) return;
  uc.messageDeleting = message.id;
  try {
    const response = await authFetch(`/api/messages/${encodeURIComponent(message.id)}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || '留言删除失败');
    uc.messages = uc.messages.filter(item => item.id !== message.id);
    ucShowToast(result.message || '留言已删除');
  } catch (error) {
    ucShowToast(error.message || '留言删除失败');
  } finally {
    uc.messageDeleting = '';
  }
}

function ucEditPixelArtwork(artwork) {
  emit('go', pixelArtworkEditPath(artwork));
}

async function ucDeletePixelArtwork(artwork) {
  if (!artwork?.id) return;
  const label = artwork.title ? `《${artwork.title}》` : '这幅像素画';
  if (!confirm(`确定删除${label}吗？删除后不可恢复。`)) return;
  uc.pixelDeleting = artwork.id;
  try {
    const response = await authFetch(`/api/pixel-art/${encodeURIComponent(artwork.id)}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || '像素画删除失败');
    uc.pixelArtworks = uc.pixelArtworks.filter(item => item.id !== artwork.id);
    ucShowToast(result.message || '像素画已删除');
  } catch (error) {
    ucShowToast(error.message || '像素画删除失败');
  } finally {
    uc.pixelDeleting = '';
  }
}

watch(() => props.user, (nextUser) => {
  if (!nextUser) {
    ucEnsureSession();
    return;
  }
  sessionChecking.value = false;
  ucUser.value = nextUser;
  uc.profileBio = nextUser.bio || '';
  const nextUserId = nextUser.id || '';
  if (nextUserId && nextUserId !== loadedUserId) ucRefresh();
});

onMounted(async () => {
  if (await ucEnsureSession()) await ucRefresh();
});
</script>

<template>
  <main class="page uc-page" :aria-busy="sessionChecking">
    <LoadingSkeleton v-if="sessionChecking" variant="profile" :count="1" :label="t.ucLoadingArticles" />

    <div v-else-if="!isAuthed" class="panel uc-login-notice">
      <div class="uc-login-notice-body">
        <div class="uc-eyebrow">User Center</div>
        <h1>{{ t.ucNeedLogin }}</h1>
        <p>{{ t.ucLoginPrompt }}</p>
        <a class="primary-btn" href="/login" @click.prevent="go('/login')">{{ t.ucGoLogin }}</a>
      </div>
    </div>

    <template v-else>
      <LoadingSkeleton v-if="uc.profileLoading" variant="profile" :count="1" label="正在同步个人资料" />
      <div v-else-if="uc.profileError" class="uc-empty" role="alert">{{ uc.profileError }}</div>
      <template v-else>
      <section class="uc-hero" :aria-busy="uc.avatarUploading">
        <div class="uc-avatar-block">
          <div class="uc-avatar-upload" :title="t.ucChangeAvatar" @click="ucAvatarInput?.click()">
            <img :src="ucAvatarSrc" alt="">
            <span class="uc-avatar-edit" aria-hidden="true">
              <TsIcon name="penLine" :size="17" />
            </span>
          </div>
          <input ref="ucAvatarInput" type="file" accept="image/*" style="display:none;" @change="ucUploadAvatar">
          <button class="ghost-btn uc-icon-action" type="button" :disabled="uc.avatarUploading" :aria-busy="uc.avatarUploading" @click="ucAvatarInput?.click()">
            <TsIcon :class="{ 'ts-status-loader-icon': uc.avatarUploading }" :name="uc.avatarUploading ? 'loader' : 'upload'" :size="17" />
            <span :role="uc.avatarUploading ? 'status' : undefined">{{ uc.avatarUploading ? '正在上传头像' : t.ucUploadAvatar }}</span>
          </button>
        </div>
        <div class="uc-hero-info">
          <div class="uc-role-badge">
            <TsIcon :name="ucUser?.role === 'admin' ? 'crown' : 'user'" :size="15" />
            <span>{{ ucRoleText }}</span>
          </div>
          <h1 class="uc-username">{{ ucUser?.username || '-' }}</h1>
          <div class="uc-email">{{ ucEmailText }}</div>
          <p class="uc-bio-preview">{{ ucUser?.bio || t.ucNoBio }}</p>
        </div>
        <div class="uc-hero-actions">
          <a class="primary-btn uc-icon-action" href="/editor" @click.prevent="go('/editor')">
            <TsIcon name="penLine" :size="17" />
            <span>{{ t.ucNewPost }}</span>
          </a>
          <a class="ghost-btn uc-icon-action" :href="`/users/${encodeURIComponent(ucUser?.username || '')}`" @click.prevent="go(`/users/${encodeURIComponent(ucUser?.username || '')}`)">
            <TsIcon name="user" :size="17" />
            <span>&#20844;&#24320;&#20027;&#39029;</span>
          </a>
          <a class="ghost-btn uc-icon-action" href="/stage" @click.prevent="go('/stage')">
            <TsIcon name="book" :size="17" />
            <span>{{ t.ucViewStage }}</span>
          </a>
          <button class="ghost-btn uc-icon-action" type="button" :disabled="ucRefreshing" :aria-busy="ucRefreshing" @click="ucRefresh">
            <TsIcon name="refresh" :size="17" />
            <span>{{ t.ucRefresh }}</span>
          </button>
          <button class="danger-btn uc-icon-action" type="button" @click="logout">
            <TsIcon name="logOut" :size="17" />
            <span>{{ t.ucLogout }}</span>
          </button>
        </div>
      </section>

      <section class="uc-stats">
        <div class="uc-stat-card">
          <div class="uc-stat-icon"><TsIcon name="fileText" :size="27" /></div>
          <div>
            <div class="uc-stat-label">{{ t.ucMyArticles }}</div>
            <div class="uc-stat-value">{{ ucArticlesCount }}</div>
            <div class="uc-stat-note">{{ t.ucPostsTotal }}</div>
          </div>
        </div>
        <div class="uc-stat-card">
          <div class="uc-stat-icon"><TsIcon name="layers" :size="28" /></div>
          <div>
            <div class="uc-stat-label">{{ t.ucTotalViews }}</div>
            <div class="uc-stat-value">{{ ucTotalViews }}</div>
            <div class="uc-stat-note">{{ t.ucArticleViews }}</div>
          </div>
        </div>
        <div class="uc-stat-card">
          <div class="uc-stat-icon"><TsIcon name="crown" :size="29" /></div>
          <div>
            <div class="uc-stat-label">{{ t.ucAccountRole }}</div>
            <div class="uc-stat-value">{{ ucRoleText }}</div>
            <div class="uc-stat-note">{{ t.ucPermLevel }}</div>
          </div>
        </div>
        <div class="uc-stat-card">
          <div class="uc-stat-icon"><TsIcon name="calendar" :size="27" /></div>
          <div>
            <div class="uc-stat-label">{{ t.ucJoinDate }}</div>
            <div class="uc-stat-value">{{ ucJoinDate }}</div>
            <div class="uc-stat-note">{{ t.ucTsukuyomiJoin }}</div>
          </div>
        </div>
      </section>
      </template>

      <section class="uc-layout">
        <aside class="panel uc-tabs-panel">
          <div class="uc-tabs">
            <button class="tab-btn" :class="{ active: uc.tab === 'profile' }" type="button" @click="uc.tab = 'profile'">
              <span><TsIcon name="user" :size="18" /> {{ t.ucProfile }}</span>
              <small>Profile</small>
            </button>
            <button class="tab-btn" :class="{ active: uc.tab === 'articles' }" type="button" @click="uc.tab = 'articles'">
              <span><TsIcon name="fileText" :size="18" /> {{ t.ucArticlesTab }}</span>
              <small>Posts</small>
            </button>
            <button class="tab-btn" :class="{ active: uc.tab === 'messages' }" type="button" @click="uc.tab = 'messages'">
              <span><TsIcon name="message" :size="18" /> 我的留言</span>
              <small>{{ uc.messages.length }}</small>
            </button>
            <button class="tab-btn" :class="{ active: uc.tab === 'bookmarks' }" type="button" @click="uc.tab = 'bookmarks'">
              <span><TsIcon name="bookmark" :size="18" /> &#25105;&#30340;&#25910;&#34255;</span>
              <small>Bookmarks</small>
            </button>
            <button class="tab-btn" :class="{ active: uc.tab === 'pixelArt' }" type="button" @click="uc.tab = 'pixelArt'">
              <span><TsIcon name="palette" :size="18" /> 像素画</span>
              <small>{{ isAdminUser ? 'All Pixel Art' : ucPixelArtworkCount }}</small>
            </button>
            <button class="tab-btn uc-asset-tab" type="button" @click="go('/gallery/manage')">
              <span><TsIcon name="image" :size="18" /> &#22270;&#24211;&#31649;&#29702;</span>
              <small>Gallery</small>
            </button>
            <button class="tab-btn uc-asset-tab" type="button" @click="go('/attachments')">
              <span><TsIcon name="paperclip" :size="18" /> &#38468;&#20214;&#24211;</span>
              <small>Assets</small>
            </button>
            <button class="tab-btn" :class="{ active: uc.tab === 'security' }" type="button" @click="uc.tab = 'security'">
              <span><TsIcon name="shield" :size="18" /> {{ t.ucSecurity }}</span>
              <small>Security</small>
            </button>
          </div>
        </aside>

        <section class="panel uc-content-panel">
          <div v-if="uc.tab === 'profile'" :aria-busy="uc.profileSaving">
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
                <input type="text" disabled :value="ucEmailText">
              </div>
              <div class="form-group">
                <label>{{ t.ucBio }}</label>
                <textarea v-model="uc.profileBio" class="uc-profile-bio" maxlength="300" :placeholder="t.ucBioPlaceholder"></textarea>
                <div class="help-text">{{ uc.profileBio.length || 0 }} / 300</div>
              </div>
              <div>
                <button class="primary-btn uc-icon-action uc-save-btn" type="button" :disabled="uc.profileSaving" :aria-busy="uc.profileSaving" @click="ucSaveProfile">
                  <TsIcon name="penLine" :size="17" />
                  <span>{{ t.ucSaveProfile }}</span>
                </button>
                <StatusLoader v-if="uc.profileSaving" label="正在保存个人资料" compact />
              </div>
            </div>
          </div>

          <div v-if="uc.tab === 'articles'" :aria-busy="uc.articleLoading">
            <div class="uc-section-head">
              <h2 class="uc-section-title"><span>02</span> {{ t.ucArticlesTab }}</h2>
              <div class="uc-article-tools">
                <input v-model="uc.articleQuery" class="uc-search" type="search" :placeholder="t.ucSearchArticles">
                <a class="primary-btn uc-icon-action" href="/editor" @click.prevent="go('/editor')">
                  <TsIcon name="penLine" :size="17" />
                  <span>{{ t.ucWriteNew }}</span>
                </a>
              </div>
            </div>
            <LoadingSkeleton v-if="uc.articleLoading" variant="list" :count="5" :label="t.ucLoadingArticles" />
            <div v-else-if="uc.articleError" class="uc-empty error" role="alert">{{ uc.articleError }}</div>
            <div v-else-if="!ucFilteredArticles.length" class="uc-empty">
              <div class="ts-empty-title">{{ t.ucNoArticles }}</div>
              <div class="ts-empty-desc">{{ t.ucNoArticlesHint }}</div>
              <a class="primary-btn uc-icon-action" href="/editor" @click.prevent="go('/editor')">
                <TsIcon name="penLine" :size="17" />
                <span>{{ t.ucNewPost }}</span>
              </a>
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
                  <a class="icon-btn uc-icon-action" :href="articlePath(article)" @click.prevent="go(articlePath(article))">
                    <TsIcon name="eye" :size="16" />
                    <span>{{ t.ucView }}</span>
                  </a>
                  <button class="icon-btn uc-icon-action" type="button" @click="ucEditArticle(article.id)">
                    <TsIcon name="penLine" :size="16" />
                    <span>{{ t.ucEdit }}</span>
                  </button>
                  <button class="danger-btn uc-icon-action" type="button" @click="ucDeleteArticle(article.id)">
                    <TsIcon name="trash" :size="16" />
                    <span>{{ t.ucDelete }}</span>
                  </button>
                </div>
              </article>
            </div>
          </div>

          <div v-if="uc.tab === 'bookmarks'" :aria-busy="uc.bookmarkLoading">
            <div class="uc-section-head">
              <h2 class="uc-section-title"><span>04</span> 我的收藏</h2>
              <div class="uc-article-tools">
                <input v-model="uc.bookmarkQuery" class="uc-search" type="search" placeholder="搜索收藏文章">
                <button class="ghost-btn uc-icon-action" type="button" :disabled="uc.bookmarkLoading" :aria-busy="uc.bookmarkLoading" @click="ucLoadBookmarks">
                  <TsIcon name="refresh" :size="17" />
                  <span>&#21047;&#26032;</span>
                </button>
              </div>
            </div>
            <LoadingSkeleton v-if="uc.bookmarkLoading" variant="list" :count="5" label="正在加载收藏列表" />
            <div v-else-if="uc.bookmarkError" class="uc-empty error" role="alert">{{ uc.bookmarkError }}</div>
            <div v-else-if="!ucFilteredBookmarks.length" class="uc-empty">
              <div class="ts-empty-title">还没有收藏文章</div>
              <div class="ts-empty-desc">在文章页点击收藏后，会在这里形成你的阅读清单。</div>
              <a class="primary-btn" href="/stage" @click.prevent="go('/stage')">去主舞台看看</a>
            </div>
            <div v-else class="uc-article-list">
              <article v-for="article in ucFilteredBookmarks" :key="article.id" class="uc-article-item">
                <div>
                  <div class="uc-article-title">{{ article.title || t.ucUntitled }}</div>
                  <div class="uc-article-meta">
                    <span class="uc-status-pill">bookmarked</span>
                    <span>{{ article.category || '' }}</span>
                    <span>{{ article.author_username || 'admin' }}</span>
                    <span>{{ ucFormatDate(article.bookmarked_at) }}</span>
                  </div>
                </div>
                <div class="uc-article-actions">
                  <a class="icon-btn uc-icon-action" :href="articlePath(article)" @click.prevent="go(articlePath(article))">
                    <TsIcon name="eye" :size="16" />
                    <span>&#38405;&#35835;</span>
                  </a>
                </div>
              </article>
            </div>
          </div>

          <div v-if="uc.tab === 'messages'" :aria-busy="uc.messageLoading">
            <div class="uc-section-head">
              <h2 class="uc-section-title"><span>03</span> 我的留言</h2>
              <div class="uc-article-tools">
                <input v-model="uc.messageQuery" class="uc-search" type="search" placeholder="搜索留言">
                <button class="ghost-btn uc-icon-action" type="button" :disabled="uc.messageLoading" :aria-busy="uc.messageLoading" @click="ucLoadMessages">
                  <TsIcon name="refresh" :size="17" />
                  <span>刷新</span>
                </button>
              </div>
            </div>
            <LoadingSkeleton v-if="uc.messageLoading" variant="list" :count="5" label="正在加载留言列表" />
            <div v-else-if="uc.messageError" class="uc-empty error" role="alert">{{ uc.messageError }}</div>
            <div v-else-if="!ucFilteredMessages.length" class="uc-empty">
              <div class="ts-empty-title">还没有留言</div>
              <a class="primary-btn uc-icon-action" href="/plaza" @click.prevent="go('/plaza')">
                <TsIcon name="message" :size="17" />
                <span>去留言墙</span>
              </a>
            </div>
            <div v-else class="uc-article-list uc-message-list">
              <article v-for="message in ucFilteredMessages" :id="`uc-message-${message.id}`" :key="message.id" class="uc-article-item uc-message-item" :aria-busy="uc.messageSaving === message.id || uc.messageDeleting === message.id">
                <div>
                  <textarea
                    v-if="uc.messageEditing === message.id"
                    v-model="uc.messageDrafts[message.id]"
                    class="uc-message-editor"
                    maxlength="2000"
                    aria-label="编辑留言"
                  ></textarea>
                  <div v-else class="uc-article-title uc-message-content">{{ message.content }}</div>
                  <div class="uc-article-meta">
                    <span class="uc-status-pill">{{ message.status === 'approved' ? '已通过' : '待审核' }}</span>
                    <span>{{ messageSource(message) }}</span>
                    <span v-if="message.reply_count">{{ message.reply_count }} 回复</span>
                    <span>{{ ucFormatDate(message.updated_at || message.created_at) }}</span>
                  </div>
                </div>
                <div class="uc-article-actions">
                  <template v-if="uc.messageEditing === message.id">
                    <button class="primary-btn uc-icon-action" type="button" :disabled="uc.messageSaving === message.id" :aria-busy="uc.messageSaving === message.id" @click="ucSaveMessage(message)">
                      <TsIcon name="userCheck" :size="16" />
                      <span :role="uc.messageSaving === message.id ? 'status' : undefined">{{ uc.messageSaving === message.id ? '保存中' : '保存' }}</span>
                    </button>
                    <button class="ghost-btn uc-icon-action" type="button" :disabled="uc.messageSaving === message.id" @click="ucCancelMessageEdit(message.id)">
                      <TsIcon name="x" :size="16" />
                      <span>取消</span>
                    </button>
                  </template>
                  <template v-else>
                    <a class="icon-btn uc-icon-action" :href="messagePath(message)" @click.prevent="go(messagePath(message))">
                      <TsIcon name="eye" :size="16" />
                      <span>查看</span>
                    </a>
                    <button class="icon-btn uc-icon-action" type="button" @click="ucStartMessageEdit(message)">
                      <TsIcon name="penLine" :size="16" />
                      <span>编辑</span>
                    </button>
                    <button class="danger-btn uc-icon-action" type="button" :disabled="uc.messageDeleting === message.id" :aria-busy="uc.messageDeleting === message.id" @click="ucDeleteMessage(message)">
                      <TsIcon name="trash" :size="16" />
                      <span :role="uc.messageDeleting === message.id ? 'status' : undefined">{{ uc.messageDeleting === message.id ? '删除中' : '删除' }}</span>
                    </button>
                  </template>
                </div>
              </article>
            </div>
          </div>

          <div v-if="uc.tab === 'pixelArt'" :aria-busy="uc.pixelLoading">
            <div class="uc-section-head">
              <h2 class="uc-section-title"><span>05</span> {{ isAdminUser ? '全站像素画管理' : '我的像素画' }}</h2>
              <div class="uc-article-tools">
                <input v-model="uc.pixelQuery" class="uc-search" type="search" placeholder="搜索像素画">
                <a class="primary-btn uc-icon-action" href="/pixel" @click.prevent="go('/pixel')">
                  <TsIcon name="palette" :size="17" />
                  <span>新建像素画</span>
                </a>
                <button class="ghost-btn uc-icon-action" type="button" :disabled="uc.pixelLoading" :aria-busy="uc.pixelLoading" @click="ucLoadPixelArtworks">
                  <TsIcon name="refresh" :size="17" />
                  <span>刷新</span>
                </button>
              </div>
            </div>
            <LoadingSkeleton v-if="uc.pixelLoading" variant="pixel" :count="4" label="正在加载像素画列表" />
            <div v-else-if="uc.pixelError" class="uc-empty error" role="alert">{{ uc.pixelError }}</div>
            <div v-else-if="!ucFilteredPixelArtworks.length" class="uc-empty">
              <div class="ts-empty-title">还没有像素画</div>
              <div class="ts-empty-desc">从月光像素工坊开始新建作品，发布后会在这里管理。</div>
              <a class="primary-btn uc-icon-action" href="/pixel" @click.prevent="go('/pixel')">
                <TsIcon name="palette" :size="17" />
                <span>去新建像素画</span>
              </a>
            </div>
            <div v-else class="uc-pixel-grid">
              <article v-for="artwork in ucFilteredPixelArtworks" :key="artwork.id" class="uc-pixel-card" :aria-busy="uc.pixelDeleting === artwork.id">
                <div class="uc-pixel-preview" :style="{ '--pixel-bg': pixelArtworkBackground(artwork) }">
                  <PixelCanvasCells
                    :pixels="pixelArtworkPixels(artwork)"
                    :palette="pixelArtworkPalette(artwork)"
                    :width="pixelArtworkWidth(artwork)"
                    :height="pixelArtworkHeight(artwork)"
                    :cell-size="1"
                    :background-color="pixelArtworkBackground(artwork)"
                    :show-grid="false"
                    :interactive="false"
                    :aria-label="artwork.title || '像素画'"
                  />
                </div>
                <div class="uc-pixel-body">
                  <div class="uc-pixel-title-row">
                    <h3>{{ artwork.title || '未命名像素画' }}</h3>
                    <span>#{{ artwork.id }}</span>
                  </div>
                  <p v-if="artwork.description">{{ artwork.description }}</p>
                  <div class="uc-article-meta">
                    <span class="uc-status-pill">{{ pixelArtworkWidth(artwork) }}x{{ pixelArtworkHeight(artwork) }}</span>
                    <span v-if="isAdminUser">{{ artwork.author || '未知作者' }}</span>
                    <span>{{ (artwork.like_count || 0).toLocaleString(locale) }} 喜欢</span>
                    <span>{{ ucFormatDate(artwork.created_at) }}</span>
                  </div>
                </div>
                <div class="uc-article-actions uc-pixel-actions">
                  <a class="icon-btn uc-icon-action" :href="pixelArtworkPath(artwork)" @click.prevent="go(pixelArtworkPath(artwork))">
                    <TsIcon name="eye" :size="16" />
                    <span>查看</span>
                  </a>
                  <button class="icon-btn uc-icon-action" type="button" @click="ucEditPixelArtwork(artwork)">
                    <TsIcon name="penLine" :size="16" />
                    <span>编辑</span>
                  </button>
                  <button class="danger-btn uc-icon-action" type="button" :disabled="uc.pixelDeleting === artwork.id" :aria-busy="uc.pixelDeleting === artwork.id" @click="ucDeletePixelArtwork(artwork)">
                    <TsIcon name="trash" :size="16" />
                    <span :role="uc.pixelDeleting === artwork.id ? 'status' : undefined">{{ uc.pixelDeleting === artwork.id ? '删除中' : '删除' }}</span>
                  </button>
                </div>
              </article>
            </div>
          </div>

          <div v-if="uc.tab === 'security'" :aria-busy="uc.passwordChanging">
            <div class="uc-section-head">
              <h2 class="uc-section-title"><span>06</span> {{ t.ucSecurity }}</h2>
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
                    <button class="primary-btn uc-icon-action" type="button" :disabled="uc.passwordChanging" :aria-busy="uc.passwordChanging" @click="ucChangePassword">
                      <TsIcon name="lock" :size="17" />
                      <span>{{ t.ucChangePassword }}</span>
                    </button>
                    <StatusLoader v-if="uc.passwordChanging" label="正在更新密码" compact />
                  </div>
                </div>
              </div>
              <aside class="uc-security-card">
                <div class="uc-oauth-status" :class="{ bound: ucQQBound }">
                  <div class="uc-oauth-icon">
                    <TsIcon name="shield" :size="20" />
                  </div>
                  <div class="uc-oauth-main">
                    <div class="uc-oauth-title">
                      <span>QQ 登录</span>
                      <strong>{{ ucQQStatusText }}</strong>
                    </div>
                    <p>{{ ucQQDescription }}</p>
                    <small v-if="ucQQBoundDate">绑定于 {{ ucQQBoundDate }}</small>
                  </div>
                </div>
                <h3>{{ t.ucSecurityTip }}</h3>
                <p>{{ t.ucSecurityTipText }}</p>
                <div style="margin-top:1rem;">
                  <button class="danger-btn uc-icon-action" type="button" @click="logout">
                    <TsIcon name="logOut" :size="17" />
                    <span>{{ t.ucExitLogin }}</span>
                  </button>
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
