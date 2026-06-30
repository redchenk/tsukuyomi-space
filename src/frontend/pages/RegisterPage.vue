<script setup>
import { computed, reactive } from 'vue';
import authVisualBgUrl from '../../../assets/images/auth-visual-bg.png';
import qqIconUrl from '../../../assets/icons/qq-login.png';
import { apiFetch, apiUrl, countdown, loadCurrentSession, parseResponse, saveUserSession } from '../api/client';

const props = defineProps({
  t: { type: Object, required: true }
});

const emit = defineEmits(['auth-changed', 'go']);

const register = reactive({
  username: '',
  email: '',
  emailCode: '',
  password: '',
  confirmPassword: '',
  message: '',
  type: 'error',
  sending: { loading: false, label: '' }
});

const isJapanese = computed(() => props.t.register === '新規登録');
const authTitle = computed(() => (isJapanese.value ? '新しい居場所を作る' : '创建账号'));
const authVisualTitle = computed(() => (isJapanese.value ? '月読空間' : '月读空间'));
const authVisualSubtitle = computed(() => (isJapanese.value ? '探索、記録、共有' : '探索、记录、分享'));
const authHomeLabel = computed(() => (isJapanese.value ? 'ホームへ戻る' : '返回首页'));

function showMessage(type, message) {
  register.type = type;
  register.message = message;
}

async function sendCode() {
  register.sending.loading = true;
  try {
    const response = await apiFetch('/api/auth/email-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: register.email.trim(), purpose: 'register' })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.unknown);
    showMessage('success', props.t.codeSent);
    register.sending.label = '60s';
    countdown(register.sending, props.t.sendCode);
  } catch (error) {
    register.sending.loading = false;
    register.sending.label = props.t.sendCode;
    showMessage('error', props.t.failedPrefix + error.message);
  }
}

async function submitRegister() {
  register.message = '';
  if (register.password !== register.confirmPassword) {
    showMessage('error', props.t.passwordMismatch);
    return;
  }

  try {
    const response = await apiFetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        username: register.username.trim(),
        email: register.email.trim(),
        emailCode: register.emailCode.trim(),
        password: register.password
      })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.unknown);
    if (result.data?.user) {
      saveUserSession('', result.data.user);
      await loadCurrentSession({ allowClear: false });
      emit('auth-changed', result.data.user);
    }
    showMessage('success', props.t.registerSuccess);
    setTimeout(() => emit('go', '/hub'), 800);
  } catch (error) {
    showMessage('error', props.t.failedPrefix + error.message);
  }
}

function go(path) {
  emit('go', path);
}

function startQQLogin() {
  const redirect = '/hub';
  window.location.href = apiUrl(`/api/auth/oauth/qq/start?redirect=${encodeURIComponent(redirect)}`);
}
</script>

<template>
  <main class="page auth-page auth-page-register">
    <section class="auth-shell">
      <aside class="auth-visual" aria-label="Tsukuyomi Space">
        <img class="auth-visual-bg" :src="authVisualBgUrl" alt="">
        <div class="auth-visual-copy">
          <span class="auth-visual-kicker">Tsukuyomi Space</span>
          <h2>{{ authVisualTitle }}</h2>
          <p>{{ authVisualSubtitle }}</p>
        </div>
      </aside>

      <section class="auth-form-stage">
        <section class="auth-card">
          <h1>{{ authTitle }}</h1>
          <p class="panel-subtitle">{{ t.registerSubtitle }}</p>
          <div v-if="register.message" class="form-message" :class="register.type">{{ register.message }}</div>
          <form @submit.prevent="submitRegister">
            <div class="form-group">
              <label for="registerUsername">{{ t.username }}</label>
              <input id="registerUsername" v-model="register.username" required :placeholder="t.usernamePh" autocomplete="username">
            </div>
            <div class="form-group">
              <label for="registerEmail">{{ t.email }}</label>
              <div class="code-row">
                <input id="registerEmail" v-model="register.email" required type="email" :placeholder="t.emailInputPh" autocomplete="email">
                <button class="code-btn" type="button" :disabled="register.sending.loading" @click="sendCode">{{ register.sending.label || t.sendCode }}</button>
              </div>
            </div>
            <div class="form-group">
              <label for="registerCode">{{ t.emailCode }}</label>
              <input id="registerCode" v-model="register.emailCode" required inputmode="numeric" maxlength="6" :placeholder="t.codePh">
            </div>
            <div class="form-group">
              <label for="registerPassword">{{ t.password }}</label>
              <input id="registerPassword" v-model="register.password" required minlength="6" type="password" :placeholder="t.passwordPh" autocomplete="new-password">
            </div>
            <div class="form-group">
              <label for="registerConfirm">{{ t.confirmPassword }}</label>
              <input id="registerConfirm" v-model="register.confirmPassword" required minlength="6" type="password" :placeholder="t.confirmPh" autocomplete="new-password">
            </div>
            <button class="primary-btn" type="submit">{{ t.register }}</button>
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
            <div class="panel-links">{{ t.haveAccount }} <a href="/login" @click.prevent="go('/login')">{{ t.login }}</a></div>
            <a class="auth-home-link" href="/" @click.prevent="go('/')">{{ authHomeLabel }}</a>
          </div>
        </section>
      </section>
    </section>
  </main>
</template>
