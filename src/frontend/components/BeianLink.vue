<script setup>
import { computed, onMounted, ref } from 'vue';
import { loadPublicSettings } from '../api/client';

const STORAGE_KEY = 'tsukuyomi_beian_public_settings';
const defaultBeian = { text: '', url: '', mpsText: '', mpsUrl: '', mpsIcon: '' };
let cachedBeian = null;
let settingsPromise = null;

function normalizeBeian(settings = {}) {
  return {
    text: String(settings.beianText || settings.text || '').trim(),
    url: String(settings.beianUrl || settings.url || '').trim(),
    mpsText: String(settings.mpsBeianText || settings.publicSecurityBeianText || settings.mpsText || '').trim(),
    mpsUrl: String(settings.mpsBeianUrl || settings.publicSecurityBeianUrl || settings.mpsUrl || '').trim(),
    mpsIcon: String(settings.mpsBeianIcon || settings.publicSecurityBeianIcon || settings.mpsIcon || '').trim()
  };
}

function readCachedBeian() {
  if (cachedBeian) return cachedBeian;
  try {
    cachedBeian = normalizeBeian(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
  } catch (_) {
    cachedBeian = { ...defaultBeian };
  }
  return cachedBeian;
}

function writeCachedBeian(value) {
  cachedBeian = normalizeBeian(value);
  try {
    if (cachedBeian.text || cachedBeian.mpsText) localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedBeian));
    else localStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    // Ignore storage failures; the API value still renders for this page view.
  }
  return cachedBeian;
}

async function loadBeian() {
  if (!settingsPromise) {
    settingsPromise = loadPublicSettings()
      .then(settings => writeCachedBeian(settings))
      .catch(() => ({ ...defaultBeian }))
      .finally(() => {
        settingsPromise = null;
      });
  }
  return settingsPromise;
}

const beian = ref(readCachedBeian());
const href = computed(() => beian.value.url || 'https://beian.miit.gov.cn/');
const mpsHref = computed(() => beian.value.mpsUrl || 'https://beian.mps.gov.cn/');
const mpsIconSrc = computed(() => beian.value.mpsIcon || '/assets/images/beian-mps.png');
const hasBeian = computed(() => Boolean(beian.value.text || beian.value.mpsText));

onMounted(async () => {
  beian.value = await loadBeian();
});
</script>

<template>
  <span class="beian-links" :class="{ visible: hasBeian }" :aria-hidden="hasBeian ? 'false' : 'true'">
    <a
      v-if="beian.text"
      class="beian-link visible"
      :href="href"
      target="_blank"
      rel="noopener noreferrer"
    >
      {{ beian.text }}
    </a>
    <a
      v-if="beian.mpsText"
      class="beian-link mps-beian-link visible"
      :href="mpsHref"
      target="_blank"
      rel="noreferrer"
    >
      <img class="mps-beian-icon" :src="mpsIconSrc" alt="" loading="lazy">
      <span>{{ beian.mpsText }}</span>
    </a>
    <span v-if="!hasBeian" class="beian-link" aria-hidden="true">&nbsp;</span>
  </span>
</template>
