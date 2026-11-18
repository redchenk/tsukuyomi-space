const http = require('node:http');
const { createHmac } = require('node:crypto');
const config = require('../config');
const { bridgeKey } = require('../routes/official-wallet');

// The official service owns the super administrator's provider and key. Its signed
// channel endpoint never accepts a member's credentials or accesses their wallet.
async function ask(messageId, turns) {
    const path = '/internal/tsukuyomi/chatroom-reply';
    const raw = JSON.stringify({ id: messageId, turns });
    const time = String(Date.now());
    const signature = createHmac('sha256', bridgeKey()).update(`POST\n${path}\n${time}\n${raw}`).digest('hex');
    return new Promise((resolve, reject) => {
        const request = http.request({ hostname:'127.0.0.1', port:Number(process.env.OFFICIAL_LLM_LOOPBACK_PORT || 8799),
            method:'POST', path, signal:AbortSignal.timeout(125000), headers:{ Host:new URL(config.publicSiteUrl).host,
                'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw),'X-Chatroom-Time':time,'X-Chatroom-Signature':signature } },
        async response => {
            try {
                if (response.statusCode !== 200) { response.resume(); throw new Error('Official model unavailable'); }
                let size=0; const chunks=[];
                for await (const chunk of response) {
                    size += chunk.length;
                    if (size > 32768) throw new Error('Invalid reply size');
                    chunks.push(chunk);
                }
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')).reply);
            } catch (error) { reject(error); }
        });
        request.on('error',reject);
        request.end(raw);
    });
}
module.exports = { ask };
