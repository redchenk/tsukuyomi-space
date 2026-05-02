<script setup>
import { computed, reactive } from 'vue';
import { countdown, parseResponse, saveUserSession } from '../api/client';

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

const loginPlaceholder = computed(() => login.method === 'code' ? props.t.emailPh : props.t.accountPh);

function showMessage(type, message) {
  login.type = type;
  login.message = message;
}

function setMethod(method) {
  login.method = method;
  login.message = '';
}

async function sendCode() {
  login.sending.loading = true;
  try {
    const response = await fetch('/api/auth/email-code', {
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
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: login.username.trim(),
        password: login.password,
        emailCode: login.emailCode.trim(),
        loginMethod: login.method
      })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.unknown);
    saveUserSession(result.data.token, result.data.user);
    emit('auth-changed');
    showMessage('success', props.t.loginSuccess);
    setTimeout(() => emit('go', '/hub'), 700);
  } catch (error) {
    showMessage('error', props.t.failedPrefix + error.message);
  }
}

function go(path) {
  emit('go', path);
}
</script>

<template>
  <main class="page center-page">
    <section class="panel">
      <h1>{{ t.login }}</h1>
      <p class="panel-subtitle">{{ t.loginSubtitle }}</p>
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
      <div class="panel-links">{{ t.noAccount }} <a href="/register" @click.prevent="go('/register')">{{ t.register }}</a></div>
    </section>
  </main>
</template>
