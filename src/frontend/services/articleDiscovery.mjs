import { authFetch } from '../api/client';
const STORAGE = 'tsukuyomi:article-discovery';
function saveAttribution(ids, token, storage = globalThis.sessionStorage, now = Date.now()) {
  try {
    const entries = JSON.parse(storage.getItem(STORAGE) || '{}');
    for (const [id, value] of Object.entries(entries)) if (now - value.at > 20 * 60000) delete entries[id];
    for (const id of ids) entries[id] = { token, at: now };
    const kept = Object.entries(entries).sort((a,b) => b[1].at-a[1].at).slice(0,60);
    storage.setItem(STORAGE, JSON.stringify(Object.fromEntries(kept)));
  } catch { /* Storage is optional; it never blocks reading. */ }
}
export function discoveryReadToken(id, storage = globalThis.sessionStorage, now = Date.now()) {
  try { const value=JSON.parse(storage.getItem(STORAGE)||'{}')[id];return value && now-value.at>=0 && now-value.at<20*60000 ? value.token : ''; } catch { return ''; }
}
export function createArticleDiscoveryTracker({ request = authFetch, documentImpl = globalThis.document,
  Observer = globalThis.IntersectionObserver, storage = globalThis.sessionStorage,
  setTimer = globalThis.setTimeout, clearTimer = globalThis.clearTimeout } = {}) {
  let observer, token='', sessionAbort, revision=0, flushTimer;
  const visible=new Map(), timers=new Map(), sent=new Set(), queue=new Set();
  function clear(id) { clearTimer(timers.get(id));timers.delete(id); }
  function schedule(id) {
    clear(id);
    if (!visible.get(id) || documentImpl.visibilityState!=='visible' || sent.has(id) || !token) return;
    timers.set(id,setTimer(()=>{
      timers.delete(id);
      if (!visible.get(id) || documentImpl.visibilityState!=='visible') return;
      sent.add(id);queue.add(id);
      clearTimer(flushTimer);flushTimer=setTimer(flush,100);
    },1000));
  }
  async function flush() {
    clearTimer(flushTimer);
    const ids=[...queue];queue.clear();if(!ids.length||!token)return;
    const receipt=token;
    try {
      const response=await request('/api/articles/discovery/impressions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:receipt,ids}),keepalive:true});
      const data=await response.json();
      if(response.ok&&data.success&&!data.data?.reason)saveAttribution(ids,receipt,storage);
    } catch { /* No inferred exposure or retry loop when offline. */ }
  }
  function onVisibility() { for (const id of visible.keys()) schedule(id); }
  function stop() {
    // Flush only impressions that already met the visibility/duration condition.
    void flush();revision++;sessionAbort?.abort();observer?.disconnect();observer=null;
    for(const id of timers.keys())clear(id);
    visible.clear();sent.clear();token='';documentImpl.removeEventListener('visibilitychange',onVisibility);
  }
  async function start(root,context) {
    stop();if(!root||!Observer)return;
    const version=revision;sessionAbort=new AbortController();
    try {
      const response=await request('/api/articles/discovery/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(context),signal:sessionAbort.signal,cache:'no-store'});
      const data=await response.json();if(version!==revision||!response.ok||!data.success)return;
      token=data.data.token;documentImpl.addEventListener('visibilitychange',onVisibility);
      observer=new Observer(entries=>{
        for(const entry of entries){const id=Number(entry.target.dataset.articleId);if(!Number.isSafeInteger(id))continue;
          visible.set(id,entry.isIntersecting&&entry.intersectionRatio>=0.5);schedule(id);}
      },{threshold:[0,0.5,1]});
      for(const element of root.querySelectorAll('[data-article-id]'))observer.observe(element);
    } catch { /* Measurement must not gate the article list. */ }
  }
  return { start, stop, destroy:stop };
}
