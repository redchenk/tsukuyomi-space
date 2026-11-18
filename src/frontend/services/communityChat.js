import { apiUrl, authFetch, parseResponse } from '../api/client';

export async function chatRequest(path, method = 'GET', body, signal) {
  const response = await authFetch('/api/chatroom/' + path, {method, signal, cache:'no-store',
    ...(body ? {headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : {})});
  const result = await parseResponse(response);
  if (!response.ok || !result.success) throw new Error(result.message || '请求失败');
  return result.data;
}

// Start with WebSocket. If the network blocks upgrades, try EventSource and
// switch to bounded JSON requests when the proxy also buffers event streams.
export function connectChannel(channel, receive, status) {
  const url = new URL(apiUrl('/api/chatroom/live'), location.href);
  url.searchParams.set('channel', channel);
  let socket, source, timer, controller, cursor = '', closed = false;

  function consume(event) {
    if (closed) return;
    const packet = JSON.parse(event.data);
    clearTimeout(timer);
    if (packet.type === 'snapshot') status('live');
    receive(packet);
  }

  async function poll() {
    if (closed) return;
    controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 15000);
    let delay = document.hidden ? 12000 : 3500;
    try {
      const suffix = cursor ? '?cursor=' + encodeURIComponent(cursor) : '';
      const data = await chatRequest(channel + '/sync' + suffix, 'GET', undefined, controller.signal);
      if (closed) return;
      data.packets.forEach(receive);
      cursor = data.cursor;
      status('live');
    } catch {
      if (!closed) status('reconnecting');
      delay = 6000;
    } finally {
      clearTimeout(deadline);
      if (!closed) timer = setTimeout(poll, delay);
    }
  }

  function startPolling() {
    if (closed || controller) return;
    clearTimeout(timer);
    source?.close();
    poll();
  }

  function fallback() {
    if (closed) return;
    clearTimeout(timer);
    if (typeof EventSource === 'undefined') return startPolling();
    source = new EventSource(url.href, {withCredentials:true});
    source.onmessage = consume;
    source.onerror = startPolling;
    timer = setTimeout(startPolling, 2200);
  }

  function open() {
    if (closed) return;
    let ready = false;
    try { socket = new WebSocket(url.href.replace(/^http/, 'ws')); }
    catch { fallback(); return; }
    timer = setTimeout(() => {
      socket.onclose = null;
      socket.onmessage = null;
      socket.close();
      fallback();
    }, 2500);
    socket.onmessage = event => { ready = true; consume(event); };
    socket.onclose = () => {
      clearTimeout(timer);
      if (closed) return;
      status('reconnecting');
      if (ready) timer = setTimeout(open, 900);
      else fallback();
    };
  }
  open();
  return () => {
    closed = true;
    clearTimeout(timer);
    source?.close();
    socket?.close();
    controller?.abort();
  };
}
