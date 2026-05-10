const http = require('http');

const BRIDGE_HOST = process.env.GPT_SOVITS_BRIDGE_HOST || '127.0.0.1';
const BRIDGE_PORT = Number(process.env.GPT_SOVITS_BRIDGE_PORT || 3288);
const TARGET_URL = process.env.GPT_SOVITS_TARGET_URL || 'http://127.0.0.1:9880/tts';

function writeCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  writeCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function proxyTts(req, res) {
  const body = req.method === 'GET'
    ? JSON.stringify(Object.fromEntries(new URL(req.url, `http://${BRIDGE_HOST}:${BRIDGE_PORT}`).searchParams))
    : await readBody(req);
  const response = await fetch(TARGET_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  writeCors(res);
  res.writeHead(response.status, {
    'Content-Type': response.headers.get('content-type') || 'audio/wav',
    'Content-Length': buffer.length
  });
  res.end(buffer);
}

const server = http.createServer(async (req, res) => {
  try {
    writeCors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    const { pathname } = new URL(req.url, `http://${BRIDGE_HOST}:${BRIDGE_PORT}`);
    if (pathname === '/health') {
      sendJson(res, 200, { ok: true, target: TARGET_URL });
      return;
    }
    if (pathname === '/tts' && (req.method === 'POST' || req.method === 'GET')) {
      await proxyTts(req, res);
      return;
    }
    sendJson(res, 404, { ok: false, message: 'Not found' });
  } catch (error) {
    sendJson(res, 502, { ok: false, message: error.message || 'GPT-SoVITS bridge failed' });
  }
});

server.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
  console.log(`GPT-SoVITS local bridge: http://${BRIDGE_HOST}:${BRIDGE_PORT}/tts`);
  console.log(`Forwarding to: ${TARGET_URL}`);
});
