import { ref } from 'vue';
import { readText, writeText } from '../../services/room/roomStorage';

const KEY = 'roomNote';

export function useRoomNote() {
  const note = ref(readText(KEY, ''));

  function saveNote(value = note.value) {
    note.value = String(value || '');
    writeText(KEY, note.value);
  }

  return { note, saveNote };
}
