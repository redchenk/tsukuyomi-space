<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useModalDialog } from '../../composables/useModalDialog';
import TsIcon from '../TsIcon.vue';
import RoomRelationshipCard from './RoomRelationshipCard.vue';
const props = defineProps({ open: Boolean, relationship: { type: Object, required: true }, lang: { type: String, default: 'zh' } });
const emit = defineEmits(['open', 'close']);
const modal = useModalDialog(() => props.open);
const title = computed(() => props.lang === 'en' ? 'Affinity' : '好感度');
const closeLabel = computed(() => props.lang === 'en' ? 'Close affinity' : props.lang === 'ja' ? '好感度を閉じる' : '关闭好感度');
const notice = ref(null);
let timer;
watch(() => props.relationship.feedback.value, change => {
  clearTimeout(timer);
  notice.value = change;
  if (change) timer = setTimeout(() => { notice.value = null; }, 3500);
});
const noticeText = computed(() => {
  if (!notice.value) return '';
  const delta = notice.value.delta;
  const value = delta > 0 ? `+${delta}` : delta < 0 ? String(delta) : props.lang === 'en' ? 'unchanged' : props.lang === 'ja' ? '増加なし' : '未增加';
  return `${title.value} ${value}`;
});
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <Teleport to="body">
    <dialog v-if="open" ref="modal" class="room-relationship-drawer" aria-labelledby="relationship-drawer-title" @cancel.prevent="emit('close')" @click.self="emit('close')">
      <header><h2 id="relationship-drawer-title"><TsIcon name="heart" :size="19" />{{ title }}</h2><button class="relationship-drawer-close" type="button" :aria-label="closeLabel" data-modal-close @click="emit('close')"><TsIcon name="x" :size="20" /></button></header>
      <RoomRelationshipCard :relationship="relationship" :lang="lang" expanded />
    </dialog>
    <button v-if="notice && !open" class="room-relationship-notice" type="button" @click="emit('open')"><TsIcon name="heart" :size="15" /><span role="status" aria-live="polite" aria-atomic="true">{{ noticeText }}</span><TsIcon name="chevronRight" :size="14" /></button>
  </Teleport>
</template>

<style scoped>
.room-relationship-drawer { position: fixed; inset: 0 0 0 auto; box-sizing: border-box; width: min(400px, 92vw); height: 100dvh; max-height: 100dvh; margin: 0; padding: 20px; overflow: auto; border: 1px solid var(--ts-border); border-radius: 24px 0 0 24px; background: var(--ts-card); color: var(--ts-text); box-shadow: 0 12px 60px #0002; animation: affinity-enter 180ms ease-out; }
.room-relationship-drawer::backdrop { background: #211c2960; backdrop-filter: blur(3px); }
header { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; background: var(--ts-card); }
h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 18px; }
.relationship-drawer-close { display: grid; place-items: center; width: 40px; height: 40px; border: 1px solid var(--ts-border); border-radius: var(--ts-radius-button); background: transparent; color: inherit; cursor: pointer; }
.room-relationship-drawer :deep(.room-relationship) { margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent; font-size: 13px; }
.room-relationship-drawer :deep(.relationship-info) { max-height: none; overflow: visible; padding: 12px 0; }
.room-relationship-drawer :deep(.relationship-info p) { margin: 8px 0; line-height: 1.8; }
.room-relationship-notice { position: fixed; z-index: 1100; right: 24px; bottom: 24px; display: flex; align-items: center; gap: 7px; width: max-content; max-width: calc(100vw - 32px); padding: 8px 12px; border: 1px solid var(--ts-border); border-radius: var(--ts-radius-button); background: var(--ts-card); color: var(--ts-text); box-shadow: 0 4px 20px #0002; font: inherit; font-size: 12px; cursor: pointer; }
@keyframes affinity-enter { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
@media (max-width: 860px) {
  .room-relationship-drawer { inset: auto 0 0; width: 100%; max-width: 100%; height: auto; max-height: 75dvh; padding: 18px 20px calc(20px + env(safe-area-inset-bottom)); border-radius: 24px 24px 0 0; animation-name: affinity-enter-mobile; }
  .room-relationship-notice { right: 16px; bottom: calc(106px + env(safe-area-inset-bottom)); }
  @keyframes affinity-enter-mobile { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
}
@media (prefers-reduced-motion: reduce) { .room-relationship-drawer { animation: none; } }
</style>
