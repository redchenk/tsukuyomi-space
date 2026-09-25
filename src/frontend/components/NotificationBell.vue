<script setup>
import TsIcon from './TsIcon.vue';

defineProps({
  size: { type: Number, default: 20 },
  unread: { type: Boolean, default: false }
});
</script>

<template>
  <span class="notification-bell" aria-hidden="true">
    <TsIcon name="bell" :size="size" />
    <i v-if="unread" class="notification-unread-dot"></i>
  </span>
</template>

<style scoped>
.notification-bell {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: visible;
  line-height: 0;
}
.notification-unread-dot {
  position: absolute;
  top: -1px;
  right: -1px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #cf8295;
  pointer-events: none;
}
</style>
