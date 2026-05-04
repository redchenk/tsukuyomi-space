const express = require('express');
const fs = require('fs');
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
                image_url: { type: 'string', description: 'Public image URL to analyze.' },
                question: { type: 'string', description: 'Question about the image.' }
            },
            required: ['image_url']
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

    try {
        const result = await requestOverStdio({
            command: process.env.MINIMAX_TOKEN_PLAN_MCP_COMMAND || defaultUvxCommand(),
            args: (process.env.MINIMAX_TOKEN_PLAN_MCP_ARGS || 'minimax-coding-plan-mcp -y').split(/\s+/).filter(Boolean),
            env: buildMcpEnv(auth),
            method: 'tools/call',
            params: { name, arguments: params.arguments || {} },
            timeoutMs: 45000
        });
        return res.json(rpcResult(id, result));
    } catch (error) {
        console.error('MiniMax Token Plan MCP error:', error.message);
        return res.status(502).json(rpcError(id, -32000, error.message));
    }
});

module.exports = router;
