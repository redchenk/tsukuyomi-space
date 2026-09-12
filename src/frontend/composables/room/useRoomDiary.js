import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  activePersonaPrompt,
  clearDiaryArchive,
  DIARY_ARCHIVE_UPDATED_EVENT,
  downloadDiaryArchive,
  importDiaryArchive,
  readDiaryArchive,
  updatePersonaPrompt
} from '../../services/room/roomDiaryArchive';

/**
 * View-model for the room diary panel: exposes the archive entries, the active
 * persona label and the import/export actions the panel buttons call.
 */
export function useRoomDiary() {
  const archive = ref(readDiaryArchive());
  const selectedId = ref('');
  const notice = ref('');

  const entries = computed(() => archive.value?.data?.diary || []);
  const personaName = computed(() => activePersonaPrompt(archive.value).data.name || '角色');
  const affection = computed(() => Number(archive.value?.data?.gameData?.characterStats?.affection) || 0);
  const slotId = computed(() => Number(archive.value?.slotId) || 1);
  const selectedEntry = computed(() => (
    entries.value.find((entry) => entry.diaryId === selectedId.value) || entries.value[entries.value.length - 1] || null
  ));

  function refresh() {
    archive.value = readDiaryArchive();
    if (!entries.value.some((entry) => entry.diaryId === selectedId.value)) {
      selectedId.value = entries.value[entries.value.length - 1]?.diaryId || '';
    }
    return archive.value;
  }

  function selectEntry(entry) {
    selectedId.value = String(entry?.diaryId || '');
  }

  function focusLatest() {
    refresh();
    selectedId.value = entries.value[entries.value.length - 1]?.diaryId || '';
  }

  function exportArchive() {
    try {
      const name = downloadDiaryArchive(archive.value);
      notice.value = `已导出：${name}`;
      return name;
    } catch (error) {
      notice.value = `导出失败：${error.message}`;
      return '';
    }
  }

  function importText(text) {
    try {
      archive.value = importDiaryArchive(text);
      selectedId.value = entries.value[entries.value.length - 1]?.diaryId || '';
      notice.value = `已导入 ${entries.value.length} 篇日记，角色：${personaName.value}`;
      return archive.value;
    } catch (error) {
      notice.value = `导入失败：${error.message}`;
      return null;
    }
  }

  async function importFile(file) {
    if (!file) return null;
    try {
      return importText(await file.text());
    } catch (error) {
      notice.value = `读取文件失败：${error.message}`;
      return null;
    }
  }

  function savePersona(patch) {
    archive.value = updatePersonaPrompt(patch);
    notice.value = '角色设定已保存';
    return archive.value;
  }

  function reset() {
    archive.value = clearDiaryArchive();
    selectedId.value = '';
    notice.value = '存档已清空';
    return archive.value;
  }

  /**
   * Another view (Room settings) wrote the archive: re-read it so the persona
   * name and entry list stay in sync without a page reload.
   */
  function onArchiveUpdated() {
    refresh();
  }

  onMounted(() => window.addEventListener(DIARY_ARCHIVE_UPDATED_EVENT, onArchiveUpdated));
  onBeforeUnmount(() => window.removeEventListener(DIARY_ARCHIVE_UPDATED_EVENT, onArchiveUpdated));

  refresh();

  return {
    archive,
    entries,
    personaName,
    affection,
    slotId,
    selectedId,
    selectedEntry,
    notice,
    refresh,
    focusLatest,
    selectEntry,
    exportArchive,
    importText,
    importFile,
    savePersona,
    reset
  };
}
