import { onBeforeUnmount, onMounted, watch } from 'vue';
import { authFetch, parseResponse } from '../api/client';

// Count only while this article is actually open and the tab stays visible.
export function useQualifiedArticleRead(article, reading) {
  let timer = 0;
  let revision = 0;
  let completed = false;
  let retries = 0;
  function cancel() { clearTimeout(timer); timer = 0; revision += 1; }
  function schedule() {
    cancel();
    if (completed || document.visibilityState !== 'visible' || !article.value?.id || !reading.value?.token) return;
    const current = revision;
    const id = article.value.id;
    const token = reading.value.token;
    timer = setTimeout(async () => {
      if (current !== revision || document.visibilityState !== 'visible') return;
      try {
        const response = await authFetch(`/api/articles/${encodeURIComponent(id)}/read`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token })
        });
        const result = await parseResponse(response);
        if (current !== revision) return;
        if (!result.success || result.data?.reason === 'too_soon') throw new Error('Read not recorded');
        completed = true;
        if (Number.isFinite(result.data?.viewCount) && article.value?.id === id) article.value.view_count = result.data.viewCount;
      } catch (_) {
        if (current === revision && retries++ < 2) schedule();
      }
    }, Math.max(12, Number(reading.value.seconds) || 12) * 1000);
  }
  watch(() => reading.value?.token, () => { completed = false; retries = 0; schedule(); });
  onMounted(() => document.addEventListener('visibilitychange', schedule));
  onBeforeUnmount(() => { cancel(); document.removeEventListener('visibilitychange', schedule); });
}
