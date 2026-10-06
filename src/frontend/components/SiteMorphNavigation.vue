<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import TsIcon from './TsIcon.vue';
import { warmRoutePath } from '../router';
import studyArt from '../assets/navigation/star-study.webp';
import wikiArt from '../assets/navigation/wiki-study.webp';
import plazaArt from '../assets/navigation/plaza-gathering.webp';
import galleryArt from '../assets/navigation/gallery-yachiyo.webp';
import pixelArt from '../assets/navigation/pixel-workshop.webp';
import gameArt from '../assets/navigation/kaguya-run.webp';
import { activeSeason } from '../composables/useSeasonTheme';
import { siteArt } from '../data/siteArt';

const props = defineProps({
  items: { type: Array, required: true },
  copy: { type: Object, required: true },
  label: { type: String, required: true },
  homeLabel: { type: String, required: true },
  routeName: { type: String, required: true }
});
const emit = defineEmits(['navigate', 'open']);
const order = ['discover', 'create', 'spaces'];
const navigation = ref(null);
const floating = ref(null);
const current = ref(null);
const visible = ref(false);
const instant = ref(true);
const previewKey = ref('wiki');
const loadedGroups = ref(new Set());
const geometry = ref({});
const triggers = new Map();
const panels = new Map();
let closeTimer = 0;
let openFrame = 0;
let updateRun = 0;
let openedByHover = false;
let pinned = false;
let desktopQuery;

const home = computed(() => props.items.find(item => item.key === 'hub'));
const groups = computed(() => [
  { key: 'discover', label: props.copy.menuLabels.discover, keys: ['wiki', 'plaza', 'gallery', 'game'] },
  { key: 'create', label: props.copy.menuLabels.create, keys: ['stage', 'pixel'] },
  { key: 'spaces', label: props.copy.menuLabels.spaces, keys: ['agentOs', 'reality', 'friendLinks', 'growth', 'rss'] }
].map(group => ({ ...group, items: group.keys.map(key => props.items.find(item => item.key === key)).filter(Boolean) })));
const artwork = computed(() => ({
  stage: studyArt, wiki: wikiArt, plaza: plazaArt, gallery: galleryArt, pixel: pixelArt, game: gameArt,
  ...(activeSeason.value !== 'spring' ? { stage: siteArt.articleCover, plaza: siteArt.galleryCover, gallery: siteArt.hero, pixel: siteArt.pixelCover } : {})
}));
const preview = computed(() => groups.value[0].items.find(item => item.key === previewKey.value) || groups.value[0].items[0]);

function cancelClose() {
  window.clearTimeout(closeTimer);
}
function place(key) {
  const trigger = triggers.get(key);
  const panel = panels.get(key);
  if (!trigger || !panel || !navigation.value) return;
  const rect = trigger.getBoundingClientRect();
  // BoundingClientRect includes the closed surface's scale, which would make
  // the first opening too narrow and clip the selected panel.
  const width = panel.offsetWidth;
  const top = navigation.value.getBoundingClientRect().bottom + 10;
  geometry.value = {
    '--morph-x': `${Math.max(12, Math.min(rect.left - 18, window.innerWidth - width - 12))}px`,
    '--morph-top': `${top}px`,
    '--morph-width': `${width}px`,
    '--morph-height': `${Math.min(panel.scrollHeight, Math.max(80, window.innerHeight - top - 16))}px`
  };
}
async function open(key, source = 'keyboard') {
  if (!desktopQuery?.matches) return;
  cancelClose();
  if (current.value === key && visible.value) {
    if (source !== 'hover') { openedByHover = false; pinned = true; }
    return;
  }
  emit('open');
  const run = ++updateRun;
  const first = !visible.value;
  openedByHover = source === 'hover';
  pinned = source !== 'hover';
  instant.value = first;
  current.value = key;
  loadedGroups.value.add(key);
  await nextTick();
  if (run !== updateRun) return;
  place(key);
  if (first) {
    // Measure the selected panel before revealing the shared surface. Subsequent
    // switches animate its actual width, height and anchor without moving the page.
    void floating.value?.offsetWidth;
    visible.value = true;
    cancelAnimationFrame(openFrame);
    openFrame = requestAnimationFrame(() => { instant.value = false; });
  }
}
function close(restoreFocus = false) {
  const old = current.value;
  ++updateRun;
  cancelClose();
  cancelAnimationFrame(openFrame);
  visible.value = false;
  current.value = null;
  pinned = false;
  openedByHover = false;
  if (restoreFocus) triggers.get(old)?.focus({ preventScroll: true });
}
function leave(event) {
  if (event.pointerType !== 'mouse' || pinned) return;
  if (floating.value?.contains(document.activeElement)) return;
  cancelClose();
  closeTimer = window.setTimeout(() => close(), 180);
}
function toggle(key) {
  if (current.value === key && visible.value) {
    // A mouse click after hover pins the menu instead of immediately undoing
    // pointerenter. A second click still closes it; touch has no hover dependency.
    if (openedByHover) { openedByHover = false; pinned = true; }
    else close();
  } else open(key, 'click');
}
async function focusPanel(key, last = false) {
  await open(key);
  await nextTick();
  const run = updateRun;
  // Safari can reject focus while the surface is becoming visible. Wait for
  // its actual opening/switch animation, with a generation guard for Escape,
  // outside clicks, rapid switches and unmounts. Reduced motion has no wait.
  await new Promise(resolve => requestAnimationFrame(resolve));
  await Promise.allSettled((floating.value?.getAnimations() || []).map(animation => animation.finished));
  if (run !== updateRun || current.value !== key || !visible.value) return;
  const links = panels.get(key)?.querySelectorAll('a[href]');
  (last ? links?.[links.length - 1] : links?.[0])?.focus({ preventScroll: true });
}
function triggerKey(event, key) {
  if (event.key === 'Tab' && !event.shiftKey && visible.value && current.value === key && pinned) {
    event.preventDefault();
    focusPanel(key);
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    focusPanel(key, event.key === 'ArrowUp');
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = order[(order.indexOf(key) + step + order.length) % order.length];
    triggers.get(next)?.focus({ preventScroll: true });
    if (visible.value) open(next);
  }
}
function panelTab(event) {
  const links = panels.get(current.value)?.querySelectorAll('a[href]');
  if (event.shiftKey && document.activeElement === links?.[0]) {
    event.preventDefault();
    close(true);
  } else if (!event.shiftKey && document.activeElement === links?.[links.length - 1]) {
    event.preventDefault();
    const next = triggers.get(order[order.indexOf(current.value) + 1]) || document.querySelector('.site-search-trigger');
    close();
    next?.focus({ preventScroll: true });
  }
}
function focusOut(event) {
  if (navigation.value?.contains(event.relatedTarget) || floating.value?.contains(event.relatedTarget)) return;
  close();
}
function outside(event) {
  if (!navigation.value?.contains(event.target) && !floating.value?.contains(event.target)) close();
}
function escape(event) {
  if (event.key === 'Escape' && visible.value) {
    event.preventDefault();
    close(true);
  }
}
function resize() {
  if (!desktopQuery?.matches) close();
  else if (current.value) place(current.value);
}
function select(event, item) {
  // Native modified clicks and external/RSS destinations keep their behavior.
  close();
  emit('navigate', event, item);
}
function highlight(item) {
  previewKey.value = item.key;
  if (item.spa) warmRoutePath(item.path);
}
watch(() => props.routeName, () => close());
watch(() => props.copy, async () => { await nextTick(); resize(); });
onMounted(() => {
  desktopQuery = window.matchMedia('(min-width: 861px)');
  desktopQuery.addEventListener('change', resize);
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('pointerdown', outside);
  document.addEventListener('keydown', escape);
});
onUnmounted(() => {
  close();
  desktopQuery?.removeEventListener('change', resize);
  window.removeEventListener('resize', resize);
  document.removeEventListener('pointerdown', outside);
  document.removeEventListener('keydown', escape);
});
defineExpose({ close });
</script>

<template>
  <nav ref="navigation" class="desktop-navigation" data-material="header" :aria-label="label" @pointerenter="cancelClose" @pointerleave="leave" @focusout="focusOut">
    <a v-if="home" :href="home.path" :aria-label="home.label" :aria-current="home.active ? 'page' : undefined" @pointerenter="warmRoutePath(home.path)" @focus="warmRoutePath(home.path)" @click="select($event, home)">{{ homeLabel }}</a>
    <button v-for="group in groups" :id="`site-nav-${group.key}`" :key="group.key" :ref="node => node ? triggers.set(group.key, node) : triggers.delete(group.key)" type="button" :class="{ active: group.items.some(item => item.active) }" :aria-expanded="visible && current === group.key" :aria-controls="`site-panel-${group.key}`" @pointerenter="$event.pointerType === 'mouse' && open(group.key, 'hover')" @click="toggle(group.key)" @keydown="triggerKey($event, group.key)">{{ group.label }}<TsIcon name="chevronDown" :size="14" /></button>
    <Teleport to="body">
      <div ref="floating" id="site-morph-navigation" class="site-morph-menu" :class="{ 'is-open': visible, 'is-instant': instant }" :style="geometry" :aria-hidden="!visible" :inert="!visible" @pointerenter="cancelClose" @pointerleave="leave" @focusout="focusOut" @keydown.tab="panelTab">
        <section v-for="group in groups" :id="`site-panel-${group.key}`" :key="group.key" :ref="node => node ? panels.set(group.key, node) : panels.delete(group.key)" class="site-morph-panel" :class="[`is-${group.key}`, { 'is-active': current === group.key }]" :style="{ '--panel-shift': order.indexOf(group.key) < order.indexOf(current) ? '-32px' : '32px' }" :aria-labelledby="`site-nav-${group.key}`" :aria-hidden="current !== group.key" :inert="current !== group.key">
          <template v-if="group.key === 'discover'">
            <div class="site-discover-list">
              <a v-for="item in group.items" :key="item.key" :href="item.path" class="site-discover-link" :class="{ 'is-preview': preview.key === item.key }" :aria-current="item.active ? 'page' : undefined" @pointerenter="highlight(item)" @focus="highlight(item)" @click="select($event, item)"><strong>{{ item.label }}</strong><span>{{ copy.descriptions[item.key] }}</span></a>
            </div>
            <div class="site-discover-visual" aria-hidden="true">
              <div v-for="item in group.items" :key="item.key" class="site-route-preview" :class="{ 'is-active': preview.key === item.key }">
                <img v-if="loadedGroups.has('discover')" :src="artwork[item.key]" alt="" width="398" height="348" decoding="async">
                <div class="site-route-preview-copy"><small>{{ item.key.toUpperCase() }}</small><strong>{{ item.label }}</strong><p>{{ copy.descriptions[item.key] }}</p></div>
              </div>
            </div>
          </template>
          <template v-else-if="group.key === 'create'">
            <a v-for="item in group.items" :key="item.key" :href="item.path" class="site-create-link" :aria-current="item.active ? 'page' : undefined" @pointerenter="warmRoutePath(item.path)" @focus="warmRoutePath(item.path)" @click="select($event, item)"><img v-if="loadedGroups.has('create')" :src="artwork[item.key]" alt="" width="220" height="176" decoding="async"><div><TsIcon :name="item.icon" :size="20" /><strong>{{ item.label }}</strong><span>{{ copy.descriptions[item.key] }}</span></div><TsIcon name="arrowRight" :size="16" /></a>
          </template>
          <template v-else>
            <a v-for="item in group.items" :key="item.key" :href="item.path" class="site-space-link" :aria-current="item.active ? 'page' : undefined" @pointerenter="item.spa && warmRoutePath(item.path)" @focus="item.spa && warmRoutePath(item.path)" @click="select($event, item)"><span class="site-space-icon"><TsIcon :name="item.icon" :size="19" /></span><span><strong>{{ item.label }}</strong><small>{{ copy.descriptions[item.key] }}</small></span><TsIcon name="arrowRight" :size="14" /></a>
          </template>
        </section>
      </div>
    </Teleport>
  </nav>
</template>
