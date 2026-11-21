<script setup>
import { dismissMenu } from '../runtime/menuMotion';
import { onBeforeUnmount, watch } from 'vue';
import { useModalDialog } from '../composables/useModalDialog';
import TsIcon from './TsIcon.vue';

const props = defineProps({ open: Boolean, title: { type: String, required: true }, closeLabel: { type: String, default: '关闭 / Close' }, returnFocus: Object });
const emit = defineEmits(['close']);
const dialog = useModalDialog(() => props.open, { returnFocus: () => props.returnFocus });
let closing = false, drag = null;
const mobile = () => matchMedia('(max-width: 1080px)').matches;
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function reset() {
  drag = null; closing = false;
  if (dialog.value) dialog.value.style.transform = '';
}
function close() {
  if (closing || !props.open) return;
  closing = true;
  dismissMenu(dialog.value, () => { if (closing) emit('close'); });
}
function backdrop(event) {
  if (event.target !== dialog.value) return;
  const r = dialog.value.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
}
function start(event) {
  if (!mobile() || closing || !event.isPrimary || event.button !== 0) return;
  drag = { y: event.clientY, time: performance.now(), distance: 0 };
  event.currentTarget.setPointerCapture(event.pointerId);
}
function move(event) {
  if (!drag) return;
  const delta = event.clientY - drag.y;
  const offset = dialog.value.dataset.menuOrigin === 'header' ? delta : Math.max(0, delta);
  drag.distance = Math.abs(offset);
  dialog.value.style.transform = `translateY(${offset}px)`;
}
function end(event) {
  if (!drag) return;
  const { distance, time } = drag;
  drag = null;
  if (event.type !== 'pointercancel' && (distance > 100 || distance > 24 && distance / Math.max(1, performance.now() - time) > .6)) close();
  else {
    if (!reduce()) dialog.value.animate([{ transform: dialog.value.style.transform }, { transform: 'none' }], { duration: 180, easing: 'ease-out' });
    dialog.value.style.transform = '';
  }
}
watch(() => props.open, reset);
onBeforeUnmount(reset);
</script>

<template>
  <dialog ref="dialog" class="ts-sheet" data-menu-surface :aria-label="title" @cancel.prevent="close" @click="backdrop">
    <div class="sheet-handle" aria-hidden="true" @pointerdown="start" @pointermove="move" @pointerup="end" @pointercancel="end"><span></span></div>
    <header class="ts-sheet-head"><h2>{{ title }}</h2><button class="icon-button" type="button" data-modal-close :aria-label="closeLabel" @click="close"><TsIcon name="x" :size="22" /></button></header>
    <div class="ts-sheet-body"><slot /></div>
  </dialog>
</template>
