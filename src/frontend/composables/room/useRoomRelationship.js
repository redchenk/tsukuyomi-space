import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { authFetch, getSession, parseResponse } from '../../api/client';
import { ROOM_RELATIONSHIP_UPDATED } from '../../services/room/roomRelationship';

export function useRoomRelationship(owner) {
  const state = ref(null);
  const status = ref('loading');
  const feedback = ref(null);
  let sequence = 0, timer, controller, disposed = false;
  const account = () => String(owner() || '');

  async function refresh(attempts = 0) {
    clearTimeout(timer);
    const userId = account();
    const request = ++sequence;
    controller?.abort();
    if (!userId) { state.value = null; feedback.value = null; status.value = 'guest'; return; }
    if (!state.value) status.value = 'loading';
    const requestController = new AbortController();
    controller = requestController;
    const timeout = setTimeout(() => requestController.abort(), 8000);
    try {
      const response = await authFetch('/api/room/relationship', { cache: 'no-store', signal: controller.signal });
      const result = await parseResponse(response);
      if (disposed || sequence !== request || account() !== userId || String(getSession()?.user?.id || '') !== userId) return;
      if (!response.ok || !result.success) throw new Error('relationship unavailable');
      const before = state.value?.score;
      state.value = result.data;
      status.value = 'ready';
      if (before != null && result.data.score > before) feedback.value = { delta: result.data.score - before, reason: '互动记录已更新' };
      if (attempts > 0 && result.data.pending) timer = setTimeout(() => void refresh(attempts - 1), 3000);
    } catch {
      if (!disposed && sequence === request && account() === userId) status.value = 'error';
    } finally { clearTimeout(timeout); }
  }
  function updated(event) {
    const detail = event.detail;
    if (disposed || detail?.userId !== account() || detail.userId !== String(getSession()?.user?.id || '')) return;
    ++sequence; controller?.abort(); clearTimeout(timer);
    state.value = detail.relationship; status.value = 'ready';
    if (detail.change) feedback.value = detail.change;
    if (detail.relationship.pending) timer = setTimeout(() => void refresh(4), 2000);
  }
  function visible() { if (document.visibilityState === 'visible') void refresh(4); }
  watch(owner, () => { state.value = null; feedback.value = null; void refresh(4); });
  onMounted(() => {
    window.addEventListener(ROOM_RELATIONSHIP_UPDATED, updated);
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    void refresh(4);
  });
  onBeforeUnmount(() => {
    disposed = true; ++sequence; clearTimeout(timer); controller?.abort();
    window.removeEventListener(ROOM_RELATIONSHIP_UPDATED, updated);
    window.removeEventListener('focus', visible);
    document.removeEventListener('visibilitychange', visible);
  });
  return { state, status, feedback, refresh };
}
