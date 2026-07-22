<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { authFetch, parseResponse } from '../api/client';
import TsIcon from '../components/TsIcon.vue';
import { formatDateTime } from '../utils/time';

const props = defineProps({
  lang: { type: String, required: true },
  user: { type: Object, default: null }
});

const emit = defineEmits(['go']);
const form = reactive({
  name: '',
  url: '',
  description: '',
  avatar_url: '',
  backlink_url: '',
  note: ''
});
const submitting = ref(false);
const discoveringAvatar = ref(false);
const avatarPreviewFailed = ref(false);
const loadingApplications = ref(false);
const applications = ref([]);
const errorMessage = ref('');
const successMessage = ref('');

const isZh = computed(() => props.lang === 'zh');
const isAuthed = computed(() => Boolean(props.user?.id));
const recentApplications = computed(() => applications.value.slice(0, 3));
const copy = computed(() => props.lang === 'en' ? {
  eyebrow: 'Friend Link',
  title: 'Apply for a Link Exchange',
  subtitle: 'Enter your site details. Approved sites will appear in Tsukuyomi Plaza.',
  back: 'Back to partner sites',
  formTitle: 'Site information',
  name: 'Site name',
  namePlaceholder: 'Your site name',
  url: 'Site URL',
  urlPlaceholder: 'https://example.com',
  description: 'Site description',
  descriptionPlaceholder: 'Introduce your site in one sentence',
  avatar: 'Avatar URL',
  avatarPlaceholder: 'https://example.com/avatar.png',
  autoAvatar: 'Auto-detect',
  detectingAvatar: 'Detecting',
  enterSiteFirst: 'Enter the site URL first',
  advanced: 'Additional information',
  backlink: 'Backlink URL (optional)',
  backlinkPlaceholder: 'https://example.com/links',
  note: 'Notes (optional)',
  notePlaceholder: 'Anything else we should know',
  submit: 'Submit application',
  submitting: 'Submitting',
  loginTitle: 'Sign in to apply',
  loginDesc: 'Your applications are linked to your account so you can track their status.',
  login: 'Sign in',
  successTitle: 'Application submitted',
  successDesc: 'You can track the review status on this page.',
  requirements: 'Listing requirements',
  reachable: 'The site is publicly accessible',
  safe: 'The content is legal and contains no malicious redirects',
  reciprocal: 'Adding a backlink is recommended',
  history: 'My applications',
  empty: 'No applications yet',
  pending: 'Under review',
  active: 'Listed',
  rejected: 'Not approved',
  loadFailed: 'Unable to load applications',
  loading: 'Loading applications',
  submitFailed: 'Unable to submit application'
} : isZh.value ? {
  eyebrow: 'Friend Link',
  title: '友链申请',
  subtitle: '填写站点信息，审核通过后将在月读广场展示。',
  back: '返回友链',
  formTitle: '站点信息',
  name: '站点名称',
  namePlaceholder: '你的站点名称',
  url: '站点地址',
  urlPlaceholder: 'https://example.com',
  description: '站点简介',
  descriptionPlaceholder: '用一句话介绍你的站点',
  avatar: '头像链接',
  avatarPlaceholder: 'https://example.com/avatar.png',
  autoAvatar: '自动获取',
  detectingAvatar: '获取中',
  enterSiteFirst: '请先填写站点链接',
  advanced: '补充信息',
  backlink: '回链地址（选填）',
  backlinkPlaceholder: 'https://example.com/links',
  note: '备注（选填）',
  notePlaceholder: '需要说明的内容',
  submit: '提交申请',
  submitting: '提交中',
  loginTitle: '登录后申请',
  loginDesc: '申请记录将绑定当前账号，方便查看审核状态。',
  login: '去登录',
  successTitle: '申请已提交',
  successDesc: '审核结果会保留在本页。',
  requirements: '收录条件',
  reachable: '站点可正常访问',
  safe: '内容合法且无恶意跳转',
  reciprocal: '建议添加本站友链',
  history: '我的申请',
  empty: '还没有申请记录',
  pending: '审核中',
  active: '已收录',
  rejected: '未通过',
  loadFailed: '申请记录读取失败',
  loading: '正在读取申请记录',
  submitFailed: '申请提交失败'
} : {
  eyebrow: 'Friend Link',
  title: '相互リンク申請',
  subtitle: 'サイト情報を入力してください。承認後、月読広場に表示されます。',
  back: '相互リンクへ戻る',
  formTitle: 'サイト情報',
  name: 'サイト名',
  namePlaceholder: 'サイト名',
  url: 'サイト URL',
  urlPlaceholder: 'https://example.com',
  description: 'サイト紹介',
  descriptionPlaceholder: 'サイトを一文で紹介してください',
  avatar: 'アバター URL',
  avatarPlaceholder: 'https://example.com/avatar.png',
  autoAvatar: '自動取得',
  detectingAvatar: '取得中',
  enterSiteFirst: '先にサイト URL を入力してください',
  advanced: '追加情報',
  backlink: '相互リンク URL（任意）',
  backlinkPlaceholder: 'https://example.com/links',
  note: '備考（任意）',
  notePlaceholder: '補足事項',
  submit: '申請を送信',
  submitting: '送信中',
  loginTitle: 'ログインして申請',
  loginDesc: '申請履歴は現在のアカウントに保存されます。',
  login: 'ログイン',
  successTitle: '申請を受け付けました',
  successDesc: '審査状況はこのページで確認できます。',
  requirements: '掲載条件',
  reachable: 'サイトに正常にアクセスできる',
  safe: '安全で適法なコンテンツ',
  reciprocal: '相互リンクを推奨',
  history: '申請履歴',
  empty: '申請履歴はありません',
  pending: '審査中',
  active: '掲載中',
  rejected: '非承認',
  loadFailed: '申請履歴を読み込めませんでした',
  loading: '申請履歴を読み込み中',
  submitFailed: '申請を送信できませんでした'
});

function go(path) {
  emit('go', path);
}

function statusLabel(status) {
  return copy.value[status] || status;
}

function formatDate(value) {
  return value ? formatDateTime(value, props.lang === 'en' ? 'en-US' : (isZh.value ? 'zh-CN' : 'ja-JP')) : '';
}

function initial(name) {
  return String(name || '?').trim().slice(0, 1).toUpperCase();
}

async function discoverAvatar() {
  if (discoveringAvatar.value) return;
  if (!form.url.trim()) {
    errorMessage.value = copy.value.enterSiteFirst;
    return;
  }
  discoveringAvatar.value = true;
  errorMessage.value = '';
  try {
    const response = await authFetch('/api/friend-links/discover-avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: form.url.trim() })
    });
    const result = await parseResponse(response);
    if (!response.ok || !result.success || !result.data?.avatar_url) {
      throw new Error(result.message || copy.value.submitFailed);
    }
    form.avatar_url = result.data.avatar_url;
  } catch (error) {
    errorMessage.value = error.message || copy.value.submitFailed;
  } finally {
    discoveringAvatar.value = false;
  }
}

async function loadApplications() {
  if (!isAuthed.value) {
    applications.value = [];
    return;
  }
  loadingApplications.value = true;
  try {
    const response = await authFetch('/api/friend-links/mine', { cache: 'no-store' });
    const result = await parseResponse(response);
    if (!response.ok || !result.success) throw new Error(result.message || copy.value.loadFailed);
    applications.value = Array.isArray(result.data) ? result.data : [];
  } catch (error) {
    errorMessage.value = error.message || copy.value.loadFailed;
  } finally {
    loadingApplications.value = false;
  }
}

async function submitApplication() {
  if (!isAuthed.value || submitting.value) return;
  submitting.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const response = await authFetch('/api/friend-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        url: form.url.trim(),
        description: form.description.trim(),
        avatar_url: form.avatar_url.trim(),
        backlink_url: form.backlink_url.trim(),
        note: form.note.trim()
      })
    });
    const result = await parseResponse(response);
    if (!response.ok || !result.success) throw new Error(result.message || copy.value.submitFailed);
    successMessage.value = result.message || copy.value.successDesc;
    await loadApplications();
  } catch (error) {
    errorMessage.value = error.message || copy.value.submitFailed;
  } finally {
    submitting.value = false;
  }
}

watch(() => props.user?.id, loadApplications, { immediate: true });
watch(() => form.avatar_url, () => {
  avatarPreviewFailed.value = false;
});
</script>

<template>
  <main class="page friend-link-page">
    <header class="friend-link-hero" data-material="content">
      <button class="friend-link-back" type="button" @click="go('/friend-links')">
        <TsIcon name="arrowLeft" :size="18" />
        <span>{{ copy.back }}</span>
      </button>
      <div class="friend-link-hero-copy">
        <span class="friend-link-eyebrow">{{ copy.eyebrow }}</span>
        <h1>{{ copy.title }}</h1>
        <p>{{ copy.subtitle }}</p>
      </div>
      <div class="friend-link-hero-icon" aria-hidden="true">
        <TsIcon name="external" :size="30" :stroke-width="1.7" />
      </div>
    </header>

    <section class="friend-link-layout">
      <section class="friend-link-form-panel" data-material="content">
        <div class="friend-link-panel-head">
          <TsIcon name="external" :size="20" />
          <h2>{{ copy.formTitle }}</h2>
        </div>

        <div v-if="successMessage" class="friend-link-success" role="status">
          <span class="friend-link-success-icon"><TsIcon name="userCheck" :size="28" /></span>
          <h2>{{ copy.successTitle }}</h2>
          <p>{{ successMessage || copy.successDesc }}</p>
          <button class="primary-btn" type="button" @click="go('/friend-links')">{{ copy.back }}</button>
        </div>

        <div v-else-if="!isAuthed" class="friend-link-login-gate">
          <span class="friend-link-login-icon"><TsIcon name="userCheck" :size="28" /></span>
          <h2>{{ copy.loginTitle }}</h2>
          <p>{{ copy.loginDesc }}</p>
          <button class="primary-btn" type="button" @click="go('/login')">{{ copy.login }}</button>
        </div>

        <form v-else class="friend-link-form" :aria-busy="submitting || discoveringAvatar" @submit.prevent="submitApplication">
          <div class="friend-link-field-grid">
            <label class="friend-link-field">
              <span>{{ copy.name }}</span>
              <input v-model="form.name" type="text" maxlength="40" minlength="2" autocomplete="organization" :placeholder="copy.namePlaceholder" required>
            </label>
            <label class="friend-link-field">
              <span>{{ copy.url }}</span>
              <input v-model="form.url" type="url" maxlength="2048" inputmode="url" autocomplete="url" :placeholder="copy.urlPlaceholder" required>
            </label>
          </div>

          <label class="friend-link-field">
            <span>{{ copy.description }}</span>
            <textarea v-model="form.description" maxlength="160" minlength="6" rows="3" :placeholder="copy.descriptionPlaceholder" required></textarea>
            <small>{{ form.description.length }}/160</small>
          </label>

          <div class="friend-link-avatar-entry">
            <label class="friend-link-field">
              <span>{{ copy.avatar }}</span>
              <input v-model="form.avatar_url" type="url" maxlength="2048" inputmode="url" :placeholder="copy.avatarPlaceholder">
            </label>
            <button
              class="ghost-btn friend-link-avatar-action"
              :class="{ 'is-loading': discoveringAvatar }"
              type="button"
              :disabled="discoveringAvatar || !form.url.trim()"
              @click="discoverAvatar"
            >
              <TsIcon :name="discoveringAvatar ? 'loader' : 'refresh'" :size="17" />
              <span>{{ discoveringAvatar ? copy.detectingAvatar : copy.autoAvatar }}</span>
            </button>
          </div>

          <div v-if="form.avatar_url" class="friend-link-avatar-preview">
            <span class="friend-links-avatar" aria-hidden="true">
              <img v-if="!avatarPreviewFailed" :src="form.avatar_url" alt="" referrerpolicy="no-referrer" @error="avatarPreviewFailed = true">
              <span v-else>{{ initial(form.name) }}</span>
            </span>
            <span>{{ form.name || copy.namePlaceholder }}</span>
          </div>

          <details class="friend-link-advanced">
            <summary>
              <span>{{ copy.advanced }}</span>
              <TsIcon name="chevronDown" :size="17" />
            </summary>
            <div class="friend-link-advanced-body">
              <label class="friend-link-field">
                <span>{{ copy.backlink }}</span>
                <input v-model="form.backlink_url" type="url" maxlength="2048" inputmode="url" :placeholder="copy.backlinkPlaceholder">
              </label>
              <label class="friend-link-field">
                <span>{{ copy.note }}</span>
                <textarea v-model="form.note" maxlength="300" rows="3" :placeholder="copy.notePlaceholder"></textarea>
                <small>{{ form.note.length }}/300</small>
              </label>
            </div>
          </details>

          <p v-if="errorMessage" class="friend-link-error" role="alert">{{ errorMessage }}</p>

          <div class="friend-link-form-actions">
            <button class="primary-btn" type="submit" :disabled="submitting || discoveringAvatar">
              <TsIcon name="send" :size="18" />
              <span>{{ submitting ? copy.submitting : copy.submit }}</span>
            </button>
          </div>
        </form>
      </section>

      <aside class="friend-link-side">
        <section class="friend-link-side-panel" data-material="content">
          <div class="friend-link-panel-head">
            <TsIcon name="shield" :size="20" />
            <h2>{{ copy.requirements }}</h2>
          </div>
          <ul class="friend-link-requirements">
            <li><TsIcon name="userCheck" :size="17" /><span>{{ copy.reachable }}</span></li>
            <li><TsIcon name="shield" :size="17" /><span>{{ copy.safe }}</span></li>
            <li><TsIcon name="external" :size="17" /><span>{{ copy.reciprocal }}</span></li>
          </ul>
        </section>

        <section v-if="isAuthed" class="friend-link-side-panel" data-material="content" :aria-busy="loadingApplications">
          <div class="friend-link-panel-head">
            <TsIcon name="list" :size="20" />
            <h2>{{ copy.history }}</h2>
          </div>
          <div v-if="loadingApplications" class="friend-link-history-loading" role="status">
            <StatusLoader :label="copy.loading" compact />
          </div>
          <p v-else-if="!recentApplications.length" class="friend-link-empty">{{ copy.empty }}</p>
          <div v-else class="friend-link-history">
            <article v-for="item in recentApplications" :key="item.id" class="friend-link-history-item">
              <div>
                <strong>{{ item.name }}</strong>
                <small>{{ formatDate(item.updated_at || item.created_at) }}</small>
              </div>
              <span class="friend-link-status" :class="`is-${item.status}`">{{ statusLabel(item.status) }}</span>
            </article>
          </div>
        </section>
      </aside>
    </section>
  </main>
</template>
