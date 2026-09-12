<script setup>
import { computed, ref } from 'vue';
import TsIcon from '../TsIcon.vue';
import RoomDraggablePanel from './RoomDraggablePanel.vue';

const props = defineProps({
  diary: { type: Object, required: true },
  panelStyle: { type: Object, required: true }
});

const emit = defineEmits(['close', 'focus', 'drag-start']);
const fileInputRef = ref(null);

const entries = computed(() => props.diary.entries?.value || []);
const selectedId = computed(() => props.diary.selectedId?.value || '');
const selected = computed(() => props.diary.selectedEntry?.value || null);
const personaName = computed(() => props.diary.personaName?.value || '角色');
const notice = computed(() => props.diary.notice?.value || '');
const reversed = computed(() => entries.value.slice().reverse());

function selectEntry(entry) {
  props.diary.selectEntry?.(entry);
}

function onImportFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (file) props.diary.importFile?.(file);
}
</script>

<template>
  <RoomDraggablePanel
    panel-id="diaryPanel"
    panel-class="room-diary-panel"
    :panel-style="panelStyle"
    title="&#26085;&#35760;"
    @close="emit('close')"
    @focus="emit('focus')"
    @drag-start="emit('drag-start', $event)"
  >
    <div class="panel-content diary-body">
      <div class="diary-toolbar">
        <span class="diary-count">{{ entries.length }} &#31687; · {{ personaName }}</span>
        <button class="panel-btn diary-tool-btn" type="button" @click="diary.exportArchive?.()">
          <TsIcon name="download" :size="15" aria-hidden="true" />
          <span>&#23548;&#20986;</span>
        </button>
        <button class="panel-btn diary-tool-btn" type="button" @click="fileInputRef?.click()">
          <TsIcon name="upload" :size="15" aria-hidden="true" />
          <span>&#23548;&#20837;</span>
        </button>
        <input ref="fileInputRef" type="file" accept="application/json,.json" hidden @change="onImportFile">
      </div>

      <div v-if="notice" class="diary-notice" role="status">{{ notice }}</div>

      <div v-if="!entries.length" class="diary-empty">
        &#36824;&#27809;&#26377;&#26085;&#35760;&#12290;&#32842;&#22825;&#21518;&#28857;&#19968;&#19979;&#12300;&#32467;&#26463;&#32842;&#22825;&#24182;&#20889;&#26085;&#35760;&#12301;&#23601;&#20250;&#20889;&#20837;&#36825;&#37324;&#12290;
      </div>

      <template v-else>
        <div class="diary-list">
          <button
            v-for="entry in reversed"
            :key="entry.diaryId"
            class="diary-list-item"
            :class="{ 'is-active': entry.diaryId === selectedId }"
            type="button"
            @click="selectEntry(entry)"
          >
            <span class="diary-list-date">{{ entry.date }}</span>
            <span class="diary-list-time">{{ entry.time }}</span>
            <span class="diary-list-preview">{{ String(entry.content || '').replace(/^【日记】\s*/, '').slice(0, 40) }}</span>
          </button>
        </div>
        <div v-if="selected" class="diary-detail">
          <div class="diary-detail-head">
            <strong>{{ selected.date }} {{ selected.time }}</strong>
            <span class="field-hint">&#22909;&#24863;&#24230; {{ selected.affection }} · {{ selected.mode || 'LLM' }}</span>
          </div>
          <pre class="diary-detail-content">{{ selected.content }}</pre>
        </div>
      </template>
    </div>
  </RoomDraggablePanel>
</template>
