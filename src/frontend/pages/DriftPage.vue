<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authFetch, parseResponse, getSession, loadCurrentSession } from '../api/client';
import { driftCopy } from '../data/driftCopy';
import { createDriftSubmissions } from '../services/driftSubmission';
import { loadGrowth } from '../services/userGrowth';
import prompts from '../../../shared/drift-prompts.json';
import { formatDateMinute } from '../utils/time';
import DriftBottle from '../components/DriftBottle.vue';
import DriftLanternFilm from '../components/DriftLanternFilm.vue';
import DriftLanternScene from '../components/DriftLanternScene.vue';
import TsIcon from '../components/TsIcon.vue';

const props = defineProps({ lang: { type: String, default: 'zh' } });
const route = useRoute();
const router = useRouter();
const session = ref(getSession());
const bottles = ref([]);
const current = ref(null);
const draft = ref('');
const dailyDraft = ref('');
const dailyPrompt = ref(null);
const composingPrompt = ref(null);
const pendingDaily = ref(null);
const inspiration = ref(null);
const replyDrafts = reactive({});
const submissions = createDriftSubmissions();
const busy = ref(false);
const loading = ref(true);
const refreshing = ref(false);
const notice = ref('');
const translated = ref('');
const filter = ref('all');
const bottlePage = ref(1);
const bottleTotalPages = ref(1);
const bottleTotal = ref(0);
const phase = ref('idle');
const bottleDialog = ref(null);
const letterScroll = ref(null);
const writingArea = ref(null);
const composeArea = ref(null);
const panelHeading = ref(null);
const tabBar = ref(null);
const lakeScene = ref(null);
const landing = ref(false);
const leavingWriter = ref(false);
const sentLetter = shallowRef(null);
const lastSentId = ref(null);
const lanternShot = shallowRef(null);
const hasNewLetters = ref(false);
let pollTimer;
let promptTimer;
let disposed = false;
let revision = 0;

const copy = computed(() => driftCopy[props.lang] || driftCopy.zh);
const activeDraft = computed({ get: () => composingPrompt.value ? dailyDraft.value : draft.value, set: value => { if (composingPrompt.value) dailyDraft.value = value; else draft.value = value; } });
const promptStale = computed(() => composingPrompt.value && dailyPrompt.value && (composingPrompt.value.date !== dailyPrompt.value.date || composingPrompt.value.id !== dailyPrompt.value.id));
const promptText = prompt => prompt?.text?.[props.lang] || prompt?.text?.zh || '';
const lakeCopy = {
  zh: { lake: '月读湖上', compose: '写一封', writeHint: '写给一位还未见过的人。', send: '发送', sending: '正在发送', again: '再发一封', seaHint: '看看今晚的潮汐带来了什么。', speaker: '八千代', reply: '我看到你的灯了。', film: '流灯入月', skip: '跳过动画' },
  ja: { lake: '月読の湖', compose: '手紙を書く', writeHint: 'まだ会ったことのない誰かへ。', send: '送信', sending: '送信中', again: 'もう一通書く', seaHint: '今夜の潮は、何を運んできたのでしょう。', speaker: '八千代', reply: 'あなたの灯りが見えたよ。', film: '月へ流れる灯り', skip: 'スキップ' },
  en: { lake: 'Moonlit Lake', compose: 'Write a letter', writeHint: 'For someone you haven’t met yet.', send: 'Send', sending: 'Sending', again: 'Write another', seaHint: 'See what tonight’s tide has brought in.', speaker: 'Yachiyo', reply: 'I see your lantern.', film: 'A Lantern for the Moon', skip: 'Skip animation' }
};
const lake = computed(() => lakeCopy[props.lang] || lakeCopy.zh);
const activeTab = computed(() => {
  if (landing.value || ['bottles', 'chat'].includes(route.query.tab) || (route.query.bottle && !route.query.tab)) return 'bottles';
  return route.query.tab === 'sea' && !route.query.daily ? 'sea' : 'write';
});
const tabs = computed(() => [
  { key: 'write', label: lake.value.compose, icon: 'penLine' },
  { key: 'sea', label: copy.value.sea, icon: 'moonStar' },
  { key: 'bottles', label: copy.value.mine, icon: 'mail' }
]);
const reply = computed({ get: () => replyDrafts[current.value?.bottle.id] || '', set: value => { if (current.value) replyDrafts[current.value.bottle.id] = value; } });
const bottlePageSummary = computed(() => copy.value.pageSummary
  .replace('{page}', bottlePage.value)
  .replace('{pages}', bottleTotalPages.value)
  .replace('{total}', bottleTotal.value));
const canReply = computed(() => current.value?.bottle.status === 'approved' && current.value.bottle.recipient_id && !current.value.bottle.closed && !current.value.blocked);
const canReturn = computed(() => current.value && current.value.bottle.user_id !== session.value?.user.id && canReply.value && !current.value.replies.length);
const writing = computed(() => phase.value === 'reply');
const dialogTitle = computed(() => phase.value === 'sealed' ? copy.value.found : phase.value === 'reply' ? copy.value.replyTitle : copy.value.read);
const locale = computed(() => ({ zh: 'zh-CN', en: 'en', ja: 'ja' }[props.lang] || 'zh-CN'));
const dateLabel = value => formatDateMinute(value, locale.value);
function bottleStatus(b) {
  if (b.status !== 'approved') return copy.value[b.status];
  return b.closed ? copy.value.ended : b.recipient_id ? copy.value.picked : copy.value.drifting;
}
async function request(path, method = 'GET', body) {
  let response, result;
  try {
    response = await authFetch(path, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    result = await parseResponse(response);
  } catch {
    throw Object.assign(new Error(body?.requestId ? copy.value.submissionUnknown : copy.value.networkError), { code: body?.requestId ? 'DRIFT_SUBMISSION_UNKNOWN' : '' });
  }
  if (body?.requestId && (response.status >= 500 || (response.ok && !result.success))) throw Object.assign(new Error(copy.value.submissionUnknown), { code: 'DRIFT_SUBMISSION_UNKNOWN' });
  if (result.code === 'DRIFT_PROMPT_CHANGED') {
    dailyPrompt.value = result.data.prompt;
    throw new Error(copy.value.promptChanged);
  }
  if (response.status === 422) throw new Error(copy.value.invalidContent);
  if (response.status === 429) throw new Error(copy.value.rateLimited);
  if (!response.ok || !result.success) throw new Error(result.code === 'DRIFT_SUBMISSION_CONFLICT' ? copy.value.submissionConflict : result.message || copy.value.unavailable);
  return result.data;
}
async function run(action) {
  if (busy.value) return;
  busy.value = true;
  notice.value = '';
  try { await action(); } catch (error) { notice.value = ['TypeError', 'AbortError'].includes(error.name) ? copy.value.networkError : error.message; } finally { busy.value = false; }
}
async function load({ page = bottlePage.value, nextFilter = filter.value } = {}) {
  const params = new URLSearchParams({ page, filter: nextFilter });
  const result = await request(`/api/drift?${params}`);
  if (disposed) return;
  bottles.value = result.items;
  bottlePage.value = result.page;
  bottleTotalPages.value = result.totalPages;
  bottleTotal.value = result.total;
  filter.value = nextFilter;
}
function selectBottleFilter(nextFilter) {
  if (nextFilter !== filter.value) run(() => load({ page: 1, nextFilter }));
}
function goToBottlePage(page) {
  if (!Number.isSafeInteger(page) || page < 1 || page > bottleTotalPages.value || page === bottlePage.value) return;
  run(() => load({ page }));
}
function jumpToBottlePage(event) {
  const form = event.currentTarget;
  goToBottlePage(form.elements.page.valueAsNumber);
  form.reset();
}
async function loadThread(bottleId) {
  const requestRevision = ++revision;
  const data = await request(`/api/drift/${encodeURIComponent(bottleId)}`);
  if (disposed || requestRevision !== revision) return;
  if (current.value && String(current.value.bottle.id) === String(data.bottle.id) && JSON.stringify(data.replies) !== JSON.stringify(current.value.replies)) {
    hasNewLetters.value = true;
    translated.value = '';
  }
  current.value = data;
}
async function revealBottles() {
  landing.value = true;
  if (sentLetter.value) {
    const { prompt, submitted } = sentLetter.value;
    const submittedDraft = prompt ? dailyDraft : draft;
    if (submittedDraft.value === submitted) submittedDraft.value = '';
    if (prompt) pendingDaily.value = null;
    inspiration.value = null;
    sentLetter.value = null;
  }
  leavingWriter.value = false;
  try { await router.push({ query: { tab: 'bottles' } }); }
  finally { landing.value = false; }
  await nextTick();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
async function finishLantern() {
  lanternShot.value = null;
  await nextTick();
  panelHeading.value?.focus({ preventScroll: true });
}
async function returnToLake() {
  const start = Math.max(0, window.scrollY);
  const duration = Math.min(360, 180 + start * .65);
  const frame = () => new Promise(resolve => window.requestAnimationFrame(resolve));
  const began = await frame();
  for (let progress = 0; progress < 1 && !disposed;) {
    progress = Math.min(1, ((await frame()) - began) / duration);
    if (disposed || !start) continue;
    const eased = progress * progress * (3 - 2 * progress);
    window.scrollTo({ top: start * (1 - eased), behavior: 'instant' });
  }
}
async function playSentLantern() {
  // Give mobile keyboards time to retract before measuring the full lake.
  const viewport = window.visualViewport;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const keyboardIsOpen = () => window.innerHeight - (viewport?.height ?? window.innerHeight) > 100
    || Boolean(document.querySelector('.drift-scene-shell.is-keyboard-open'));
  for (let i = 0; i < 10 && !motion.matches && keyboardIsOpen(); i++) {
    await new Promise(resolve => window.setTimeout(resolve, 40));
  }
  if (disposed) return;
  let shot;
  if (!keyboardIsOpen() && !motion.matches) {
    leavingWriter.value = true;
    await returnToLake();
    if (disposed) return;
    if (!motion.matches) shot = lakeScene.value?.measure();
  }
  if (shot) lanternShot.value = { ...shot, copy: lake.value };
  else {
    await revealBottles();
    await finishLantern();
  }
}
async function selectTab(key) {
  notice.value = '';
  composingPrompt.value = null;
  await router.push({ query: key === 'write' ? {} : { tab: key } });
  await nextTick();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function tabKeydown(event, index) {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!keys.includes(event.key) || busy.value || lanternShot.value) return;
  event.preventDefault();
  const size = tabs.value.length;
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? size - 1
    : (index + (event.key === 'ArrowRight' ? 1 : -1) + size) % size;
  tabBar.value?.querySelectorAll('[role="tab"]')[next]?.focus();
  selectTab(tabs.value[next].key);
}
async function showDialog(nextPhase) {
  phase.value = nextPhase;
  await nextTick();
  if (!bottleDialog.value?.open) bottleDialog.value?.showModal();
  if (letterScroll.value) letterScroll.value.scrollTop = 0;
  if (nextPhase === 'reply') writingArea.value?.focus();
}
async function writeBottle() {
  await selectTab('write');
  panelHeading.value?.focus({ preventScroll: true });
}
async function writeDaily() {
  const attempt = pendingDaily.value;
  if (attempt) {
    composingPrompt.value = attempt.prompt;
    notice.value = copy.value.submissionUnknown;
  } else {
    dailyPrompt.value = await request('/api/drift/daily-prompt');
    composingPrompt.value = dailyPrompt.value;
    notice.value = '';
  }
  if (activeTab.value !== 'write') await router.push({ query: { daily: '1' } });
  await nextTick();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function inspire() {
  const choices = prompts.filter(prompt => prompt.id !== inspiration.value?.id);
  inspiration.value = choices[Math.floor(Math.random() * choices.length)];
}
function closeDialog() { bottleDialog.value?.close(); }
function dialogClosed() {
  phase.value = 'idle';
  if (route.query.bottle) {
    const { bottle, ...query } = route.query;
    router.replace({ query });
  }
}
async function open(bottleId, { sealed = false, updateRoute = true } = {}) {
  await loadThread(bottleId);
  translated.value = '';
  hasNewLetters.value = false;
  if (updateRoute) await router.push({ query: { tab: activeTab.value, bottle: bottleId } });
  await showDialog(sealed ? 'sealed' : 'read');
}
async function pick() {
  const result = await request('/api/drift/pick', 'POST');
  if (!result) { notice.value = copy.value.empty; return; }
  await load({ page: 1, nextFilter: 'all' });
  await open(result.id, { sealed: true });
}
async function send() {
  composeArea.value?.blur();
  const prompt = composingPrompt.value;
  let attempt = prompt && pendingDaily.value;
  if (!attempt) {
    const scope = `${session.value.user.id}:bottle${prompt ? `:daily:${prompt.date}:${prompt.id}` : ''}`;
    const payload = await submissions.prepare(scope, activeDraft.value, props.lang);
    if (prompt) Object.assign(payload, { promptDate: prompt.date, promptId: prompt.id });
    attempt = { scope, payload, prompt };
  }
  const { scope, payload } = attempt;
  const submitted = payload.content;
  // Until the receipt is known, retain the original day, body and language in
  // memory. A rollover or reopened writer must not create a second submission.
  if (prompt) pendingDaily.value = attempt;
  let result;
  try { result = await request(prompt ? '/api/drift/daily' : '/api/drift', 'POST', payload); }
  catch (error) {
    if (prompt && error.code !== 'DRIFT_SUBMISSION_UNKNOWN') pendingDaily.value = null;
    throw error;
  }
  submissions.complete(scope, payload.requestId);
  // Fetch current state: a durable receipt can contain an older growth snapshot.
  if (prompt) loadGrowth({ force: true }).catch(() => {});
  if (disposed) return;
  // Leave the paper and its contents in place until the film covers the cut.
  sentLetter.value = { prompt, submitted };
  const completed = result.growth?.award?.awarded && result.growth.award.eventKey === 'daily_drift_prompt'
    ? copy.value.questCompleted.replace('{xp}', String(result.growth.award.xp)) : '';
  notice.value = completed || `${prompt ? copy.value.dailySaved : copy.value.saved} · ${copy.value[result.status]}`;
  lastSentId.value = result.id;
  // Load the shelf during the film so the saved bottle is already waiting.
  const refresh = load({ page: 1, nextFilter: 'sent' }).catch(() => {
    notice.value = `${completed ? `${completed} ` : ''}${copy.value.savedRefreshFailed}`;
  });
  await playSentLantern();
  await refresh;
}
async function latestLetters() {
  await nextTick();
  if (letterScroll.value) letterScroll.value.scrollTop = letterScroll.value.scrollHeight;
  hasNewLetters.value = false;
}
async function sendReply() {
  const bottleId = current.value.bottle.id;
  const submitted = reply.value;
  const scope = `${session.value.user.id}:reply:${bottleId}`;
  const payload = await submissions.prepare(scope, submitted, props.lang);
  const result = await request(`/api/drift/${bottleId}/replies`, 'POST', payload);
  submissions.complete(scope, payload.requestId);
  if (replyDrafts[bottleId] === submitted) replyDrafts[bottleId] = '';
  try { await loadThread(bottleId); }
  catch {
    await showDialog('read');
    notice.value = copy.value.savedRefreshFailed;
    return;
  }
  await showDialog('read');
  notice.value = `${copy.value.saved} · ${copy.value[result.status]}`;
  await latestLetters();
}
async function refreshThread() {
  if (!current.value || refreshing.value || busy.value || !['read', 'reply'].includes(phase.value) || document.visibilityState !== 'visible') return;
  refreshing.value = true;
  try { await loadThread(current.value.bottle.id); }
  catch (_) { /* Keep the current note and unsent letter available; manual refresh reports errors. */ }
  finally { refreshing.value = false; }
}
async function refreshDailyPrompt() {
  if (!session.value || document.visibilityState !== 'visible') return;
  try {
    const prompt = await request('/api/drift/daily-prompt');
    if (!disposed) dailyPrompt.value = prompt;
  } catch { /* Opening the daily writer retries; keep the current draft. */ }
}
async function throwBack() {
  await request(`/api/drift/${current.value.bottle.id}/return`, 'POST');
  closeDialog();
  current.value = null;
  await load();
  await selectTab('sea');
  notice.value = copy.value.returned;
}
async function act(action) {
  if (!window.confirm(copy.value.confirm)) return;
  await request(`/api/drift/${current.value.bottle.id}/${action}`, 'POST');
  revision++;
  closeDialog();
  current.value = null;
  await router.replace({ query: { tab: 'bottles' } });
  await load();
}
async function follow() {
  await request(`/api/user/follow/${encodeURIComponent(current.value.peer.id)}`, 'POST');
  notice.value = copy.value.followed;
}
function translationSource() {
  return current.value && JSON.stringify([current.value.bottle.id, current.value.bottle.content, current.value.replies.map(r => [r.id, r.content, r.status])]);
}
async function translate() {
  const source = translationSource();
  const texts = [current.value.bottle.content, ...current.value.replies.map(r => r.content)];
  const output = [];
  for (let start = 0; start < texts.length; start += 8) {
    const batch = texts.slice(start, start + 8);
    const response = await fetch('/en-translate-private', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texts: batch, private: true }) });
    if (!response.ok) throw new Error(copy.value.unavailable);
    const result = await response.json();
    if (!Array.isArray(result.translations) || result.translations.length !== batch.length) throw new Error(copy.value.unavailable);
    output.push(...result.translations);
  }
  if (!disposed && props.lang === 'en' && translationSource() === source) translated.value = output.join('\n\n');
}
onMounted(async () => {
  await run(async () => {
    session.value = await loadCurrentSession();
    if (!session.value) return;
    await load();
    dailyPrompt.value = await request('/api/drift/daily-prompt');
    if (route.query.bottle) await open(route.query.bottle, { updateRoute: false });
    else if (route.query.daily === '1') await writeDaily();
  });
  loading.value = false;
  if (session.value && !disposed) {
    pollTimer = window.setInterval(refreshThread, 8000);
    promptTimer = window.setInterval(refreshDailyPrompt, 60000);
    window.addEventListener('focus', refreshThread);
    window.addEventListener('focus', refreshDailyPrompt);
    document.addEventListener('visibilitychange', refreshThread);
  }
});
onUnmounted(() => {
  disposed = true;
  revision++;
  clearInterval(pollTimer);
  clearInterval(promptTimer);
  window.removeEventListener('focus', refreshThread);
  window.removeEventListener('focus', refreshDailyPrompt);
  document.removeEventListener('visibilitychange', refreshThread);
});
watch(() => route.query.bottle, value => {
  if (loading.value || busy.value) return;
  if (value && (!bottleDialog.value?.open || String(current.value?.bottle.id) !== String(value))) run(() => open(value, { updateRoute: false }));
  else if (!value && bottleDialog.value?.open) closeDialog();
});
watch(() => route.query.daily, value => {
  if (value === '1' && !loading.value && !busy.value && session.value && !route.query.bottle) run(writeDaily);
});
</script>

<template>
  <main class="page drift-page" :data-tab="activeTab" :data-playing="leavingWriter ? 'true' : undefined">
    <DriftLanternScene ref="lakeScene" :playing="!!lanternShot && leavingWriter" />
    <DriftLanternFilm v-if="lanternShot" :shot="lanternShot" @cover="revealBottles" @finish="finishLantern" />

    <div class="drift-stage">
      <header class="drift-identity">
        <p class="drift-eyebrow">{{ lake.lake }} <span aria-hidden="true">/</span> TSUKUYOMI</p>
        <h1>{{ copy.title }}</h1>
        <p>{{ copy.intro }}</p>
      </header>

      <div class="drift-workspace">
        <nav ref="tabBar" class="drift-tabs" role="tablist" :aria-label="copy.navigation">
          <button v-for="(tab, index) in tabs" :id="`drift-tab-${tab.key}`" :key="tab.key" type="button"
            role="tab" :aria-selected="activeTab === tab.key" :aria-controls="activeTab === tab.key ? `drift-panel-${tab.key}` : undefined"
            :tabindex="activeTab === tab.key ? 0 : -1" :disabled="busy" @click="selectTab(tab.key)" @keydown="tabKeydown($event, index)">
            <TsIcon :name="tab.icon" :size="17" />{{ tab.label }}
          </button>
        </nav>

        <section :id="`drift-panel-${activeTab}`" class="drift-panel" role="tabpanel" :aria-labelledby="`drift-tab-${activeTab}`">
          <header class="drift-panel-heading">
            <div>
              <h2 ref="panelHeading" tabindex="-1">{{ activeTab === 'bottles' ? copy.mine : activeTab === 'sea' ? copy.sea : composingPrompt ? copy.dailyWrite : copy.write }}</h2>
              <p v-if="activeTab === 'sea'">{{ lake.seaHint }}</p>
              <p v-else-if="activeTab === 'bottles'">{{ copy.lettersHint }}</p>
              <p v-else-if="!composingPrompt">{{ lake.writeHint }}</p>
            </div>
            <button v-if="session && activeTab === 'bottles'" type="button" class="drift-icon-button" :aria-label="copy.refresh" :disabled="busy" @click="run(() => load())">
              <TsIcon name="refresh" :size="18" />
            </button>
          </header>
          <p v-if="notice && !sentLetter && phase === 'idle'" class="drift-notice" role="status">{{ notice }}</p>
          <p v-if="loading" class="drift-loading" role="status">{{ copy.loading }}</p>
          <RouterLink v-else-if="!session" :to="{ path: '/login', query: { redirect: route.fullPath } }" class="drift-primary drift-login">
            {{ copy.login }}<TsIcon name="arrowRight" :size="17" />
          </RouterLink>

          <form v-else-if="activeTab === 'write'" class="drift-compose" @submit.prevent="run(send)">
            <aside v-if="composingPrompt" id="drift-composing-context" class="drift-prompt-context" aria-live="polite">
              <strong>{{ copy.dailyTitle }}</strong><time>{{ composingPrompt.date }}</time><p>{{ promptText(composingPrompt) }}</p>
              <p v-if="promptStale && !pendingDaily">{{ copy.promptChanged }}</p>
              <button v-if="promptStale && !pendingDaily" type="button" :disabled="busy" @click="composingPrompt = dailyPrompt; notice = ''">{{ copy.useTodayPrompt }}</button>
            </aside>
            <aside v-else-if="inspiration" id="drift-composing-context" class="drift-prompt-context"><p>{{ promptText(inspiration) }}</p></aside>
            <div class="drift-writing-paper">
              <label for="drift-draft">{{ copy.toSea }}</label>
              <textarea id="drift-draft" ref="composeArea" v-model="activeDraft" :readonly="busy || Boolean(composingPrompt && pendingDaily)"
                :aria-describedby="composingPrompt || inspiration ? 'drift-composing-context' : undefined"
                :placeholder="composingPrompt ? copy.dailyWriteHint : copy.writeHint" maxlength="2000" rows="4" required />
              <small>{{ [...activeDraft].length }} / 2000</small>
            </div>
            <footer class="drift-compose-actions">
              <button v-if="!composingPrompt" class="drift-quiet" type="button" :disabled="busy" @click="inspire">
                <TsIcon name="sparkles" :size="16" />{{ copy.inspire }}
              </button>
              <button v-else class="drift-quiet" type="button" :disabled="busy" @click="writeBottle">{{ copy.cancel }}</button>
              <button class="drift-primary" type="submit" :disabled="busy || !!sentLetter || (promptStale && !pendingDaily) || !activeDraft.trim()">
                <TsIcon name="send" :size="16" />{{ busy || sentLetter ? lake.sending : composingPrompt && pendingDaily ? copy.confirmSubmission : lake.send }}
              </button>
            </footer>
          </form>

          <div v-else-if="activeTab === 'sea'" class="drift-sea-actions">
            <button class="drift-primary" type="button" :disabled="busy" @click="run(pick)">
              <TsIcon name="sparkles" :size="18" />{{ copy.pick }}
            </button>
            <button type="button" :disabled="busy" @click="writeBottle">
              <TsIcon name="penLine" :size="18" />{{ lake.again }}
            </button>
          </div>

          <template v-else>
            <div class="drift-filters">
              <button v-for="item in [{ key: 'all', label: copy.all }, { key: 'sent', label: copy.sentFilter }, { key: 'received', label: copy.receivedFilter }]"
                :key="item.key" type="button" :aria-pressed="filter === item.key" :disabled="busy" @click="selectBottleFilter(item.key)">{{ item.label }}</button>
            </div>
            <nav v-if="bottleTotalPages > 1" class="drift-pagination" :aria-label="copy.pagination">
              <p aria-live="polite">{{ bottlePageSummary }}</p>
              <div class="drift-pagination-actions">
                <button type="button" :aria-label="copy.previousPage" :title="copy.previousPage" :disabled="busy || bottlePage <= 1" @click="goToBottlePage(bottlePage - 1)">
                  <TsIcon name="arrowLeft" :size="18" />
                </button>
                <button type="button" :aria-label="copy.nextPage" :title="copy.nextPage" :disabled="busy || bottlePage >= bottleTotalPages" @click="goToBottlePage(bottlePage + 1)">
                  <TsIcon name="arrowRight" :size="18" />
                </button>
              </div>
              <form class="drift-page-jump" @submit.prevent="jumpToBottlePage">
                <input type="number" name="page" min="1" :max="bottleTotalPages" required inputmode="numeric" enterkeyhint="go"
                  autocomplete="off" :aria-label="copy.pageNumber" :placeholder="`1–${bottleTotalPages}`" :disabled="busy">
                <button type="submit" :disabled="busy">{{ copy.jumpPage }}</button>
              </form>
            </nav>
            <div v-if="!bottles.length && filter === 'all'" class="drift-empty">
              <DriftBottle /><div><h3>{{ copy.noBottles }}</h3><p>{{ copy.noBottlesHint }}</p></div>
              <button type="button" @click="selectTab('sea')">{{ copy.sea }}<TsIcon name="arrowRight" :size="16" /></button>
            </div>
            <p v-else-if="!bottles.length" class="drift-empty">{{ copy.emptyFilter }}</p>
            <div v-else class="drift-bottle-shelf">
              <button v-for="b in bottles" :key="b.id" class="drift-list-item" :class="{ 'is-new': b.id === lastSentId }" type="button" :disabled="busy" @click="run(() => open(b.id))">
                <DriftBottle class="drift-shelf-bottle" />
                <span class="drift-list-copy">
                  <span class="drift-list-meta"><small>{{ b.user_id === session.user.id ? copy.sent : `${copy.from} ${b.nickname}` }}</small><small>{{ bottleStatus(b) }}</small></span>
                  <span class="drift-preview" translate="no">{{ b.content }}</span>
                  <small v-if="b.dailyPrompt" class="drift-daily-badge">{{ copy.dailyResponse }}</small>
                  <time>{{ dateLabel(b.created_at) }}</time>
                </span>
                <TsIcon name="chevronRight" :size="17" />
              </button>
            </div>
          </template>
        </section>

        <div v-if="session" class="drift-workspace-foot">
          <button v-if="dailyPrompt && !composingPrompt && activeTab !== 'bottles'" class="drift-quiet drift-daily-link" type="button" :disabled="busy" @click="run(writeDaily)">
            <TsIcon name="moonStar" :size="15" />{{ copy.dailyWrite }}
          </button>
          <details class="drift-rules"><summary>{{ copy.rules }}</summary><p>{{ copy.rule }}</p></details>
        </div>
      </div>
    </div>

    <dialog ref="bottleDialog" class="drift-bottle-dialog" :class="{ 'is-writing': writing, 'is-sealed': phase === 'sealed' }" aria-labelledby="drift-letter-title" @close="dialogClosed">
      <header class="drift-dialog-header"><div><p class="drift-eyebrow">A MESSAGE IN A BOTTLE</p><h2 id="drift-letter-title">{{ dialogTitle }}</h2></div><button class="drift-icon-button" :aria-label="copy.closeWindow" @click="closeDialog"><TsIcon name="x" :size="21" /></button></header>
      <p v-if="notice" class="drift-dialog-notice" role="status">{{ notice }}</p>
      <div v-if="phase === 'sealed'" class="drift-found"><div class="drift-found-glow"><DriftBottle /></div><p>{{ copy.foundHint }}</p><button class="drift-primary" @click="showDialog('read')">{{ copy.openBottle }}<TsIcon name="arrowRight" :size="17" /></button></div>
      <template v-else-if="current && (phase === 'read' || phase === 'reply')">
        <template v-if="phase === 'read'">
          <div ref="letterScroll" class="drift-letter-scroll">
            <div class="drift-letter-byline"><DriftBottle /><div><span>{{ copy.from }} {{ current.bottle.nickname }}</span><time>{{ dateLabel(current.bottle.created_at) }}</time></div><button class="drift-icon-button" :aria-label="copy.refreshChat" :disabled="busy || refreshing" @click="run(() => loadThread(current.bottle.id))"><TsIcon name="refresh" :size="17" /></button></div>
            <article class="drift-paper drift-original-paper"><p class="drift-content" translate="no">{{ current.bottle.content }}</p><small v-if="current.bottle.status !== 'approved'" class="drift-letter-status">{{ copy[current.bottle.status] }}</small></article>
            <p v-if="!current.bottle.recipient_id" class="drift-thread-note">{{ copy.waitingHint }}</p>
            <section v-if="current.replies.length" class="drift-correspondence" :aria-label="copy.correspondence"><header><h3>{{ copy.correspondence }}<small>{{ current.replies.length }}</small></h3></header><article v-for="r in current.replies" :key="r.id" class="drift-reply"><header><span>{{ r.user_id === session.user.id ? copy.you : current.peer?.nickname }}</span><time>{{ dateLabel(r.created_at) }}</time></header><p class="drift-content" translate="no">{{ r.content }}</p><small v-if="r.status !== 'approved'" class="drift-letter-status">{{ copy[r.status] }}</small></article></section>
            <button v-if="hasNewLetters" class="drift-new-letter" @click="latestLetters">{{ copy.newLetter }}<TsIcon name="chevronDown" :size="16" /></button>
            <details v-if="lang === 'en'" class="drift-translation"><summary>{{ copy.translate }}</summary><p>{{ copy.translationHint }}</p><button :disabled="busy" @click="run(translate)">{{ copy.translate }}</button><p v-if="translated" class="drift-content" translate="no">{{ translated }}</p><small>{{ copy.original }}</small></details>
            <details class="drift-letter-options"><summary>{{ copy.more }}</summary><div class="drift-actions"><template v-if="current.peer"><RouterLink :to="`/users/${encodeURIComponent(current.peer.username)}`" @click="closeDialog">{{ copy.profile }}</RouterLink><button :disabled="busy || current.blocked" @click="run(follow)">{{ copy.follow }}</button></template><button :disabled="busy" @click="run(() => act('close'))">{{ copy.close }}</button><template v-if="current.peer"><button :disabled="busy" @click="run(() => act('block'))">{{ copy.block }}</button><button :disabled="busy" @click="run(() => act('report'))">{{ copy.report }}</button></template></div></details>
          </div>
          <footer class="drift-reader-footer"><p v-if="current.bottle.closed || current.blocked" class="drift-thread-note">{{ copy.closed }}</p><div class="drift-letter-actions"><button v-if="canReturn" :disabled="busy" @click="run(throwBack)">{{ copy.throwBack }}</button><button v-else @click="closeDialog">{{ copy.putAway }}</button><button v-if="canReply" class="drift-primary" @click="showDialog('reply')"><TsIcon name="send" :size="16" />{{ copy.respond }}</button></div></footer>
        </template>
        <form v-else class="drift-letter-form" @submit.prevent="run(sendReply)"><blockquote class="drift-reply-context" translate="no">{{ current.bottle.content }}</blockquote><div class="drift-writing-paper"><label for="drift-reply">{{ copy.replyTitle }}</label><textarea id="drift-reply" ref="writingArea" v-model="reply" :placeholder="copy.replyPlaceholder" maxlength="2000" rows="6" required /><small>{{ [...reply].length }} / 2000</small></div><footer class="drift-letter-actions"><button type="button" @click="showDialog('read')">{{ copy.cancel }}</button><button class="drift-primary" :disabled="busy || !reply.trim()">{{ copy.sendLetter }}<TsIcon name="send" :size="16" /></button></footer></form>
        <small class="drift-privacy">{{ copy.privacy }}</small>
      </template>
    </dialog>
  </main>
</template>
