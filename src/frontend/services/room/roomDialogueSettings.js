import runtime from '../../../../shared/room-chat-runtime.cjs';
import { getSession } from '../../api/client';
import { readJson, writeJson } from './roomStorage';

export function roomDialogueSettingsKey() {
  return `${runtime.SETTINGS_KEY}:${getSession()?.user?.id || 'guest'}`;
}
export function readRoomDialogueSettings() {
  return runtime.normalizeSettings(readJson(roomDialogueSettingsKey(), {}));
}
export function saveRoomDialogueSettings(value, expectedKey) {
  if (expectedKey !== roomDialogueSettingsKey()) throw new Error('账号已变化，请重新打开对话设置');
  const normalized = runtime.normalizeSettings(value);
  writeJson(expectedKey, normalized);
  return normalized;
}
