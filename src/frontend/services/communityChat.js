import { apiUrl, authFetch, parseResponse } from '../api/client';

export async function chatRequest(path, method = 'GET', body, signal) {
  const response = await authFetch('/api/chatroom/' + path, {method, signal, cache:'no-store',
    ...(body ? {headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : {})});
  const result = await parseResponse(response);
  if (!response.ok || !result.success) throw new Error(result.message || '请求失败');
  return result.data;
}

// HTTP can deliver history even if the edge buffers both streaming transports.
// Probe for streaming in parallel and hand over only after a real snapshot.
export function connectChannel(channel, receive, status) {
  const path = channel + '/sync';
  const liveUrl = new URL(apiUrl('/api/chatroom/live'), location.href);
  liveUrl.searchParams.set('channel', channel);
  let socket, source, probeTimer, pollTimer, controller;
  let cursor = '', closed = false, streaming = false, failures = 0;

  const entry = window.tsukuyomiChatEntry;
  delete window.tsukuyomiChatEntry;
  let initial;
  if (entry && entry.url === apiUrl('/api/chatroom/' + path) && performance.now() - entry.started < 10000) {
    initial = entry;
  } else {
    entry?.controller.abort();
  }

  async function poll() {
    if (closed || streaming || controller) return;
    const first = initial;
    initial = null;
    const request = first?.controller || new AbortController();
    controller = request;
    const deadline = setTimeout(() => request.abort(), 12000);
    let delay = document.hidden ? 12000 : 3500;
    try {
      const data = first ? (await first.snapshot)?.data
        : await chatRequest(path + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), 'GET', undefined, request.signal);
      if (closed || streaming || controller !== request) return;
      if (!data?.cursor || !Array.isArray(data.packets)) throw new Error('Missing channel snapshot');
      data.packets.forEach(receive);
      cursor = data.cursor;
      failures = 0;
      if (first) delay = Math.max(0, delay - (performance.now() - first.started));
      status('live');
    } catch {
      if (closed || streaming || controller !== request) return;
      status('reconnecting');
      delay = Math.min(6000, 300 * 2 ** Math.min(failures++, 5));
    } finally {
      clearTimeout(deadline);
      if (controller === request) {
        controller = null;
        if (!closed && !streaming) pollTimer = setTimeout(poll, delay);
      }
    }
  }

  function consume(event) {
    if (closed) return;
    const packet = JSON.parse(event.data);
    if (!streaming) {
      if (packet.type !== 'snapshot') return;
      streaming = true;
      clearTimeout(probeTimer);
      clearTimeout(pollTimer);
      controller?.abort();
      controller = null;
      status('live');
    }
    receive(packet);
  }

  function resumePolling() {
    if (!streaming || closed) return;
    streaming = false;
    status('reconnecting');
    poll();
  }

  function tryEvents() {
    if (closed || typeof EventSource === 'undefined') return;
    source = new EventSource(liveUrl.href, {withCredentials:true});
    source.onmessage = consume;
    source.onerror = () => {
      clearTimeout(probeTimer);
      source.close();
      resumePolling();
    };
    probeTimer = setTimeout(() => source.close(), 2200);
  }

  function trySocket() {
    if (closed) return;
    try { socket = new WebSocket(liveUrl.href.replace(/^http/, 'ws')); }
    catch { tryEvents(); return; }
    probeTimer = setTimeout(() => {
      socket.onmessage = socket.onclose = null;
      socket.close();
      tryEvents();
    }, 2500);
    socket.onmessage = consume;
    socket.onclose = () => {
      clearTimeout(probeTimer);
      if (closed) return;
      if (streaming) {
        resumePolling();
        probeTimer = setTimeout(trySocket, 900);
      } else {
        tryEvents();
      }
    };
  }

  poll();
  trySocket();
  return () => {
    closed = true;
    clearTimeout(pollTimer);
    clearTimeout(probeTimer);
    source?.close();
    socket?.close();
    controller?.abort();
  };
}
