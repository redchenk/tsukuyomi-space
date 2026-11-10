const KEY = 'tsukuyomi_room_entry_draft';
export function storeRoomEntryDraft(text) {
  try { sessionStorage.setItem(KEY, String(text || '').trim().slice(0, 2000)); return true; }
  catch { return false; }
}
export function takeRoomEntryDraft() {
  try { const text = sessionStorage.getItem(KEY) || ''; sessionStorage.removeItem(KEY); return text; }
  catch { return ''; }
}
