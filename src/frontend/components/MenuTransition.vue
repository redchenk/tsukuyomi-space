<script setup>
import { revealMenu, dismissMenu, forgetMenu } from '../runtime/menuMotion';

const props = defineProps({ enabled: { type: Boolean, default: true } });

function surface(el) { return el.querySelector(':scope > [data-menu-body]') || el; }
function enter(el, done) {
  el.inert = false;
  if (!props.enabled) { done(); return; }
  revealMenu(surface(el), el.previousElementSibling?.closest('button,[aria-expanded]'), done);
}
function leave(el, done) {
  if (!props.enabled) { done(); return; }
  el.inert = true;
  dismissMenu(surface(el), done);
}
function cancelLeave(el) { el.inert = false; forgetMenu(surface(el)); }
</script>

<template>
  <Transition :css="false" @enter="enter" @leave="leave" @leave-cancelled="cancelLeave">
    <slot />
  </Transition>
</template>
