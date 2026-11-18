import { apiUrl, authFetch, parseResponse } from '../api/client';

export async function chatRequest(path, method = 'GET', body) {
  const response = await authFetch('/api/chatroom/' + path, {method, cache:'no-store',
    ...(body ? {headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : {})});
  const result = await parseResponse(response);
  if (!response.ok || !result.success) throw new Error(result.message || '请求失败');
  return result.data;
}

// Both transports start with an authoritative history snapshot. An HTTP-only
// reverse proxy can still deliver the same live stream with EventSource.
export function connectChannel(channel, receive, status) {
  const url = new URL(apiUrl('/api/chatroom/live'), location.href);
  url.searchParams.set('channel',channel);
  let socket, source, timer, closed = false;
  const consume = event => {
    if (closed) return;
    const packet = JSON.parse(event.data);
    if (packet.type === 'snapshot') status('live');
    receive(packet);
  };
  function fallback() {
    if (closed || source) return;
    clearTimeout(timer);
    source = new EventSource(url.href, {withCredentials:true});
    source.onmessage = consume;
    source.onerror = () => { if (!closed) status('reconnecting'); };
  }
  function open() {
    if (closed) return;
    let ready = false;
    try { socket = new WebSocket(url.href.replace(/^http/, 'ws')); }
    catch { fallback(); return; }
    timer = setTimeout(() => socket.close(),4500);
    socket.onmessage = event => { ready = true; clearTimeout(timer); consume(event); };
    socket.onclose = () => {
      clearTimeout(timer);
      if (closed) return;
      status('reconnecting');
      if (!ready) fallback();
      else timer = setTimeout(open,900);
    };
  }
  open();
  return () => { closed=true; clearTimeout(timer); source?.close(); socket?.close(); };
}
