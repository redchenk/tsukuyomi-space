const { WebSocketServer } = require('ws');
const { channels } = require('../../shared/community-chat.cjs');
const { optionalAuth } = require('../middleware/auth');
const { isAllowedOrigin, getClientIp } = require('../middleware/security');
const chat = require('./community-chat');

const clients = new Set();
const knownChannel = id => channels.some(channel => channel.id === id);
const path = '/api/chatroom/live';
function hasCapacity(req) {
    const identity = req.user?.id || getClientIp(req);
    return clients.size < 500 && [...clients].filter(c => c.identity === identity).length < (req.user ? 8 : 32);
}
function members(channel) {
    const unique = new Map();
    for (const c of clients) if (c.channel === channel && c.user) unique.set(c.user.id,c.user);
    return [...unique.values()];
}
function roomEvent(channel, event) {
    for (const client of clients) if (client.channel === channel) client.send(event);
}
function publish(message, isNew = false) {
    roomEvent(message.channel, { type:'message', message });
    if (isNew) for (const c of clients) if (c.channel !== message.channel) c.send({type:'activity',channel:message.channel,id:message.id});
}
function join(req, channel, send) {
    const user = req.user ? { id:req.user.id, name:req.user.nickname || req.user.username } : null;
    const client = { identity:req.user?.id || getClientIp(req), channel, user, send };
    clients.add(client);
    send({ type:'snapshot', ...chat.history(channel) });
    roomEvent(channel,{type:'presence',members:members(channel)});
    return () => {
        if (clients.delete(client)) roomEvent(channel,{type:'presence',members:members(channel)});
    };
}
function events(req,res) {
    const channel = req.query.channel;
    if (!knownChannel(channel)) return res.sendStatus(404);
    if (!hasCapacity(req)) return res.sendStatus(429);
    res.set({ 'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'private, no-store, no-transform','X-Accel-Buffering':'no' });
    res.flushHeaders();
    const leave = join(req,channel,event => {
        if (res.writableLength > 1024*1024) return res.destroy();
        if (!res.destroyed) res.write('data: ' + JSON.stringify(event) + '\n\n');
    });
    const timer = setInterval(() => res.write(': keepalive\n\n'),20000);
    const refresh = setTimeout(() => res.end(),300000);
    res.once('close',() => { clearInterval(timer); clearTimeout(refresh); leave(); });
}

function attach(server) {
    const sockets = new WebSocketServer({ noServer:true, maxPayload:1024, perMessageDeflate:false, clientTracking:false });
    server.on('upgrade',(req,socket,head) => {
        let url;
        try { url = new URL(req.url,'http://localhost'); } catch { return socket.destroy(); }
        const channel = url.searchParams.get('channel');
        if (url.pathname !== path || !knownChannel(channel) || !req.headers.origin || !isAllowedOrigin(req.headers.origin,req)) return socket.destroy();
        socket.on('error',() => socket.destroy());
        optionalAuth(req,null,() => {
            if (socket.destroyed || !hasCapacity(req)) return socket.destroy();
            sockets.handleUpgrade(req,socket,head,ws => {
                ws.on('error',() => ws.terminate());
                const leave = join(req,channel,event => {
                    if (ws.bufferedAmount > 1024*1024) return ws.terminate();
                    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
                });
                let alive = true;
                ws.on('pong',() => { alive=true; });
                ws.on('message',() => ws.close(1008));
                const timer = setInterval(() => {
                    if (!alive) return ws.terminate();
                    alive=false; ws.ping();
                },20000);
                const refresh = setTimeout(() => ws.close(1000),300000);
                ws.once('close',() => { clearInterval(timer); clearTimeout(refresh); leave(); });
            });
        });
    });
}
module.exports = { knownChannel, events, attach, publish };
