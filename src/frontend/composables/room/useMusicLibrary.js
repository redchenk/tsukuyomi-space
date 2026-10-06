import { reactive } from 'vue';
import { authFetch } from '../../api/client';

export async function musicRequest(path, options = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal.reason);
  const timeout = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), 15000);
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  try {
    const response = await authFetch(`/api/music${path}`, {
      ...options, signal: controller.signal,
      headers: { 'X-Requested-With': 'XMLHttpRequest', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
    });
    let data;
    try { data = await response.json(); }
    catch (error) { if (controller.signal.aborted) throw error; throw new Error('音乐服务返回异常，请稍后重试'); }
    if (!response.ok || !data.success) throw Object.assign(new Error(data.message || '音乐服务暂时不可用'), { code: data.code, status: response.status });
    return data;
  } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); }
}

export function useMusicLibrary({ selectTrack, useLocal }) {
  const library = reactive({ enabled: true, profile: null, busy: false, error: '', qr: null, qrImage: '', qrStatus: '',
    query: '', view: 'search', results: [], playlists: [], offset: 0, total: 0, more: false, playlist: null });
  let open = false;
  let qrEpoch = 0;
  let browseEpoch = 0;
  let timer;
  let pollController;

  function failed(error) {
    library.error = error.name === 'TimeoutError' || error.name === 'AbortError' ? '连接暂时失败，请稍后重试' : error.message;
    if (error.status === 401) {
      library.profile = null;
      library.results = []; library.playlists = [];
      useLocal();
    }
  }
  function stopPolling() {
    qrEpoch++;
    clearTimeout(timer);
    pollController?.abort();
    pollController = null;
  }
  async function refresh() {
    const epoch = qrEpoch;
    try {
      const data = await musicRequest('/status');
      if (!open || epoch !== qrEpoch) return;
      if (library.profile?.id !== data.profile?.id) {
        library.results = []; library.playlists = []; library.playlist = null;
        browseEpoch++;
      }
      library.enabled = data.enabled;
      library.profile = data.profile;
      if (!data.profile) useLocal();
    } catch (error) { if (open && epoch === qrEpoch) failed(error); }
  }
  function visibility() {
    if (document.hidden) { clearTimeout(timer); pollController?.abort(); }
    else if (open && library.qr) schedule(qrEpoch, 100);
  }
  function schedule(epoch, delay = 3000) {
    clearTimeout(timer);
    if (open && library.qr && !document.hidden && epoch === qrEpoch) timer = setTimeout(() => poll(epoch), delay);
  }
  async function poll(epoch) {
    if (!open || !library.qr || epoch !== qrEpoch || document.hidden) return;
    if (Date.now() >= library.qr.expiresAt) { library.qrStatus = 'expired'; return; }
    pollController = new AbortController();
    try {
      const data = await musicRequest('/qr/check', { method: 'POST', body: JSON.stringify({ qrId: library.qr.qrId }), signal: pollController.signal });
      if (epoch !== qrEpoch) return;
      library.error = '';
      library.qrStatus = data.status;
      if (data.status === 'authorized') {
        library.profile = data.profile;
        library.qr = null; library.qrImage = '';
        stopPolling();
        await browse('playlists');
      } else if (data.status !== 'expired') schedule(epoch);
    } catch (error) {
      if (epoch !== qrEpoch || !open || document.hidden) return;
      failed(error); schedule(epoch, 6000);
    }
  }
  async function login() {
    if (library.busy) return;
    stopPolling(); library.busy = true; library.error = ''; library.qr = null; library.qrImage = '';
    const epoch = qrEpoch;
    try {
      const data = await musicRequest('/qr', { method: 'POST', body: '{}' });
      if (!open || epoch !== qrEpoch) return;
      const { default: qrcode } = await import('../../vendor/qrcode/qrcode.mjs');
      if (!open || epoch !== qrEpoch) return;
      const code = qrcode(0, 'M'); code.addData(data.url, 'Byte'); code.make();
      library.qrImage = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(code.createSvgTag({ cellSize: 4, margin: 16, scalable: true }))}`;
      library.qr = data; library.qrStatus = 'waiting';
      schedule(epoch);
    } catch (error) { if (epoch === qrEpoch) failed(error); }
    finally { if (epoch === qrEpoch) library.busy = false; }
  }
  async function logout() {
    if (library.busy) return;
    stopPolling(); library.busy = true; library.error = ''; browseEpoch++;
    const epoch = qrEpoch;
    try {
      await musicRequest('/logout', { method: 'POST', body: '{}' });
      if (epoch !== qrEpoch) return;
      library.profile = null; library.qr = null; library.qrImage = ''; library.qrStatus = '';
      library.results = []; library.playlists = []; library.playlist = null;
      useLocal();
    } catch (error) { if (epoch === qrEpoch) failed(error); }
    finally { if (epoch === qrEpoch) library.busy = false; }
  }
  async function browse(view = 'search', page = 0, playlist = null) {
    if (library.busy || !library.profile) return;
    if (view === 'search' && !library.query.trim()) { library.error = '输入歌名或歌手，找到想听的音乐'; return; }
    const epoch = ++browseEpoch;
    library.busy = true; library.error = '';
    try {
      const path = view === 'playlists' ? '/playlists' : view === 'playlist' ? `/playlists/${encodeURIComponent(playlist.id)}` : `/search?q=${encodeURIComponent(library.query.trim())}`;
      const data = await musicRequest(`${path}${path.includes('?') ? '&' : '?'}offset=${page}`);
      if (epoch !== browseEpoch) return;
      library.view = view; library.playlist = playlist; library.offset = page;
      library.results = data.tracks || []; library.playlists = data.playlists || [];
      library.total = data.total || 0;
      library.more = Boolean(data.more || page + library.results.length < library.total);
    } catch (error) { if (epoch === browseEpoch) failed(error); }
    finally { if (epoch === browseEpoch) library.busy = false; }
  }
  async function play(track) {
    library.error = '';
    try { await selectTrack(track); } catch (error) { failed(error); }
  }
  function setOpen(value) {
    open = value;
    if (value) {
      refresh();
      if (library.qr) schedule(qrEpoch, 100);
    } else { stopPolling(); browseEpoch++; library.busy = false; }
  }
  document.addEventListener('visibilitychange', visibility);
  return { library, refresh, login, logout, browse, play, setOpen, failed,
    resetAccount() {
      stopPolling(); browseEpoch++;
      library.busy = false; library.profile = null; library.qr = null; library.qrImage = '';
      library.results = []; library.playlists = []; library.playlist = null; library.error = '';
      useLocal();
      if (open) refresh();
    },
    destroy() { stopPolling(); browseEpoch++; document.removeEventListener('visibilitychange', visibility); } };
}
