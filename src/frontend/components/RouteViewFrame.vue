<script setup>
import { nextTick, onActivated, onDeactivated, onMounted, onBeforeUnmount, ref } from 'vue';
import { installScrollReveal } from '../utils/scrollReveal';
const frame = ref(null);
let stopReveal;
let revision = 0;
async function startReveal() {
  const run = ++revision;
  await nextTick();
  if (run !== revision) return;
  stopReveal?.();
  stopReveal = installScrollReveal(frame.value);
}
function stop() { ++revision; stopReveal?.(); stopReveal = null; }
onMounted(startReveal);
onActivated(startReveal);
onDeactivated(stop);
onBeforeUnmount(stop);
defineProps({
  component: { type: [Object, Function], required: true },
  routeKey: { type: String, required: true },
  routeName: { type: String, required: true },
  pageProps: { type: Object, required: true }
});
const emit = defineEmits(['auth-changed', 'go', 'back', 'return-to', 'logout', 'toggle-theme']);
</script>

<template>
  <div ref="frame" class="route-view-frame" :data-route-key="routeKey" :data-route-name="routeName">
    <component
      :is="component"
      class="route-view"
      v-bind="pageProps"
      :route-name="routeName"
      @auth-changed="emit('auth-changed', $event)"
      @go="emit('go', $event)"
      @back="emit('back', $event)"
      @return-to="emit('return-to', $event)"
      @logout="emit('logout')"
      @toggle-theme="emit('toggle-theme', $event)"
    />
  </div>
</template>
