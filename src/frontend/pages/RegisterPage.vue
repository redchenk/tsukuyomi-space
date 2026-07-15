<script setup>
import { computed, reactive, ref } from 'vue';
import authVisualBgUrl from '../../../assets/images/auth-visual-bg.png';
import qqIconUrl from '../../../assets/icons/qq-login.png';
import TsIcon from '../components/TsIcon.vue';
import { apiFetch, apiUrl, countdown, loadCurrentSession, parseResponse, saveUserSession } from '../api/client';
import { getAuthRedirectFromLocation, withAuthRedirect } from '../utils/authRedirect';

const props = defineProps({
  t: { type: Object, required: true }
});

const emit = defineEmits(['auth-changed', 'go']);

const authRedirect = computed(() => getAuthRedirectFromLocation('/hub'));
const loginPath = computed(() => withAuthRedirect('/login', authRedirect.value));

const register = reactive({
  username: '',
  email: '',
  emailCode: '',
  password: '',
  confirmPassword: '',
  message: '',
  type: 'error',
  submitting: false,
  sending: { loading: false, label: '' }
});

const showPassword = ref(false);
const showConfirmPassword = ref(false);
const isJapanese = computed(() => props.t.register === '新規登録');
const authTitle = computed(() => (isJapanese.value ? '新しい居場所を作る' : '创建账号'));
const authVisualTitle = computed(() => (isJapanese.value ? '月読空間' : '月读空间'));
const authVisualSubtitle = computed(() => (isJapanese.value ? '探索、記録、共有' : '探索、记录、分享'));
const authHomeLabel = computed(() => (isJapanese.value ? 'ホームへ戻る' : '返回首页'));
const authNotePrimary = computed(() => (isJapanese.value ? '新しい記録' : '新的档案'));
const authNoteSecondary = computed(() => (isJapanese.value ? '安全な身分' : '安全身份'));

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

  register.submitting = true;
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
    setTimeout(() => emit('go', authRedirect.value), 800);
  } catch (error) {
    showMessage('error', props.t.failedPrefix + error.message);
  } finally {
    register.submitting = false;
  }
}

function go(path) {
  emit('go', path);
}

function startQQLogin() {
  const redirect = authRedirect.value;
  window.location.href = apiUrl(`/api/auth/oauth/qq/start?redirect=${encodeURIComponent(redirect)}`);
}
</script>

<template>
  <main class="page auth-page auth-page-register">
    <section class="auth-shell">
      <aside class="auth-visual" aria-label="Tsukuyomi Space">
        <img class="auth-visual-bg" :src="authVisualBgUrl" alt="">
        <div class="auth-visual-sheen" aria-hidden="true"></div>
        <div class="auth-visual-copy">
          <span class="auth-visual-kicker"><TsIcon name="moon" :size="14" /> Tsukuyomi Space</span>
          <h2>{{ authVisualTitle }}</h2>
          <p>{{ authVisualSubtitle }}</p>
        </div>
        <div class="auth-visual-notes" aria-hidden="true">
          <div class="auth-note auth-note-primary">
            <TsIcon name="sparkles" :size="18" />
            <span>{{ authNotePrimary }}</span>
          </div>
          <div class="auth-note auth-note-secondary">
            <TsIcon name="shield" :size="17" />
            <span>{{ authNoteSecondary }}</span>
          </div>
        </div>
      </aside>

      <section class="auth-form-stage">
        <section class="auth-card" data-material="content" :aria-busy="register.submitting">
          <div class="auth-card-head">
            <span class="auth-kicker"><TsIcon name="userPlus" :size="14" /> Tsukuyomi Gate</span>
            <h1>{{ authTitle }}</h1>
            <p class="panel-subtitle">{{ t.registerSubtitle }}</p>
          </div>
          <div v-if="register.message" class="form-message" :class="register.type">{{ register.message }}</div>
          <form :aria-busy="register.submitting" @submit.prevent="submitRegister">
            <div class="form-group">
              <label for="registerUsername">{{ t.username }}</label>
              <div class="auth-input-shell">
                <TsIcon class="auth-field-icon" name="user" :size="18" />
                <input id="registerUsername" v-model="register.username" required :placeholder="t.usernamePh" autocomplete="username">
              </div>
            </div>
            <div class="form-group">
              <label for="registerEmail">{{ t.email }}</label>
              <div class="code-row">
                <div class="auth-input-shell">
                  <TsIcon class="auth-field-icon" name="mail" :size="18" />
                  <input id="registerEmail" v-model="register.email" required type="email" :placeholder="t.emailInputPh" autocomplete="email">
                </div>
                <button class="code-btn" type="button" :disabled="register.sending.loading" :aria-busy="register.sending.loading" @click="sendCode">
                  <TsIcon v-if="register.sending.loading" class="ts-status-loader-icon" name="loader" :size="15" aria-hidden="true" />
                  <span :role="register.sending.loading ? 'status' : undefined">{{ register.sending.label || t.sendCode }}</span>
                </button>
              </div>
            </div>
            <div class="form-group">
              <label for="registerCode">{{ t.emailCode }}</label>
              <div class="auth-input-shell">
                <TsIcon class="auth-field-icon" name="keyRound" :size="18" />
                <input id="registerCode" v-model="register.emailCode" required inputmode="numeric" maxlength="6" :placeholder="t.codePh">
              </div>
            </div>
            <div class="form-group">
              <label for="registerPassword">{{ t.password }}</label>
              <div class="auth-input-shell has-action">
                <TsIcon class="auth-field-icon" name="lock" :size="18" />
                <input id="registerPassword" v-model="register.password" required minlength="6" :type="showPassword ? 'text' : 'password'" :placeholder="t.passwordPh" autocomplete="new-password">
                <button class="auth-password-toggle" type="button" :aria-pressed="showPassword" @click="showPassword = !showPassword">
                  <TsIcon :name="showPassword ? 'eyeOff' : 'eye'" :size="18" />
                </button>
              </div>
            </div>
            <div class="form-group">
              <label for="registerConfirm">{{ t.confirmPassword }}</label>
              <div class="auth-input-shell has-action">
                <TsIcon class="auth-field-icon" name="lock" :size="18" />
                <input id="registerConfirm" v-model="register.confirmPassword" required minlength="6" :type="showConfirmPassword ? 'text' : 'password'" :placeholder="t.confirmPh" autocomplete="new-password">
                <button class="auth-password-toggle" type="button" :aria-pressed="showConfirmPassword" @click="showConfirmPassword = !showConfirmPassword">
                  <TsIcon :name="showConfirmPassword ? 'eyeOff' : 'eye'" :size="18" />
                </button>
              </div>
            </div>
            <button class="primary-btn" type="submit" :disabled="register.submitting" :aria-busy="register.submitting">{{ t.register }}</button>
            <StatusLoader v-if="register.submitting" label="正在创建账号" compact />
          </form>
          <div class="oauth-login-section">
            <div class="auth-divider"><span>其他方式登录</span></div>
            <div class="oauth-provider-row">
              <button class="oauth-icon-btn qq" type="button" aria-label="QQ 登录" title="QQ 登录" @click="startQQLogin">
                <img :src="qqIconUrl" alt="">
                <span>QQ 登录</span>
              </button>
            </div>
          </div>
          <div class="auth-card-footer">
            <div class="panel-links">{{ t.haveAccount }} <a :href="loginPath" @click.prevent="go(loginPath)">{{ t.login }}</a></div>
            <a class="auth-home-link" href="/" @click.prevent="go('/')">{{ authHomeLabel }}</a>
          </div>
        </section>
      </section>
    </section>
  </main>
</template>
