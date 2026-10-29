// Persist only a digest and random request ID in this tab, never the private text.
export function createDriftSubmissions({ storage, crypto = globalThis.crypto } = {}) {
  if (storage === undefined) {
    try { storage = globalThis.sessionStorage; } catch { storage = null; }
  }
  const memory = new Map();
  const storageKey = scope => `tsukuyomi_drift_submission:${scope}`;
  function read(scope) {
    if (memory.has(scope)) return memory.get(scope);
    try {
      const saved = JSON.parse(storage?.getItem(storageKey(scope)) || 'null');
      if (saved && /^[a-f0-9]{64}$/.test(saved.fingerprint) && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(saved.requestId)) return saved;
    } catch { /* Storage is optional; retry within this page still works. */ }
    return memory.get(scope);
  }
  return {
    async prepare(scope, content, language) {
      const bytes = new TextEncoder().encode(JSON.stringify({ content, language }));
      const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
      let saved = read(scope);
      if (saved?.fingerprint !== fingerprint) saved = { fingerprint, requestId: crypto.randomUUID() };
      memory.set(scope, saved);
      try { storage?.setItem(storageKey(scope), JSON.stringify(saved)); } catch { /* Keep the in-memory receipt. */ }
      return { content, language, requestId: saved.requestId };
    },
    complete(scope, requestId) {
      if (read(scope)?.requestId !== requestId) return;
      memory.set(scope, null);
      try { storage?.removeItem(storageKey(scope)); } catch { /* No private content is stored. */ }
    }
  };
}
