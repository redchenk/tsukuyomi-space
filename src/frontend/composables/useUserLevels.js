import { reactive } from 'vue';
import { loadPublicUserLevels } from '../services/userGrowth';

export function useUserLevels() {
  const levels = reactive({});

  async function hydrateUserLevels(userIds, options) {
    const loaded = await loadPublicUserLevels(userIds, options);
    Object.assign(levels, loaded);
    return loaded;
  }

  function userLevel(userId) {
    return levels[String(userId || '').trim()] || null;
  }

  return { hydrateUserLevels, userLevel };
}
