<script setup>
import { computed, onMounted, reactive } from 'vue';
import authVisualBgUrl from '../../../assets/images/auth-visual-bg.png';
import qqIconUrl from '../../../assets/icons/qq-login.png';
import { apiFetch, apiUrl, countdown, loadCurrentSession, parseResponse, saveUserSession } from '../api/client';

const props = defineProps({
  t: { type: Object, required: true }
});

const emit = defineEmits(['auth-changed', 'go']);

const login = reactive({
  method: 'password',
  username: '',
  password: '',
  emailCode: '',
  message: '',
  type: 'error',
  sending: { loading: false, label: '' }
});

const oauth = reactive({
  ticket: '',
  mode: 'create',
  bindMethod: 'password',
  identity: '',
  password: '',
  emailCode: '',
  createUsername: '',
  profile: null,
  message: '',
  type: 'error',
  loading: false,
  submitting: false,
  sending: { loading: false, label: '' }
});

const loginPlaceholder = computed(() => login.method === 'code' ? props.t.emailPh : props.t.accountPh);
const hasOAuthTicket = computed(() => Boolean(oauth.ticket));
const isJapanese = computed(() => props.t.login === 'ログイン');
const authTitle = computed(() => hasOAuthTicket.value ? 'QQ 登录确认' : (isJapanese.value ? 'おかえりなさい' : '欢迎回来'));
const authSubtitle = computed(() => (
  hasOAuthTicket.value
    ? '选择创建新账号，或验证已有邮箱账号后把 QQ 绑定到同一个账号。'
    : props.t.loginSubtitle
));
const authVisualTitle = computed(() => (isJapanese.value ? '月読空間' : '月读空间'));
const authVisualSubtitle = computed(() => (isJapanese.value ? '探索、記録、共有' : '探索、记录、分享'));
const authHomeLabel = computed(() => (isJapanese.value ? 'ホームへ戻る' : '返回首页'));

const oauthErrorText = {
  qq_not_configured: 'QQ 登录暂未配置，请稍后再试',
  qq_start_failed: 'QQ 登录启动失败，请稍后再试',
  qq_denied: 'QQ 授权已取消',
  qq_missing_code: 'QQ 回调缺少授权码，请重新登录',
  qq_invalid_state: 'QQ 登录状态已过期，请重新授权',
  qq_callback_failed: 'QQ 回调处理失败，请稍后再试'
};

function showMessage(type, message) {
  login.type = type;
  login.message = message;
}

function showOAuthMessage(type, message) {
  oauth.type = type;
  oauth.message = message;
}

function setMethod(method) {
  login.method = method;
  login.message = '';
}

function setOAuthMode(mode) {
  oauth.mode = mode;
  oauth.message = '';
}

function setOAuthBindMethod(method) {
  oauth.bindMethod = method;
  oauth.message = '';
}

async function sendCode() {
  login.sending.loading = true;
  try {
    const response = await apiFetch('/api/auth/email-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: login.username.trim(), purpose: 'login' })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.unknown);
    showMessage('success', props.t.codeSent);
    login.sending.label = '60s';
    countdown(login.sending, props.t.sendCode);
  } catch (error) {
    login.sending.loading = false;
    login.sending.label = props.t.sendCode;
    showMessage('error', props.t.failedPrefix + error.message);
  }
}

async function submitLogin() {
  login.message = '';
  try {
    const response = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        username: login.username.trim(),
        password: login.password,
        emailCode: login.emailCode.trim(),
        loginMethod: login.method
      })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.unknown);
    saveUserSession('', result.data.user);
    await loadCurrentSession({ allowClear: false });
    emit('auth-changed', result.data.user);
    showMessage('success', props.t.loginSuccess);
    setTimeout(() => emit('go', '/hub'), 700);
  } catch (error) {
    showMessage('error', props.t.failedPrefix + error.message);
  }
}

async function finishOAuthLogin(result, fallbackMessage) {
  saveUserSession('', result.data.user);
  await loadCurrentSession({ allowClear: false });
  emit('auth-changed', result.data.user);
  showOAuthMessage('success', result.message || fallbackMessage);
  setTimeout(() => emit('go', result.data.redirect || '/hub'), 700);
}

function startQQLogin() {
  const redirect = '/hub';
  window.location.href = apiUrl(`/api/auth/oauth/qq/start?redirect=${encodeURIComponent(redirect)}`);
}

function clearOAuthFlow() {
  oauth.ticket = '';
  oauth.profile = null;
  oauth.message = '';
  oauth.identity = '';
  oauth.password = '';
  oauth.emailCode = '';
  if (window.history?.replaceState) {
    window.history.replaceState(null, '', '/login');
  }
}

async function loadOAuthPending(ticket) {
  oauth.loading = true;
  oauth.message = '';
  try {
    const response = await apiFetch(`/api/auth/oauth/qq/pending?ticket=${encodeURIComponent(ticket)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || 'QQ 登录状态读取失败');
    oauth.profile = result.data;
    oauth.createUsername = result.data.suggestedUsername || result.data.nickname || '';
    oauth.mode = result.data.hasEmailMatch ? 'bind' : 'create';
    if (result.data.email) oauth.identity = result.data.email;
  } catch (error) {
    showOAuthMessage('error', error.message || 'QQ 登录状态读取失败');
  } finally {
    oauth.loading = false;
  }
}

async function sendOAuthBindCode() {
  oauth.sending.loading = true;
  try {
    const response = await apiFetch('/api/auth/email-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: oauth.identity.trim(), purpose: 'login' })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.unknown);
    showOAuthMessage('success', props.t.codeSent);
    oauth.sending.label = '60s';
    countdown(oauth.sending, props.t.sendCode);
  } catch (error) {
    oauth.sending.loading = false;
    oauth.sending.label = props.t.sendCode;
    showOAuthMessage('error', props.t.failedPrefix + error.message);
  }
}

async function submitOAuthBind() {
  oauth.submitting = true;
  oauth.message = '';
  try {
    const response = await apiFetch('/api/auth/oauth/qq/bind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        ticket: oauth.ticket,
        username: oauth.identity.trim(),
        password: oauth.password,
        emailCode: oauth.emailCode.trim(),
        loginMethod: oauth.bindMethod
      })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || 'QQ 绑定失败');
    await finishOAuthLogin(result, 'QQ 已绑定到当前账号');
  } catch (error) {
    showOAuthMessage('error', props.t.failedPrefix + error.message);
  } finally {
    oauth.submitting = false;
  }
}

async function submitOAuthCreate() {
  oauth.submitting = true;
  oauth.message = '';
  try {
    const response = await apiFetch('/api/auth/oauth/qq/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        ticket: oauth.ticket,
        username: oauth.createUsername.trim()
      })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || 'QQ 登录失败');
    await finishOAuthLogin(result, 'QQ 登录成功');
  } catch (error) {
    showOAuthMessage('error', props.t.failedPrefix + error.message);
  } finally {
    oauth.submitting = false;
  }
}

function go(path) {
  emit('go', path);
}

onMounted(() => {
  const params = new URLSearchParams(window.location.search || '');
  const oauthError = params.get('oauth_error');
  if (oauthError) {
    showMessage('error', oauthErrorText[oauthError] || 'QQ 登录失败，请稍后再试');
  }

  if (params.get('oauth') === 'qq' && params.get('ticket')) {
    oauth.ticket = params.get('ticket');
    loadOAuthPending(oauth.ticket);
  }
});
</script>

<template>
  <main class="page auth-page auth-page-login">
    <section class="auth-shell" :class="{ 'auth-shell-oauth': hasOAuthTicket }">
      <aside class="auth-visual" aria-label="Tsukuyomi Space">
        <img class="auth-visual-bg" :src="authVisualBgUrl" alt="">
        <div class="auth-visual-copy">
          <span class="auth-visual-kicker">Tsukuyomi Space</span>
          <h2>{{ authVisualTitle }}</h2>
          <p>{{ authVisualSubtitle }}</p>
        </div>
      </aside>

      <section class="auth-form-stage">
        <section v-if="hasOAuthTicket" class="auth-card oauth-panel">
          <h1>{{ authTitle }}</h1>
          <p class="panel-subtitle">{{ authSubtitle }}</p>

          <div v-if="oauth.loading" class="oauth-loading">正在读取 QQ 授权信息...</div>
          <template v-else>
            <div v-if="oauth.profile" class="oauth-profile">
              <img v-if="oauth.profile.avatar" :src="oauth.profile.avatar" :alt="oauth.profile.nickname">
              <div v-else class="oauth-avatar">QQ</div>
              <div>
                <strong>{{ oauth.profile.nickname || 'QQ 用户' }}</strong>
                <span>{{ oauth.profile.email || 'QQ 未返回邮箱，可手动绑定已有邮箱账号' }}</span>
              </div>
            </div>

            <div v-if="oauth.message" class="form-message" :class="oauth.type">{{ oauth.message }}</div>

            <div class="mode-row">
              <button class="mode-btn" :class="{ active: oauth.mode === 'create' }" type="button" @click="setOAuthMode('create')">创建 QQ 账号</button>
              <button class="mode-btn" :class="{ active: oauth.mode === 'bind' }" type="button" @click="setOAuthMode('bind')">绑定已有账号</button>
            </div>

            <form v-if="oauth.mode === 'create'" @submit.prevent="submitOAuthCreate">
              <div class="form-group">
                <label for="qqCreateUsername">用户名</label>
                <input id="qqCreateUsername" v-model="oauth.createUsername" required maxlength="24" autocomplete="username" placeholder="用于站内展示的用户名">
              </div>
              <button class="primary-btn" type="submit" :disabled="oauth.submitting">{{ oauth.submitting ? '正在进入...' : '创建并进入' }}</button>
            </form>

            <form v-else @submit.prevent="submitOAuthBind">
              <div class="mode-row compact">
                <button class="mode-btn" :class="{ active: oauth.bindMethod === 'password' }" type="button" @click="setOAuthBindMethod('password')">{{ t.passwordLogin }}</button>
                <button class="mode-btn" :class="{ active: oauth.bindMethod === 'code' }" type="button" @click="setOAuthBindMethod('code')">{{ t.codeLogin }}</button>
              </div>
              <div class="form-group">
                <label for="qqBindAccount">{{ t.account }}</label>
                <input id="qqBindAccount" v-model="oauth.identity" required :placeholder="oauth.bindMethod === 'code' ? t.emailPh : t.accountPh" autocomplete="username">
              </div>
              <div v-if="oauth.bindMethod === 'password'" class="form-group">
                <label for="qqBindPassword">{{ t.password }}</label>
                <input id="qqBindPassword" v-model="oauth.password" required type="password" :placeholder="t.passwordPh" autocomplete="current-password">
              </div>
              <div v-else class="form-group">
                <label for="qqBindCode">{{ t.emailCode }}</label>
                <div class="code-row">
                  <input id="qqBindCode" v-model="oauth.emailCode" required inputmode="numeric" maxlength="6" :placeholder="t.codePh">
                  <button class="code-btn" type="button" :disabled="oauth.sending.loading" @click="sendOAuthBindCode">{{ oauth.sending.label || t.sendCode }}</button>
                </div>
              </div>
              <button class="primary-btn" type="submit" :disabled="oauth.submitting">{{ oauth.submitting ? '正在绑定...' : '绑定并登录' }}</button>
            </form>

            <button class="ghost-btn oauth-back-btn" type="button" @click="clearOAuthFlow">返回普通登录</button>
            <a class="auth-home-link" href="/" @click.prevent="go('/')">{{ authHomeLabel }}</a>
          </template>
        </section>

        <section v-else class="auth-card">
          <h1>{{ authTitle }}</h1>
          <p class="panel-subtitle">{{ authSubtitle }}</p>
          <div v-if="login.message" class="form-message" :class="login.type">{{ login.message }}</div>
          <form @submit.prevent="submitLogin">
            <div class="mode-row">
              <button class="mode-btn" :class="{ active: login.method === 'password' }" type="button" @click="setMethod('password')">{{ t.passwordLogin }}</button>
              <button class="mode-btn" :class="{ active: login.method === 'code' }" type="button" @click="setMethod('code')">{{ t.codeLogin }}</button>
            </div>
            <div class="form-group">
              <label for="loginAccount">{{ t.account }}</label>
              <input id="loginAccount" v-model="login.username" required :placeholder="loginPlaceholder" autocomplete="username">
            </div>
            <div v-if="login.method === 'password'" class="form-group">
              <label for="loginPassword">{{ t.password }}</label>
              <input id="loginPassword" v-model="login.password" required type="password" :placeholder="t.passwordPh" autocomplete="current-password">
            </div>
            <div v-else class="form-group">
              <label for="loginCode">{{ t.emailCode }}</label>
              <div class="code-row">
                <input id="loginCode" v-model="login.emailCode" required inputmode="numeric" maxlength="6" :placeholder="t.codePh">
                <button class="code-btn" type="button" :disabled="login.sending.loading" @click="sendCode">{{ login.sending.label || t.sendCode }}</button>
              </div>
            </div>
            <button class="primary-btn" type="submit">{{ t.login }}</button>
          </form>
          <div class="oauth-login-section">
            <div class="auth-divider"><span>其他方式登录</span></div>
            <div class="oauth-provider-row">
              <button class="oauth-icon-btn qq" type="button" aria-label="QQ 登录" title="QQ 登录" @click="startQQLogin">
                <img :src="qqIconUrl" alt="">
                <span>QQ</span>
              </button>
            </div>
          </div>
          <div class="auth-card-footer">
            <div class="panel-links">{{ t.noAccount }} <a href="/register" @click.prevent="go('/register')">{{ t.register }}</a></div>
            <a class="auth-home-link" href="/" @click.prevent="go('/')">{{ authHomeLabel }}</a>
          </div>
        </section>
      </section>
    </section>
  </main>
</template>
