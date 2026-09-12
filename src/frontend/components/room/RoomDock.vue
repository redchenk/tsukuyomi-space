<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import TsIcon from '../TsIcon.vue';

defineProps({
  buttons: { type: Array, required: true },
  activePanels: { type: Object, required: true }
});

const emit = defineEmits(['toggle', 'settings']);
const dockRef = ref(null);
const mobileOpen = ref(false);

function closeDrawer() {
  mobileOpen.value = false;
}

function toggleDrawer() {
  mobileOpen.value = !mobileOpen.value;
}

function selectPanel(panelId) {
  emit('toggle', panelId);
  closeDrawer();
}

function openSettings() {
  emit('settings');
  closeDrawer();
}

function onDocumentPointerDown(event) {
  if (mobileOpen.value && !dockRef.value?.contains(event.target)) closeDrawer();
}

function onDocumentKeydown(event) {
  if (event.key === 'Escape') closeDrawer();
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('keydown', onDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  document.removeEventListener('keydown', onDocumentKeydown);
});
</script>

<template>
  <div
    ref="dockRef"
    class="panel-controls room-dock"
    :class="{ 'is-mobile-open': mobileOpen }"
    data-material="header"
    aria-label="Room tools"
  >
    <button
      class="room-dock-trigger"
      type="button"
      aria-label="房间工具"
      aria-controls="roomDockMenu"
      :aria-expanded="mobileOpen ? 'true' : 'false'"
      @click="toggleDrawer"
    >
      <TsIcon name="menu" :size="20" />
    </button>

    <div id="roomDockMenu" class="room-dock-menu">
      <button
        v-for="button in buttons"
        :key="button.id"
        class="panel-toggle-btn"
        :class="{ 'is-active': activePanels[button.id] }"
        type="button"
        :aria-pressed="activePanels[button.id] ? 'true' : 'false'"
        @click="selectPanel(button.id)"
      >
        <span class="dock-icon" aria-hidden="true">
          <TsIcon :name="button.icon || 'home'" :size="18" />
        </span>
        <span class="dock-label">{{ button.label }}</span>
      </button>

      <button class="panel-toggle-btn" type="button" aria-label="设置" @click="openSettings">
        <span class="dock-icon" aria-hidden="true">
          <TsIcon name="ellipsis" :size="22" />
        </span>
        <span class="dock-label">设置</span>
      </button>
    </div>
  </div>
</template>
