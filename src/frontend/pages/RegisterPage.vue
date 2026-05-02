<script setup>
import { reactive } from 'vue';
import { countdown, parseResponse, saveUserSession } from '../api/client';

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

function showMessage(type, message) {
  register.type = type;
  register.message = message;
}

async function sendCode() {
  register.sending.loading = true;
  try {
    const response = await fetch('/api/auth/email-code', {
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
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: register.username.trim(),
        email: register.email.trim(),
        emailCode: register.emailCode.trim(),
        password: register.password
      })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.unknown);
    if (result.data?.token) {
      saveUserSession(result.data.token, result.data.user);
      emit('auth-changed');
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
</script>

<template>
  <main class="page center-page">
    <section class="panel">
      <h1>{{ t.register }}</h1>
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
      <div class="panel-links">{{ t.haveAccount }} <a href="/login" @click.prevent="go('/login')">{{ t.login }}</a></div>
    </section>
  </main>
</template>
