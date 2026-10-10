<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import TsIcon from '../components/TsIcon.vue';
import appIcon from '../../../assets/icons/icon-512.png';
import releaseSnapshot from '../../../shared/native-app-release.json';
import { nativeAppCopy } from '../data/nativeAppCopy';
import { APP_REPOSITORY, detectDownloadPlatform, loadAppReleases, selectAppReleases } from '../services/nativeAppRelease.mjs';

const props = defineProps({ lang: { type: String, required: true }, t: { type: Object, required: true } });
const emit = defineEmits(['go']);
const copy = computed(() => nativeAppCopy(props.lang));
const catalog = ref(selectAppReleases([releaseSnapshot]));
const channel = ref('');
const source = ref('verified');
const loading = ref(false);
const failed = ref(false);
const device = ref('');
const release = computed(() => catalog.value[channel.value] || catalog.value.stable || catalog.value.preview);
const sourceLabel = computed(() => copy.value[source.value === 'github' ? 'latest' : source.value === 'cache' ? 'cached' : 'verified']);
const platforms = computed(() => ['windows', 'macos', 'android', 'linux', 'ios'].map(key => ({
  key, ...copy.value.platformsCopy[key], asset: release.value.assets[key],
  icon: key === 'android' || key === 'ios' ? 'smartphone' : key === 'macos' ? 'laptop' : 'monitor',
  extraKey: ({ windows: 'windowsPortable', android: 'androidEmulator', linux: 'linuxPortable' })[key],
  recommended: key === device.value
})));
const recommended = computed(() => platforms.value.find(platform => platform.recommended));
const heroAsset = computed(() => release.value.assets[device.value]);
const heroAction = computed(() => device.value === 'androidEmulator' ? copy.value.platformsCopy.android.extra : recommended.value?.action || copy.value.choose);
const heroTarget = computed(() => device.value === 'androidEmulator' ? copy.value.platformsCopy.android.extra : recommended.value?.target);
const publishedDate = computed(() => new Intl.DateTimeFormat(props.lang === 'zh' ? 'zh-CN' : props.lang, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(release.value.publishedAt)));
let request = null;
let disposed = false;
function size(bytes) { return `${new Intl.NumberFormat(props.lang, { maximumFractionDigits: 1 }).format(bytes / 1024 ** 2)} MB`; }
function enterRoom(event) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
  event.preventDefault(); emit('go', '/room');
}
async function refresh(force = false) {
  if (loading.value) return;
  request = new AbortController(); loading.value = true; failed.value = false;
  try {
    const result = await loadAppReleases({ signal: request.signal, force });
    if (!disposed) { catalog.value = result.catalog; source.value = result.source; }
  } catch (_) { if (!disposed) failed.value = true; }
  finally { if (!disposed) loading.value = false; request = null; }
}
onMounted(() => { device.value = detectDownloadPlatform(navigator); refresh(); });
onUnmounted(() => { disposed = true; request?.abort(); });
</script>

<template>
  <main class="page download-page">
    <div class="download-container">
      <section class="download-hero" aria-labelledby="download-title">
        <div class="download-hero-copy">
          <p class="download-eyebrow">{{ copy.eyebrow }}</p>
          <h1 id="download-title">{{ copy.title }}</h1>
          <p class="download-lead">{{ copy.intro }}</p>
          <ul class="download-feature-list"><li v-for="feature in copy.features" :key="feature"><TsIcon name="check" :size="16" />{{ feature }}</li></ul>
          <a href="/room" class="download-web-link" @click="enterRoom">{{ copy.web }}<TsIcon name="chevronRight" :size="16" /></a>
        </div>
        <div class="download-app-card">
          <div class="download-app-identity"><img :src="appIcon" alt="" width="76" height="76" /><div><h2>{{ copy.app }}</h2><p>{{ copy.native }}</p></div></div>
          <div class="download-version"><strong>{{ release.tag }}</strong><span class="download-badge">{{ release.preview ? copy.preview : copy.stable }}</span></div>
          <p class="download-recommendation">{{ heroTarget ? `${copy.recommended} · ${heroTarget} · ${size(heroAsset.size)}` : copy.choose }}</p>
          <a v-if="heroAsset" class="download-button" :href="heroAsset.href" rel="noopener noreferrer" referrerpolicy="no-referrer"><TsIcon name="download" :size="18" />{{ heroAction }}</a>
          <a v-else class="download-button" href="#downloads"><TsIcon name="download" :size="18" />{{ copy.choose }}</a>
          <a class="download-other" href="#downloads">{{ copy.other }}</a>
        </div>
      </section>

      <section class="download-release-bar" :aria-label="copy.release">
        <div><span class="download-source">{{ sourceLabel }}</span><span>{{ copy.published }} {{ publishedDate }}</span></div>
        <div v-if="catalog.stable && catalog.preview" class="download-channels" role="group" :aria-label="copy.release">
          <button type="button" :aria-pressed="!release.preview" @click="channel = 'stable'">{{ copy.stable }}</button>
          <button type="button" :aria-pressed="release.preview" @click="channel = 'preview'">{{ copy.preview }}</button>
        </div>
        <div class="download-release-actions"><a :href="release.url" target="_blank" rel="noopener noreferrer">{{ copy.versionNotes }}<TsIcon name="external" :size="14" /></a><button type="button" :disabled="loading" @click="refresh(true)">{{ loading ? copy.checking : copy.check }}</button></div>
      </section>
      <p v-if="failed" class="download-status" role="status">{{ source === 'verified' ? copy.checkFailed : copy.checkFailedCached }}</p>
      <p v-if="release.preview" class="download-beta-note">{{ copy.previewNote }}</p>

      <section id="downloads" class="download-platforms" aria-labelledby="download-platform-title">
        <div class="download-section-heading"><h2 id="download-platform-title">{{ copy.platforms }}</h2><p>{{ copy.platformIntro }}</p></div>
        <div class="download-platform-grid">
          <article v-for="platform in platforms" :key="platform.key" class="download-platform" :class="{ 'is-recommended': platform.recommended }" :data-platform="platform.key">
            <div class="download-platform-heading"><div class="download-device-icon"><TsIcon :name="platform.icon" :size="25" /></div><div><h3>{{ platform.name }}</h3><p>{{ platform.target }}</p></div><span v-if="platform.recommended" class="download-badge">{{ copy.recommended }}</span></div>
            <p class="download-platform-note">{{ platform.note }}</p>
            <div class="download-package-label"><span>{{ platform.format }}</span><span v-if="platform.asset">{{ size(platform.asset.size) }}</span></div>
            <a v-if="platform.asset" class="download-button" :href="platform.asset.href" rel="noopener noreferrer" referrerpolicy="no-referrer"><TsIcon name="download" :size="17" />{{ platform.action }}</a>
            <p v-else class="download-status">{{ copy.unavailable }}</p>
            <details class="download-platform-details"><summary>{{ copy.alternative }}</summary><p>{{ platform.extraNote }}</p><a v-if="platform.extraKey && release.assets[platform.extraKey]" :href="release.assets[platform.extraKey].href" rel="noopener noreferrer" referrerpolicy="no-referrer">{{ platform.extra }} · {{ size(release.assets[platform.extraKey].size) }}<TsIcon name="download" :size="15" /></a><a :href="release.guideUrl" target="_blank" rel="noopener noreferrer">{{ copy.guide }}<TsIcon name="external" :size="14" /></a><p v-if="platform.asset" class="download-filename">{{ copy.file }}: {{ platform.asset.name }}</p></details>
          </article>
        </div>
        <p class="download-direct"><TsIcon name="github" :size="17" />{{ copy.direct }}</p>
        <nav class="download-resource-links" :aria-label="copy.guide"><a :href="release.guideUrl" target="_blank" rel="noopener noreferrer">{{ copy.guide }}</a><a :href="release.assets.checksums.href" rel="noopener noreferrer" referrerpolicy="no-referrer">{{ copy.checksum }}</a><a :href="`${APP_REPOSITORY}/releases`" target="_blank" rel="noopener noreferrer">{{ copy.history }}</a><a :href="APP_REPOSITORY" target="_blank" rel="noopener noreferrer">{{ copy.source }}</a></nav>
      </section>

      <section class="download-start" aria-labelledby="download-start-title"><h2 id="download-start-title">{{ copy.stepsTitle }}</h2><ol><li v-for="(step, index) in copy.steps" :key="index"><span class="download-step-number">0{{ index + 1 }}</span><div><h3>{{ step[0] }}</h3><p>{{ step[1] }}</p></div></li></ol></section>
      <section class="download-help" aria-labelledby="download-help-title"><h2 id="download-help-title">{{ copy.helpTitle }}</h2><details v-for="item in copy.help" :key="item[0]"><summary>{{ item[0] }}</summary><p>{{ item[1] }}</p></details></section>
    </div>
  </main>
</template>
