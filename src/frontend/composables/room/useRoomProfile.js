import { reactive } from 'vue';
import { readJson, writeJson } from '../../services/room/roomStorage';

const KEY = 'roomProfile';

export function useRoomProfile() {
  const profile = reactive({ nickname: '', signature: '' });

  function loadProfile() {
    const saved = readJson(KEY, {});
    profile.nickname = saved.nickname || '';
    profile.signature = saved.signature || '';
  }

  function saveProfile(next = profile) {
    profile.nickname = String(next.nickname || '').trim();
    profile.signature = String(next.signature || '').trim();
    writeJson(KEY, { nickname: profile.nickname, signature: profile.signature });
  }

  loadProfile();

  return { profile, loadProfile, saveProfile };
}
