<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authFetch, parseResponse, getSession, loadCurrentSession } from '../api/client';
import { driftCopy } from '../data/driftCopy';
import { createDriftSubmissions } from '../services/driftSubmission';
import { formatDateMinute } from '../utils/time';
import DriftBottle from '../components/DriftBottle.vue';
import TsIcon from '../components/TsIcon.vue';

const props = defineProps({ lang: { type: String, default: 'zh' } });
const route = useRoute();
const router = useRouter();
const session = ref(getSession());
const bottles = ref([]);
const current = ref(null);
const draft = ref('');
const replyDrafts = reactive({});
const submissions = createDriftSubmissions();
const busy = ref(false);
const loading = ref(true);
const refreshing = ref(false);
const notice = ref('');
const translated = ref('');
const filter = ref('all');
const hasMore = ref(false);
const phase = ref('idle');
const bottleDialog = ref(null);
const letterScroll = ref(null);
const writingArea = ref(null);
const tabBar = ref(null);
const hasNewLetters = ref(false);
let pollTimer;
let disposed = false;
let revision = 0;

const copy = computed(() => driftCopy[props.lang] || driftCopy.zh);
const activeTab = computed(() => route.query.tab === 'bottles' || route.query.tab === 'chat' || (!route.query.tab && route.query.bottle) ? 'bottles' : 'sea');
const tabs = computed(() => [{ key: 'sea', label: copy.value.sea, icon: 'moonStar' }, { key: 'bottles', label: copy.value.mine, icon: 'mail' }]);
const reply = computed({ get: () => replyDrafts[current.value?.bottle.id] || '', set: value => { if (current.value) replyDrafts[current.value.bottle.id] = value; } });
const visibleBottles = computed(() => bottles.value.filter(b => filter.value === 'all' || (filter.value === 'sent') === (b.user_id === session.value?.user.id)));
const canReply = computed(() => current.value?.bottle.status === 'approved' && current.value.bottle.recipient_id && !current.value.bottle.closed && !current.value.blocked);
const canReturn = computed(() => current.value && current.value.bottle.user_id !== session.value?.user.id && canReply.value && !current.value.replies.length);
const writing = computed(() => phase.value === 'write' || phase.value === 'reply');
const dialogTitle = computed(() => phase.value === 'write' ? copy.value.write : phase.value === 'sealed' ? copy.value.found : phase.value === 'reply' ? copy.value.replyTitle : copy.value.read);
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
    throw new Error(body?.requestId ? copy.value.submissionUnknown : copy.value.networkError);
  }
  if (body?.requestId && (response.status >= 500 || (response.ok && !result.success))) throw new Error(copy.value.submissionUnknown);
  if (!response.ok || !result.success) throw new Error(result.code === 'DRIFT_SUBMISSION_CONFLICT' ? copy.value.submissionConflict : result.message || copy.value.unavailable);
  return result.data;
}
async function run(action) {
  if (busy.value) return;
  busy.value = true;
  notice.value = '';
  try { await action(); } catch (error) { notice.value = ['TypeError', 'AbortError'].includes(error.name) ? copy.value.networkError : error.message; } finally { busy.value = false; }
}
async function load(older = false) {
  const before = older && bottles.value.at(-1)?.id;
  const rows = await request(`/api/drift${before ? `?before=${before}` : ''}`);
  bottles.value = older ? [...bottles.value, ...rows] : rows;
  hasMore.value = rows.length === 30;
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
async function selectTab(key) {
  await router.push({ query: { tab: key } });
  await nextTick();
  tabBar.value?.scrollIntoView({ block: 'start' });
}
function tabKeydown(event, index) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
  tabBar.value?.querySelectorAll('[role="tab"]')[next]?.focus();
  selectTab(tabs.value[next].key);
}
async function showDialog(nextPhase) {
  phase.value = nextPhase;
  await nextTick();
  if (!bottleDialog.value?.open) bottleDialog.value?.showModal();
  if (letterScroll.value) letterScroll.value.scrollTop = 0;
  if (nextPhase === 'write' || nextPhase === 'reply') writingArea.value?.focus();
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
  await load();
  await open(result.id, { sealed: true });
}
async function send() {
  const submitted = draft.value;
  const scope = `${session.value.user.id}:bottle`;
  const payload = await submissions.prepare(scope, submitted, props.lang);
  const result = await request('/api/drift', 'POST', payload);
  submissions.complete(scope, payload.requestId);
  if (draft.value === submitted) draft.value = '';
  closeDialog();
  notice.value = `${copy.value.saved} · ${copy.value[result.status]}`;
  filter.value = 'sent';
  await selectTab('bottles');
  try { await load(); } catch { notice.value = copy.value.savedRefreshFailed; }
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
async function throwBack() {
  await request(`/api/drift/${current.value.bottle.id}/return`, 'POST');
  closeDialog();
  current.value = null;
  notice.value = copy.value.returned;
  await load();
  await selectTab('sea');
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
async function translate() {
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
  translated.value = output.join('\n\n');
}
onMounted(async () => {
  await run(async () => {
    session.value = await loadCurrentSession();
    if (!session.value) return;
    await load();
    loading.value = false;
    if (route.query.bottle) await open(route.query.bottle, { updateRoute: false });
  });
  loading.value = false;
  if (session.value && !disposed) {
    pollTimer = window.setInterval(refreshThread, 8000);
    window.addEventListener('focus', refreshThread);
    document.addEventListener('visibilitychange', refreshThread);
  }
});
onUnmounted(() => {
  disposed = true;
  revision++;
  clearInterval(pollTimer);
  window.removeEventListener('focus', refreshThread);
  document.removeEventListener('visibilitychange', refreshThread);
});
watch(() => route.query.bottle, value => {
  if (loading.value || busy.value) return;
  if (value && (!bottleDialog.value?.open || String(current.value?.bottle.id) !== String(value))) run(() => open(value, { updateRoute: false }));
  else if (!value && bottleDialog.value?.open && phase.value !== 'write') closeDialog();
});
</script>

<template>
  <main class="page drift-page">
    <header class="drift-header"><span class="drift-brand-mark" aria-hidden="true"><TsIcon name="moonStar" :size="25" /></span><div><p class="drift-eyebrow">TSUKUYOMI · TIDE</p><h1>{{ copy.title }}</h1></div><p class="drift-header-intro">{{ copy.intro }}</p></header>
      <nav ref="tabBar" class="drift-tabs" role="tablist" :aria-label="copy.navigation"><button v-for="(tab, index) in tabs" :id="`drift-tab-${tab.key}`" :key="tab.key" role="tab" :aria-selected="activeTab === tab.key" :aria-controls="`drift-panel-${tab.key}`" :tabindex="activeTab === tab.key ? 0 : -1" :disabled="busy" @click="selectTab(tab.key)" @keydown="tabKeydown($event, index)"><TsIcon :name="tab.icon" :size="18" />{{ tab.label }}</button></nav>
      <p v-if="notice && phase === 'idle'" class="drift-notice" role="status">{{ notice }}</p>
      <p v-if="loading" class="drift-loading" role="status">{{ copy.loading }}</p>
      <RouterLink v-else-if="!session" to="/login?redirect=%2Fdrift" class="drift-panel drift-login">{{ copy.login }}<TsIcon name="arrowRight" :size="18" /></RouterLink>
      <template v-else>
        <section v-show="activeTab === 'sea'" id="drift-panel-sea" role="tabpanel" aria-labelledby="drift-tab-sea" class="drift-ocean">
          <div class="drift-ocean-sky" aria-hidden="true"><span class="drift-ocean-moon"></span><i class="drift-star star-one"></i><i class="drift-star star-two"></i><i class="drift-star star-three"></i></div><div class="drift-ocean-water" aria-hidden="true"><span class="drift-moonlight"></span><i class="drift-wave wave-one"></i><i class="drift-wave wave-two"></i><DriftBottle class="drift-floating-bottle" /></div><div class="drift-ocean-beach" aria-hidden="true"></div>
          <div class="drift-ocean-copy"><p class="drift-eyebrow">LET THE TIDE CARRY YOUR WORDS</p><h2>{{ copy.seaTitle }}</h2><p>{{ copy.seaHint }}</p></div>
          <div class="drift-shore-dock"><button class="drift-dock-action" :disabled="busy" @click="showDialog('write')"><span class="drift-dock-icon"><DriftBottle /></span><strong>{{ copy.throw }}</strong></button><button class="drift-dock-action drift-dock-pick" :disabled="busy" @click="run(pick)"><span class="drift-dock-icon"><TsIcon name="sparkles" :size="32" /></span><strong>{{ copy.pick }}</strong></button><button class="drift-dock-action" @click="selectTab('bottles')"><span class="drift-dock-icon"><TsIcon name="mail" :size="31" /></span><strong>{{ copy.mine }}</strong></button></div>
        </section>
        <section v-show="activeTab === 'bottles'" id="drift-panel-bottles" role="tabpanel" aria-labelledby="drift-tab-bottles" class="drift-panel drift-inbox">
          <header class="drift-section-header"><div><h2>{{ copy.mine }}</h2><p>{{ copy.lettersHint }}</p></div><button class="drift-icon-button" :aria-label="copy.refresh" :disabled="busy" @click="run(() => load())"><TsIcon name="refresh" :size="18" /></button></header>
          <div class="drift-filters"><button v-for="item in [{ key: 'all', label: copy.all }, { key: 'sent', label: copy.sentFilter }, { key: 'received', label: copy.receivedFilter }]" :key="item.key" :aria-pressed="filter === item.key" @click="filter = item.key">{{ item.label }}</button></div>
          <div v-if="!bottles.length" class="drift-empty"><DriftBottle /><h3>{{ copy.noBottles }}</h3><p>{{ copy.noBottlesHint }}</p><button @click="selectTab('sea')">{{ copy.sea }}<TsIcon name="arrowRight" :size="16" /></button></div><p v-else-if="!visibleBottles.length" class="drift-empty">{{ copy.emptyFilter }}</p>
          <div class="drift-bottle-shelf"><button v-for="b in visibleBottles" :key="b.id" class="drift-list-item" :disabled="busy" @click="run(() => open(b.id))"><DriftBottle class="drift-shelf-bottle" /><span class="drift-list-copy"><span class="drift-list-meta"><small>{{ b.user_id === session.user.id ? copy.sent : `${copy.from} ${b.nickname}` }}</small><small>{{ bottleStatus(b) }}</small></span><span class="drift-preview" translate="no">{{ b.content }}</span><time>{{ dateLabel(b.created_at) }}</time></span><TsIcon name="chevronRight" :size="18" /></button></div><button v-if="hasMore" class="drift-older" :disabled="busy" @click="run(() => load(true))">{{ copy.older }}</button>
        </section>
        <details class="drift-rules"><summary>{{ copy.rules }}</summary><p>{{ copy.rule }}</p></details>
      </template>

    <dialog ref="bottleDialog" class="drift-bottle-dialog" :class="{ 'is-writing': writing, 'is-sealed': phase === 'sealed' }" aria-labelledby="drift-letter-title" @close="dialogClosed">
      <header class="drift-dialog-header"><div><p class="drift-eyebrow">A MESSAGE IN A BOTTLE</p><h2 id="drift-letter-title">{{ dialogTitle }}</h2></div><button class="drift-icon-button" :aria-label="copy.closeWindow" @click="closeDialog"><TsIcon name="x" :size="21" /></button></header>
      <p v-if="notice" class="drift-dialog-notice" role="status">{{ notice }}</p>
      <div v-if="phase === 'sealed'" class="drift-found"><div class="drift-found-glow"><DriftBottle /></div><p>{{ copy.foundHint }}</p><button class="drift-primary" @click="showDialog('read')">{{ copy.openBottle }}<TsIcon name="arrowRight" :size="17" /></button></div>
      <template v-else-if="phase === 'write'">
        <form class="drift-letter-form" @submit.prevent="run(send)"><div class="drift-writing-paper"><label for="drift-draft">{{ copy.toSea }}</label><textarea id="drift-draft" ref="writingArea" v-model="draft" :placeholder="copy.writeHint" maxlength="2000" rows="7" required /><small>{{ [...draft].length }} / 2000</small></div><footer class="drift-letter-actions"><button type="button" @click="closeDialog">{{ copy.cancel }}</button><button class="drift-primary" :disabled="busy || !draft.trim()">{{ copy.send }}<TsIcon name="send" :size="16" /></button></footer></form>
      </template>
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
