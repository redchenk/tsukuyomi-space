import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  activePersonaId,
  activePersonaPrompt,
  clearDiaryArchive,
  deleteDiaryEntry,
  DIARY_ARCHIVE_UPDATED_EVENT,
  downloadDiaryArchive,
  importDiaryArchive,
  listPersonaPrompts,
  readDiaryArchive,
  selectPersonaPrompt,
  updatePersonaPrompt
} from '../../services/room/roomDiaryArchive';
import { syncDiaryArchive, DIARY_SYNC_UPDATED_EVENT } from '../../services/room/roomDiarySync';

/**
 * View-model for the room diary panel: exposes the archive entries, the active
 * persona label and the import/export actions the panel buttons call.
 */
export function useRoomDiary() {
  const archive = ref(readDiaryArchive());
  const selectedId = ref('');
  const notice = ref('');
  const syncStatus = ref('');

  async function sync(options = {}) {
    try {
      const result = await syncDiaryArchive(options);
      refresh();
      return result;
    } catch (error) {
      syncStatus.value = `同步失败：${error.message}。本机存档仍保留，可稍后重试。`;
      return null;
    }
  }

  const entries = computed(() => archive.value?.data?.diary || []);
  const personaName = computed(() => activePersonaPrompt(archive.value).data.name || '角色');
  // A backup can hold many personas (affection tiers, special forms); the user
  // picks which one writes the diary, without changing live chat.
  const personas = computed(() => listPersonaPrompts(archive.value));
  const activePersona = computed(() => activePersonaId(archive.value));
  const activePersonaLabel = computed(() => (
    personas.value.find((item) => item.id === activePersona.value)?.label || personaName.value
  ));
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

  /** Switches the diary author only. */
  function selectPersona(id) {
    try {
      archive.value = selectPersonaPrompt(id);
      notice.value = `已切换日记人设：${activePersonaLabel.value}，聊天角色保持不变`;
      void sync();
      return archive.value;
    } catch (error) {
      notice.value = `切换人设失败：${error.message}`;
      return null;
    }
  }

  /** Deletes one diary entry. Returns true when it was removed. */
  function deleteEntry(entry) {
    const id = String(entry?.diaryId || '').trim();
    if (!id) {
      notice.value = '删除失败：缺少日记标识';
      return false;
    }
    try {
      archive.value = deleteDiaryEntry(id);
      // Keep the selection valid after the list shrinks.
      if (!entries.value.some((item) => item.diaryId === selectedId.value)) {
        selectedId.value = entries.value[entries.value.length - 1]?.diaryId || '';
      }
      notice.value = entries.value.length
        ? `已删除 1 篇日记，还剩 ${entries.value.length} 篇`
        : '已删除最后一篇日记';
      void sync();
      return true;
    } catch (error) {
      notice.value = `删除失败：${error.message}`;
      return false;
    }
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
      const count = personas.value.length;
      notice.value = count > 1
        ? `已导入 ${entries.value.length} 篇日记、${count} 个人设，当前使用：${activePersonaLabel.value}`
        : `已导入 ${entries.value.length} 篇日记，角色：${personaName.value}`;
      void sync();
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
    void sync();
    return archive.value;
  }

  function reset() {
    archive.value = clearDiaryArchive();
    selectedId.value = '';
    notice.value = '存档已清空';
    void sync();
    return archive.value;
  }

  /**
   * Another view (Room settings) wrote the archive: re-read it so the persona
   * name and entry list stay in sync without a page reload.
   */
  function onArchiveUpdated() {
    refresh();
  }

  function onSyncUpdated(event) {
    syncStatus.value = String(event?.detail?.message || '');
    if (event?.detail?.status === 'synced') refresh();
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') void sync();
  }

  onMounted(() => {
    window.addEventListener(DIARY_ARCHIVE_UPDATED_EVENT, onArchiveUpdated);
    window.addEventListener(DIARY_SYNC_UPDATED_EVENT, onSyncUpdated);
    window.addEventListener('focus', onVisibilityChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    void sync();
  });
  onBeforeUnmount(() => {
    window.removeEventListener(DIARY_ARCHIVE_UPDATED_EVENT, onArchiveUpdated);
    window.removeEventListener(DIARY_SYNC_UPDATED_EVENT, onSyncUpdated);
    window.removeEventListener('focus', onVisibilityChange);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });

  refresh();

  return {
    archive,
    entries,
    personaName,
    personas,
    activePersona,
    activePersonaLabel,
    affection,
    slotId,
    selectedId,
    selectedEntry,
    notice,
    syncStatus,
    sync,
    refresh,
    focusLatest,
    selectEntry,
    selectPersona,
    deleteEntry,
    exportArchive,
    importText,
    importFile,
    savePersona,
    reset
  };
}
