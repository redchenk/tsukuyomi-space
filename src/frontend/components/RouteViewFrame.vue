<script setup>
defineProps({
  component: { type: [Object, Function], required: true },
  routeKey: { type: String, required: true },
  routeName: { type: String, required: true },
  pageProps: { type: Object, required: true }
});
const emit = defineEmits(['auth-changed', 'go', 'back', 'return-to', 'logout', 'toggle-theme']);
</script>

<template>
  <div class="route-view-frame" :data-route-key="routeKey" :data-route-name="routeName">
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
