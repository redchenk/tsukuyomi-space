<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import TsIcon from './TsIcon.vue';

const props = defineProps({ interaction: { type: Object, required: true }, expanded: Boolean });
const emit = defineEmits(['expand', 'close', 'go']);
const copy = computed(() => props.interaction.copy);
const chat = computed(() => props.interaction.state);
const chatting = computed(() => ['pending', 'streaming'].includes(chat.value.status));
const latest = computed(() => chat.value.messages.at(-1));
const draft = ref('');
const bubble = ref(null);
const input = ref(null);
const log = ref(null);
const status = computed(() => !chat.value.configured ? copy.value.modelNeeded : chatting.value ? copy.value.responding : copy.value.liveChat);
const preview = computed(() => chat.value.error ? copy.value.errors[chat.value.error]
  : latest.value?.text || (chatting.value ? copy.value.responding : chat.value.configured ? copy.value.chatWelcome : copy.value.connectHint));
function send(question = draft.value) {
  if (!chat.value.configured || chatting.value || props.interaction.busy || !question.trim()) return;
  props.interaction.send(question);
  draft.value = '';
}
function keydown(event) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); }
}
async function focusInput() {
  await nextTick();
  (chat.value.configured ? input.value : bubble.value)?.focus({ preventScroll: true });
}
watch(() => chat.value.connectionRevision, () => { draft.value = ''; });
watch(() => props.expanded, expanded => { if (expanded) focusInput(); });
watch(() => [chat.value.messages.length, latest.value?.text], async () => {
  const element = log.value;
  const nearBottom = !element || element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  await nextTick();
  if (element && nearBottom) element.scrollTop = element.scrollHeight;
});
onMounted(() => { if (props.expanded) focusInput(); });
</script>

<template>
  <section id="site-pet-game-bubble" ref="bubble" tabindex="-1" class="site-pet-game-bubble" :class="{ 'is-expanded': expanded }"
    :role="expanded ? 'dialog' : 'region'" :aria-label="copy.conversation" :aria-modal="expanded ? 'false' : undefined"
    @keydown.esc.stop.prevent="emit('close')">
    <header><div><strong>{{ copy.yachiyo }}</strong><span>{{ status }}</span></div><button class="bubble-close" type="button" :aria-label="copy.closeChat" @click="emit('close')"><TsIcon name="x" :size="16" /></button></header>
    <template v-if="!expanded">
      <p class="site-pet-speech" aria-live="polite" :aria-busy="chatting">{{ preview }}</p>
      <button class="bubble-expand" type="button" @click="emit('expand')">{{ copy.chatLabel }} <TsIcon name="message" :size="14" /></button>
    </template>
    <div v-else class="site-pet-chat-body">
      <div ref="log" class="gomoku-chat-log" role="log" :aria-label="copy.conversation" aria-live="polite" :aria-busy="chatting">
        <p v-if="!chat.messages.length" class="gomoku-chat-empty">{{ chat.configured ? copy.chatWelcome : copy.connectHint }}</p>
        <article v-for="message in chat.messages" :key="message.id" class="gomoku-chat-turn">
          <p v-if="message.question" class="gomoku-chat-user"><small>{{ copy.you }}</small>{{ message.question }}</p>
          <p class="gomoku-chat-assistant" :data-state="message.state"><small>{{ copy.yachiyo }}</small><span>{{ message.text || (['pending', 'streaming'].includes(message.state) ? copy.responding : copy.noReply) }}</span><em v-if="['stopped', 'error'].includes(message.state)">{{ copy.incomplete }}</em></p>
        </article>
      </div>
      <p v-if="chat.error" class="gomoku-chat-error" role="alert">{{ copy.errors[chat.error] }}</p>
      <div class="gomoku-chat-actions"><button v-if="chatting" type="button" @click="interaction.stop()">{{ copy.stop }}</button><button v-else-if="chat.canRetry" type="button" :disabled="interaction.busy" @click="interaction.retry()">{{ copy.retry }}</button></div>
      <div class="gomoku-banter"><button v-for="event in ['tease', 'ponder', 'cheer']" :key="event" type="button" :disabled="!chat.configured || chatting || interaction.busy" @click="send(copy[event])">{{ copy[event] }}</button></div>
      <form class="gomoku-chat-form" @submit.prevent="send()">
        <label for="pet-game-chat-input">{{ copy.chatLabel }}</label>
        <textarea id="pet-game-chat-input" ref="input" v-model="draft" :placeholder="copy.chatPlaceholder" maxlength="500" rows="2" :disabled="!chat.configured" @keydown="keydown"></textarea>
        <div><small>{{ draft.length }}/500</small><button type="submit" :disabled="!chat.configured || chatting || interaction.busy || !draft.trim()">{{ copy.send }}</button></div>
      </form>
      <div class="gomoku-chat-options"><label><input type="checkbox" :checked="interaction.autoTalk" :disabled="!chat.configured" @change="interaction.setAutoTalk($event.target.checked)">{{ copy.autoTalk }}</label><a href="/room/settings" @click.prevent="emit('go', '/room/settings')">{{ copy.modelSettings }}</a></div>
      <small class="gomoku-model" v-if="chat.configured">{{ copy.selectedModel }} {{ chat.model }} · {{ copy.modelUsage }}</small>
    </div>
  </section>
</template>

<style scoped>
.site-pet-game-bubble { position: absolute; right: 12px; bottom: calc(100% + 10px); display: flex; flex-direction: column; width: min(310px, calc(100vw - 32px)); max-height: min(570px, calc(100dvh - var(--site-companion-width, 152px) * 208 / 192 - var(--site-companion-bottom, 12px) - 36px)); border: 1px solid var(--ts-editorial-line); border-radius: 22px 22px 6px 22px; background: var(--ts-editorial-surface); color: var(--ts-editorial-ink); box-shadow: 0 10px 40px #0002; pointer-events: auto; font-family: var(--ts-font-sans); }
.site-pet-game-bubble::after { content: ''; position: absolute; right: 24px; top: calc(100% - 1px); width: 14px; height: 14px; background: var(--ts-editorial-surface); border-right: 1px solid var(--ts-editorial-line); border-bottom: 1px solid var(--ts-editorial-line); transform: rotate(45deg) translateY(-6px); }
.site-pet-game-bubble.is-expanded { width: min(350px, calc(100vw - 32px)); }
header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 10px 6px 16px; flex-shrink: 0; }
header > div { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; }
header strong { font: 600 15px var(--ts-font-serif); }
header span { font-size: 10px; color: var(--ts-accent); }
button { cursor: pointer; color: inherit; font: inherit; }
.bubble-close { display: grid; place-items: center; flex-shrink: 0; width: 32px; height: 32px; min-height: 32px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--ts-text-muted); }
.bubble-close:hover { background: var(--ts-editorial-soft); }
.site-pet-speech { margin: 0; padding: 0 16px; font-size: 13px; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.bubble-expand { display: inline-flex; justify-content: end; align-items: center; gap: 6px; margin: 6px 10px 8px; padding: 5px; min-height: 30px; border: 0; background: transparent; color: var(--ts-accent); font-size: 11px; }
.site-pet-chat-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 16px 16px; scrollbar-width: thin; }
.gomoku-chat-log { max-height: 220px; min-height: 60px; overflow-y: auto; overscroll-behavior: contain; padding: 0; scrollbar-width: thin; overflow-wrap: anywhere; }
.gomoku-chat-empty { color: var(--ts-text-secondary); font-size: 13px; line-height: 1.85; margin: 8px 0 16px; }
.gomoku-chat-turn p { white-space: pre-wrap; font-size: 13px; line-height: 1.85; margin: 8px 0 14px; }
.gomoku-chat-turn small { display: block; color: var(--ts-text-muted); font-size: 10px; margin-bottom: 3px; }
.gomoku-chat-user { border-radius: 12px; padding: 8px 12px; background: var(--ts-editorial-soft); }
.gomoku-chat-assistant em { display: block; color: var(--ts-text-muted); font: normal 10px/1.6 var(--ts-font-sans); margin-top: 4px; }
.gomoku-chat-error { margin: 8px 0; font-size: 12px; line-height: 1.8; color: var(--ts-accent); }
.gomoku-chat-actions { display: flex; justify-content: end; }
.gomoku-chat-actions button { background: transparent; border: 0; color: var(--ts-accent); font-size: 12px; padding: 6px; }
.gomoku-banter { display: flex; flex-wrap: wrap; gap: 6px; }
.gomoku-banter button { min-height: 32px; padding: 5px 10px; border: 1px solid var(--ts-editorial-line); border-radius: 18px; background: transparent; color: var(--ts-text-secondary); font-size: 11px; }
.gomoku-chat-form { padding: 12px 0 8px; }
.gomoku-chat-form label { display: block; font-size: 11px; color: var(--ts-text-secondary); margin-bottom: 8px; }
.gomoku-chat-form textarea { display: block; width: 100%; max-width: 100%; min-height: 64px; resize: vertical; border: 1px solid var(--ts-editorial-line); border-radius: 12px; padding: 8px 10px; background: var(--ts-editorial-bg); color: inherit; font: inherit; font-size: 13px; line-height: 1.6; }
.gomoku-chat-form > div { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 8px; }
.gomoku-chat-form small { color: var(--ts-text-muted); font-size: 10px; }
.gomoku-chat-form button { min-height: 36px; padding: 6px 20px; border-radius: 24px; border: 0; color: var(--ts-accent-contrast, #fff); background: var(--ts-accent); font-size: 12px; }
.gomoku-chat-options { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding: 8px 0 0; font-size: 11px; }
.gomoku-chat-options label { display: flex; gap: 6px; align-items: center; cursor: pointer; }
.gomoku-chat-options input { accent-color: var(--ts-accent); width: 14px; height: 14px; margin: 0; }
.gomoku-chat-options a { color: var(--ts-accent); text-underline-offset: 3px; }
.gomoku-model { display: block; padding-top: 10px; color: var(--ts-text-muted); font-size: 10px; line-height: 1.7; overflow-wrap: anywhere; }
:is(button, textarea):disabled { opacity: .5; cursor: default; }
:is(a, button, input, textarea):focus-visible { outline: 2px solid var(--ts-accent); outline-offset: 3px; }
@media (max-width: 700px) {
  .site-pet-game-bubble { right: 4px; width: min(285px, calc(100vw - 32px)); }
  .site-pet-game-bubble.is-expanded { width: min(350px, calc(100vw - 32px)); }
  .gomoku-chat-form textarea { font-size: 16px; }
}
</style>
