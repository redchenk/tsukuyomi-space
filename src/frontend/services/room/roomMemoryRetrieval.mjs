import retrieval from '../../../../shared/room-memory-retrieval.cjs';
const { memoryRetrievalScope, memoryAllowedForTurns } = retrieval;

const empty = (backend, extra = {}) => ({ data: [], retrieval: { backend, ...extra } });
const failure = (reason, status) => Object.assign(new Error(reason === 'account_changed' ? '登录账号已变化，请重新发送' : reason), { reason, status });

// Every attempt reads the authenticated source, including snapshot validation.
// A snapshot narrows selection but cannot bypass edits, deletion or ownership.
export function createRoomMemoryRetriever({ getAccountId, isEnabled, retrieveGuest, request,
  useLocal = () => false, warn = (...args) => console.warn(...args), timeoutMs = 8000, fallbackTimeoutMs = 4000 }) {
  return async function retrieve(message, signal = null, options = {}) {
    const scope = memoryRetrievalScope(options);
    const excluded = new Set(scope.excludeTurnIds);
    const selectedIds = scope.snapshotIds !== undefined ? new Set(scope.snapshotIds) : null;
    const accountId = getAccountId();
    const local = !accountId || useLocal();
    const started = Date.now();
    const check = () => {
      if (signal?.aborted) throw new DOMException('Memory request cancelled', 'AbortError');
      if (getAccountId() !== accountId) throw failure('account_changed');
      if ((!getAccountId() || useLocal()) !== local) throw failure('account_changed');
      if (!isEnabled()) throw failure('disabled');
    };
    const attempt = async (sourceOnly = false) => {
      check();
      const controller = new AbortController();
      let timer, cancel, timedOut = false;
      const interrupted = new Promise((_, reject) => {
        cancel = () => { controller.abort(); reject(new DOMException('Memory request cancelled', 'AbortError')); };
        signal?.addEventListener('abort', cancel, { once: true });
        timer = setTimeout(() => { timedOut = true; controller.abort(); reject(failure('timeout')); }, sourceOnly ? fallbackTimeoutMs : timeoutMs);
      });
      try {
        const operation = !local
          ? request(new URLSearchParams({ q: String(message).trim(), limit: '6', purpose: 'chat',
              ...(scope.excludeTurnIds.length ? { excludeTurnIds: JSON.stringify(scope.excludeTurnIds) } : {}),
              ...(selectedIds ? { memoryIds: JSON.stringify(scope.snapshotIds) } : {}),
              ...(sourceOnly ? { retrieval: 'source' } : {}) }), controller.signal)
          : retrieveGuest(message, scope).then(data => ({ success: true, data, retrieval: { backend: 'indexeddb' } }));
        const result = await Promise.race([operation, interrupted]);
        check();
        if (!result?.success) throw failure('success_false');
        if (!Array.isArray(result.data)) throw failure('invalid_response');
        // Defence in depth for a mixed-version rollout or a legacy fallback.
        const data = result.retrieval?.selection === 'recent' ? [] : result.data.filter(row =>
          memoryAllowedForTurns(row, excluded) && (!selectedIds || selectedIds.has(row.id))).slice(0, 6);
        return { data, retrieval: { ...result.retrieval, count: data.length } };
      } catch (error) {
        if (timedOut && !signal?.aborted) throw failure('timeout');
        throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
      }
    };
    const reasonFor = error => error.reason || (error.status ? `http_${error.status}` : 'network');
    const diagnose = (error, phase) => warn('[memory] retrieval failed', {
      phase, reason: reasonFor(error), ...(error.status ? { status: error.status } : {}), elapsedMs: Date.now() - started
    });
    const canContinue = error => {
      // Cancellation and identity changes must stop prompt construction entirely.
      check();
      if (error?.name === 'AbortError') throw error;
    };
    if (!isEnabled()) return empty('disabled');
    if (!String(message || '').trim()) return empty('none');
    try {
      return await attempt();
    } catch (error) {
      if (!isEnabled()) return empty('disabled');
      canContinue(error);
      diagnose(error, 'search');
      const reason = reasonFor(error);
      if (local || [401, 403].includes(error.status)) return empty('unavailable', { reason });
      try {
        // One bounded retry against SQLite, bypassing a slow/broken vector index.
        const result = await attempt(true);
        return { ...result, retrieval: { ...result.retrieval, backend: 'sqlite', fallback: true, reason } };
      } catch (fallbackError) {
        if (!isEnabled()) return empty('disabled');
        canContinue(fallbackError);
        diagnose(fallbackError, 'source');
        return empty('unavailable', { reason, fallbackReason: reasonFor(fallbackError) });
      }
    }
  };
}

export function memoryRetrievalNotice(trace = {}, english = false) {
  const count = Number(trace.count) || 0;
  if (count) return english
    ? `Referenced ${count} long-term memories${trace.fallback ? ' (backup retrieval)' : ''}`
    : `已参考 ${count} 条长期记忆${trace.fallback ? '（备用检索）' : ''}`;
  if (trace.backend === 'unavailable') {
    const reason = trace.fallbackReason || trace.reason;
    const detail = reason === 'timeout' ? (english ? 'request timed out' : '请求超时')
      : reason === 'http_401' ? (english ? 'please sign in again' : '请重新登录')
      : reason === 'http_403' ? (english ? 'access denied' : '暂无读取权限')
      : reason === 'network' ? (english ? 'connection failed' : '连接失败')
      : /^http_\d{3}$/.test(reason || '') ? `HTTP ${reason.slice(5)}`
      : (english ? 'invalid service response' : '服务响应异常');
    return english ? `Long-term memory is temporarily unavailable (${detail})` : `长期记忆暂时无法读取（${detail}）`;
  }
  if (trace.fallback) return english ? 'Backup retrieval found no available memories' : '已尝试备用检索，暂无可用记忆';
  return '';
}
