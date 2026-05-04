const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { requestOverStdio } = require('../services/mcp-stdio');

const router = express.Router();

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
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    return {
        apiKey: auth.api_key || bearer,
        apiHost: auth.api_host || 'https://api.minimaxi.com',
        basePath: auth.base_path || '',
        resourceMode: auth.resource_mode || 'url'
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

function writeTempImageIfNeeded(args = {}) {
    if (!String(args.image_source || args.image_url || '').startsWith('data:') && !args.image_data) return {
        args: {
            ...args,
            image_source: args.image_source || args.image_url
        },
        cleanup: null
    };
    const dataUrl = String(args.image_data || args.image_source || args.image_url || '');
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return { args, cleanup: null };
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > 20 * 1024 * 1024) throw new Error('Image exceeds MiniMax Token Plan MCP 20MB limit.');
    const filePath = path.join(os.tmpdir(), `tsukuyomi-mcp-${Date.now()}-${Math.random().toString(36).slice(2)}${imageExtensionFromMime(match[1])}`);
    fs.writeFileSync(filePath, bytes);
    return {
        args: {
            ...args,
            image_source: filePath,
            prompt: args.prompt || args.question || '请描述这张图片，并指出和用户问题相关的内容。'
        },
        cleanup: () => fs.rmSync(filePath, { force: true })
    };
}

router.post('/token-plan', async (req, res) => {
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
    try {
        const prepared = name === 'understand_image'
            ? writeTempImageIfNeeded(params.arguments || {})
            : { args: params.arguments || {}, cleanup: null };
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
    }
});

module.exports = router;
