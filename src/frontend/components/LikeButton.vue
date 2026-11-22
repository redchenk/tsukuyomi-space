<script setup>
import { nextTick, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import TsIcon from './TsIcon.vue';
import { playLikeBurst } from '../runtime/likeBurst';

const props = defineProps({
  pressed: Boolean,
  disabled: Boolean,
  iconSize: { type: Number, default: 16 },
  toggle: { type: Function, required: true }
});

const button = ref(null);
const pending = ref(false);
let stopBurst;
function stop() { stopBurst?.(); stopBurst = undefined; }
watch(() => props.pressed, pressed => { if (!pressed) stop(); });
onDeactivated(stop);
onBeforeUnmount(stop);

async function activate() {
  if (pending.value || props.disabled) return;
  stop();
  pending.value = true;
  try {
    // Only the initiating control celebrates a newly committed like.
    const added = await props.toggle();
    await nextTick();
    if (added && props.pressed && button.value?.isConnected) {
      stopBurst = playLikeBurst(button.value.querySelector('svg'), () => { stopBurst = undefined; });
    }
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <button ref="button" data-ui="quiet" class="like-control" type="button" :aria-pressed="pressed"
    :aria-busy="pending || disabled || undefined" :disabled="pending || disabled" @click="activate">
    <TsIcon name="heart" :size="iconSize" /><slot />
  </button>
</template>

<style scoped>
.like-control { --control-motion-enabled: 0; }
.like-control[aria-pressed="true"] > svg { fill: currentColor; color: var(--danger); }
</style>
