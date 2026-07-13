const express = require('express');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const { detectMimeFromMagic, SAFE_IMAGE_MIME_TYPES } = require('../services/file-security');
const { requestOverStdio } = require('../services/mcp-stdio');
const { pinnedLookup, resolvePublicUrl } = require('../services/outbound-url-security');

const router = express.Router();
const MAX_MCP_IMAGE_BYTES = 5 * 1024 * 1024;
const MINIMAX_API_HOSTS = ['api.minimaxi.com', 'api.minimaxi.chat', 'api.minimax.chat'];
let activeMcpRequests = 0;

const TOKEN_PLAN_TOOLS = [
    {
        name: 'web_search',
        description: 'Search the web with MiniMax Token Plan MCP and return relevant information.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query.' }
            },
            required: ['query']
        }
    },
    {
        name: 'understand_image',
        description: 'Analyze an image URL with MiniMax Token Plan MCP.',
        inputSchema: {
            type: 'object',
            properties: {
                image_source: { type: 'string', description: 'Public image URL or local file path to analyze.' },
                image_data: { type: 'string', description: 'Data URL or base64 image data when the MCP server supports inline images.' },
                prompt: { type: 'string', description: 'Question or analysis prompt about the image.' }
            }
        }
    }
];

function rpcResult(id, result) {
    return { jsonrpc: '2.0', id, result };
}

function rpcError(id, code, message) {
    return { jsonrpc: '2.0', id, error: { code, message } };
}

function extractAuth(req) {
    const auth = req.body?.params?.meta?.auth || {};
    let apiHost;
    try {
        const parsed = new URL(String(auth.api_host || 'https://api.minimaxi.com'));
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || !MINIMAX_API_HOSTS.includes(parsed.hostname.toLowerCase())) {
            throw new Error('invalid');
        }
        apiHost = parsed.origin;
    } catch (_) {
        const error = new Error('MiniMax API Host 不在允许列表中');
        error.status = 400;
        throw error;
    }
    return {
        apiKey: String(auth.api_key || '').trim().slice(0, 512),
        apiHost,
        basePath: '',
        resourceMode: ['url', 'base64'].includes(auth.resource_mode) ? auth.resource_mode : 'url'
    };
}

function buildMcpEnv(auth) {
    return {
        MINIMAX_API_KEY: auth.apiKey,
        MINIMAX_API_HOST: auth.apiHost,
        MINIMAX_MCP_BASE_PATH: auth.basePath,
        MINIMAX_API_RESOURCE_MODE: auth.resourceMode
    };
}

function defaultUvxCommand() {
    return fs.existsSync('/root/.local/bin/uvx') ? '/root/.local/bin/uvx' : 'uvx';
}

function imageExtensionFromMime(mime) {
    return {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp'
    }[mime] || '.png';
}

function decodeImageDataUrl(dataUrl = '') {
    const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!match || match[2].length > Math.ceil(MAX_MCP_IMAGE_BYTES * 4 / 3) + 4) throw new Error('图片数据无效或超过 5MB');
    const bytes = Buffer.from(match[2], 'base64');
    const mimeType = detectMimeFromMagic(bytes, match[1]);
    if (!bytes.length || bytes.length > MAX_MCP_IMAGE_BYTES || !SAFE_IMAGE_MIME_TYPES.has(mimeType)) {
        throw new Error('只支持 5MB 以内的 JPEG、PNG、GIF 或 WebP 图片');
    }
    return { bytes, mimeType };
}

async function downloadPublicImage(value, redirectCount = 0) {
    if (redirectCount > 2) throw new Error('远程图片重定向次数过多');
    const { url, records } = await resolvePublicUrl(value, { protocols: ['https:'] });
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            lookup: pinnedLookup(records),
            headers: { Accept: 'image/jpeg,image/png,image/gif,image/webp' }
        }, (response) => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
                response.resume();
                return resolve(downloadPublicImage(new URL(response.headers.location, url).toString(), redirectCount + 1));
            }
            if (response.statusCode !== 200) {
                response.resume();
                return reject(new Error(`远程图片请求失败：HTTP ${response.statusCode}`));
            }
            const declaredLength = Number(response.headers['content-length'] || 0);
            if (declaredLength > MAX_MCP_IMAGE_BYTES) {
                response.destroy();
                return reject(new Error('远程图片超过 5MB'));
            }
            const chunks = [];
            let size = 0;
            response.on('data', (chunk) => {
                size += chunk.length;
                if (size > MAX_MCP_IMAGE_BYTES) return response.destroy(new Error('远程图片超过 5MB'));
                chunks.push(chunk);
            });
            response.on('end', () => {
                const bytes = Buffer.concat(chunks);
                const mimeType = detectMimeFromMagic(bytes, response.headers['content-type'] || '');
                if (!bytes.length || !SAFE_IMAGE_MIME_TYPES.has(mimeType)) return reject(new Error('远程资源不是受支持的图片'));
                resolve({ bytes, mimeType });
            });
            response.on('error', reject);
        });
        request.setTimeout(8000, () => request.destroy(new Error('远程图片请求超时')));
        request.on('error', reject);
    });
}

async function writeTempImageIfNeeded(args = {}) {
    const source = String(args.image_data || args.image_source || args.image_url || '');
    if (!source) return { args: { prompt: String(args.prompt || args.question || '').slice(0, 2000) }, cleanup: null };
    const image = source.startsWith('data:') ? decodeImageDataUrl(source) : await downloadPublicImage(source);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsukuyomi-mcp-'));
    fs.chmodSync(tempDir, 0o700);
    const filePath = path.join(tempDir, `input${imageExtensionFromMime(image.mimeType)}`);
    fs.writeFileSync(filePath, image.bytes, { flag: 'wx', mode: 0o600 });
    return {
        args: {
            image_source: filePath,
            prompt: String(args.prompt || args.question || '请描述这张图片，并指出和用户问题相关的内容。').slice(0, 2000)
        },
        cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true })
    };
}

router.post('/token-plan', authenticateToken, async (req, res) => {
    const id = req.body?.id ?? null;
    const method = req.body?.method;
    const params = req.body?.params || {};

    if (method === 'tools/list') {
        return res.json(rpcResult(id, { tools: TOKEN_PLAN_TOOLS }));
    }

    if (method !== 'tools/call') {
        return res.status(400).json(rpcError(id, -32601, 'Only tools/list and tools/call are supported.'));
    }

    const name = params.name;
    const tool = TOKEN_PLAN_TOOLS.find((item) => item.name === name);
    if (!tool) {
        return res.status(400).json(rpcError(id, -32602, `Unsupported MiniMax Token Plan tool: ${name || 'unknown'}`));
    }

    const auth = extractAuth(req);
    if (!auth.apiKey) {
        return res.status(400).json(rpcError(id, -32602, 'MiniMax API Key is required.'));
    }

    let cleanup = null;
    if (activeMcpRequests >= 1) return res.status(429).json(rpcError(id, -32001, 'MCP 正忙，请稍后重试。'));
    activeMcpRequests += 1;
    try {
        const prepared = name === 'understand_image'
            ? await writeTempImageIfNeeded(params.arguments || {})
            : { args: { query: String(params.arguments?.query || '').trim().slice(0, 500) }, cleanup: null };
        if (name === 'web_search' && !prepared.args.query) return res.status(400).json(rpcError(id, -32602, 'Search query is required.'));
        cleanup = prepared.cleanup;
        const result = await requestOverStdio({
            command: process.env.MINIMAX_TOKEN_PLAN_MCP_COMMAND || defaultUvxCommand(),
            args: (process.env.MINIMAX_TOKEN_PLAN_MCP_ARGS || 'minimax-coding-plan-mcp -y').split(/\s+/).filter(Boolean),
            env: buildMcpEnv(auth),
            method: 'tools/call',
            params: { name, arguments: prepared.args },
            timeoutMs: 45000
        });
        return res.json(rpcResult(id, result));
    } catch (error) {
        console.error('MiniMax Token Plan MCP error:', error.message);
        return res.status(502).json(rpcError(id, -32000, error.message));
    } finally {
        cleanup?.();
        activeMcpRequests = Math.max(0, activeMcpRequests - 1);
    }
});

module.exports = router;
