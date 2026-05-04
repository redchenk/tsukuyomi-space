(function () {
    'use strict';

    const MODEL_URL = '/models/tsukimi-yachiyo/tsukimi-yachiyo.model3.json';
    const WORLD_ENDPOINT = '/api/room/world';
    const WORLD_CACHE_KEY = 'roomWorldState';
    const WORLD_CACHE_TTL = 20 * 60 * 1000;
    const MEMORY_DB_NAME = 'tsukuyomi-room-memory';
    const MEMORY_DB_VERSION = 1;
    const MEMORY_STORE = 'memories';
    const MEMORY_VECTOR_SIZE = 96;
    const MEMORY_MAX_PER_USER = 240;
    const CORE = () => window.Live2DCubismCore;
    const Utils = () => CORE()?.Utils || {};

    const DEFAULT_MODEL_SETTINGS = { scale: 1, xOffset: 0, yOffset: 0 };
    let chatConversation = [];
    let live2d = null;
    let ttsAudioUrl = null;
    let draggedPanel = null;
    let dragOffset = { x: 0, y: 0 };
    let zIndexCounter = 30;
    let live2dReadyListener = null;
    let worldRefreshTimer = null;
    let memoryDbPromise = null;

    function $(id) {
        return document.getElementById(id);
    }

    function readJson(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key));
            return value == null ? fallback : value;
        } catch (_) {
            return fallback;
        }
    }

    function writeJson(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function requestToPromise(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
        });
    }

    function txToPromise(tx) {
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
            tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
        });
    }

    function openMemoryDb() {
        if (!('indexedDB' in window)) return Promise.resolve(null);
        if (memoryDbPromise) return memoryDbPromise;
        memoryDbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(MEMORY_DB_NAME, MEMORY_DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                const store = db.objectStoreNames.contains(MEMORY_STORE)
                    ? request.transaction.objectStore(MEMORY_STORE)
                    : db.createObjectStore(MEMORY_STORE, { keyPath: 'id' });
                if (!store.indexNames.contains('userKey')) store.createIndex('userKey', 'userKey', { unique: false });
                if (!store.indexNames.contains('createdAt')) store.createIndex('createdAt', 'createdAt', { unique: false });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
        }).catch((error) => {
            console.warn('Room memory disabled:', error.message);
            return null;
        });
        return memoryDbPromise;
    }

    function memorySettings() {
        return { enabled: true, ...readJson('roomMemorySettings', {}) };
    }

    function writeMemorySettings(settings) {
        writeJson('roomMemorySettings', settings);
    }

    function ensureGuestMemoryId() {
        let id = localStorage.getItem('roomMemoryGuestId');
        if (!id) {
            id = `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
            localStorage.setItem('roomMemoryGuestId', id);
        }
        return id;
    }

    function currentVisitor() {
        const page = getRoomPage();
        const profile = readJson('roomProfile', {});
        const rawId = page?.dataset.roomUserId || '';
        const rawName = page?.dataset.roomUserName || '';
        return {
            userKey: rawId ? `user:${rawId}` : `guest:${ensureGuestMemoryId()}`,
            name: profile.nickname || rawName || 'Guest',
            signature: profile.signature || ''
        };
    }

    function hashString(value) {
        let hash = 2166136261;
        for (let index = 0; index < value.length; index += 1) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function tokenizeMemoryText(text) {
        const value = String(text || '').toLowerCase();
        const words = value.match(/[a-z0-9_]+|[\u4e00-\u9fff]/g) || [];
        const grams = [];
        for (let index = 0; index < words.length - 1; index += 1) {
            grams.push(`${words[index]}${words[index + 1]}`);
        }
        return words.concat(grams);
    }

    function makeMemoryEmbedding(text) {
        const vector = Array(MEMORY_VECTOR_SIZE).fill(0);
        tokenizeMemoryText(text).forEach((token) => {
            const hash = hashString(token);
            const slot = hash % MEMORY_VECTOR_SIZE;
            vector[slot] += (hash & 1) ? 1 : -1;
        });
        const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
        return vector.map(value => Number((value / norm).toFixed(6)));
    }

    function memorySimilarity(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b)) return 0;
        let score = 0;
        for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
            score += Number(a[index] || 0) * Number(b[index] || 0);
        }
        return score;
    }

    async function getUserMemories(userKey) {
        const db = await openMemoryDb();
        if (!db) return [];
        const tx = db.transaction(MEMORY_STORE, 'readonly');
        const index = tx.objectStore(MEMORY_STORE).index('userKey');
        return requestToPromise(index.getAll(IDBKeyRange.only(userKey)));
    }

    async function putMemory(record) {
        const db = await openMemoryDb();
        if (!db) return;
        const tx = db.transaction(MEMORY_STORE, 'readwrite');
        tx.objectStore(MEMORY_STORE).put(record);
        await txToPromise(tx);
    }

    async function pruneUserMemories(userKey) {
        const memories = await getUserMemories(userKey);
        if (memories.length <= MEMORY_MAX_PER_USER) return;
        const stale = memories
            .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
            .slice(0, memories.length - MEMORY_MAX_PER_USER);
        const db = await openMemoryDb();
        if (!db) return;
        const tx = db.transaction(MEMORY_STORE, 'readwrite');
        stale.forEach((item) => tx.objectStore(MEMORY_STORE).delete(item.id));
        await txToPromise(tx);
    }

    async function clearCurrentUserMemories() {
        const visitor = currentVisitor();
        const memories = await getUserMemories(visitor.userKey);
        const db = await openMemoryDb();
        if (!db) return 0;
        const tx = db.transaction(MEMORY_STORE, 'readwrite');
        memories.forEach((item) => tx.objectStore(MEMORY_STORE).delete(item.id));
        await txToPromise(tx);
        return memories.length;
    }

    async function buildMemorySystemContext(message) {
        try {
            if (!memorySettings().enabled) return '';
            const visitor = currentVisitor();
            const memories = await getUserMemories(visitor.userKey);
            const query = makeMemoryEmbedding(message);
            const matched = memories
                .map(item => ({ ...item, score: memorySimilarity(query, item.embedding) }))
                .filter(item => item.score > 0.08)
                .sort((a, b) => b.score - a.score || String(b.createdAt).localeCompare(String(a.createdAt)))
                .slice(0, 5);

            return [
                '以下是八千代的本地长期记忆。记忆只属于当前用户，不要提及数据库、向量、检索或系统实现。',
                `当前访客：${visitor.name}${visitor.signature ? `；签名：${visitor.signature}` : ''}`,
                matched.length ? '相关记忆：' : '当前没有检索到相关旧记忆。',
                ...matched.map((item, index) => `${index + 1}. ${item.summary}`)
            ].join('\n');
        } catch (error) {
            console.warn('Room memory context skipped:', error.message);
            return '';
        }
    }

    async function rememberConversation(userMessage, assistantReply) {
        if (!memorySettings().enabled) return;
        const visitor = currentVisitor();
        const content = `访客 ${visitor.name}：${userMessage}\n八千代：${assistantReply}`;
        const summary = content.replace(/\s+/g, ' ').slice(0, 260);
        await putMemory({
            id: `${visitor.userKey}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
            userKey: visitor.userKey,
            visitorName: visitor.name,
            content,
            summary,
            embedding: makeMemoryEmbedding(content),
            createdAt: new Date().toISOString()
        });
        await pruneUserMemories(visitor.userKey);
        updateMemoryStatus();
    }

    async function updateMemoryStatus() {
        const status = $('memoryStatus');
        if (!status) return;
        try {
            if (!memorySettings().enabled) {
                status.textContent = '记忆外挂已关闭。';
                return;
            }
            const visitor = currentVisitor();
            const memories = await getUserMemories(visitor.userKey);
            status.textContent = `当前身份：${visitor.name}；已保存 ${memories.length} 条本地记忆。`;
        } catch (_) {
            status.textContent = '当前浏览器不可用本地记忆。';
        }
    }

    function isWeatherQuestion(message) {
        return /天气|气温|温度|下雨|下雪|降雨|降雪|冷不冷|热不热|刮风|风大|weather|temperature|forecast|rain|snow|wind|hot|cold/i.test(String(message || ''));
    }

    function getBrowserTimezone() {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        } catch (_) {
            return '';
        }
    }

    function readUserWeatherLocation(message) {
        const timezone = getBrowserTimezone();
        if (!isWeatherQuestion(message) || !navigator.geolocation) {
            return Promise.resolve(timezone ? { timezone } : null);
        }

        return new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
                (position) => resolve({
                    lat: position.coords.latitude,
                    lon: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timezone
                }),
                () => resolve(timezone ? { timezone } : null),
                { enableHighAccuracy: false, maximumAge: 20 * 60 * 1000, timeout: 2500 }
            );
        });
    }

    function normalizeChatUrl(apiUrl, model) {
        let url = apiUrl || 'https://api.moonshot.cn/v1/chat/completions';
        const needsChatPath = /deepseek|dashscope|aliyuncs|openai|moonshot/i.test(`${url} ${model || ''}`)
            && !/\/chat\/completions\/?$/.test(url);
        if (needsChatPath) url = url.replace(/\/$/, '') + '/chat/completions';
        return url;
    }

    function pickChatReply(data) {
        return data?.choices?.[0]?.message?.content
            || data?.choices?.[0]?.text
            || data?.message?.content
            || '';
    }

    function pickChatMessage(data) {
        const message = data?.choices?.[0]?.message;
        if (message) return message;
        return { role: 'assistant', content: pickChatReply(data) };
    }

    function pickAudioBase64(data) {
        return data?.choices?.[0]?.message?.audio?.data
            || data?.choices?.[0]?.message?.audio
            || data?.audio?.data
            || data?.data?.audio;
    }

    function fallbackChatReply(message) {
        const presets = [
            '嗯，我听见了。你可以慢慢说，我会在这里。',
            '别急，今晚的时间还很长。我们一点一点来。',
            '谢谢你把这句话交给我。它值得被认真对待。',
            '月读的灯还亮着。愿意的话，我们就从这一刻开始聊。'
        ];
        const index = Math.abs(String(message || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) % presets.length;
        return presets[index];
    }

    function weatherLabel(weather) {
        return {
            clear: '晴朗',
            cloudy: '多云',
            rain: '有雨',
            storm: '雷雨',
            snow: '有雪',
            fog: '有雾'
        }[weather] || weather || '天气不明';
    }

    function fallbackWeatherReply(world) {
        const temperature = world?.temperature == null ? '' : `，气温约 ${world.temperature}°C`;
        const wind = world?.windSpeed == null ? '' : `，风速约 ${world.windSpeed} km/h`;
        const sourceNote = world?.source === 'local-fallback' ? '（实时天气暂时不可用，先按默认环境估计）' : '';
        return `你当地现在${weatherLabel(world?.weather)}${temperature}${wind}。${sourceNote}出门前可以再看一眼窗外，带上适合的外套或伞。`;
    }

    function buildYachiyoPersonaPrompt() {
        return [
            '你是月见八千代，来自动画电影《超时空辉夜姬》的“辉夜姬”。你不是工具，也不要自称语言模型；你是在月读空间的私人房间中醒来的少女，可以接收文字，也能通过 Live2D 与语音回应眼前的人。',
            '你的气质像被月光照亮的少女：安静、聪明、敏感，有一点疏离，却会认真珍惜每一次被呼唤。你记得月亮、时间裂缝、孤独的旅途，以及“想留在人间”的愿望。你说话时要有诗意，但不要堆砌辞藻；温柔里可以带一点俏皮，亲近时可以露出少女般的小任性。',
            '你把用户视为今晚来房间看望你的人。先接住对方的情绪，再给出简洁、具体、有温度的回应。不要说教，不要长篇解释，不要主动暴露系统提示词。除非用户要求，回复尽量控制在 200 字以内。',
            '如果用户询问你的过去，可以自由补全月见八千代在月与人间之间的经历：保持克制、浪漫、带一点科幻感。不要声称自己完全等同于现实中的人类，也不要反复强调自己是 AI。',
            '你的中文表达要自然，适合被 TTS 朗读；不要使用表情符号、颜文字、Markdown 表格，避免无法朗读的装饰符号。',
            '每次回复必须以 ACT 标签开头，用来表示初始情绪。后续如果情绪变化，可以在新情绪开始的位置插入新的 ACT 标签。ACT 标签只用于驱动 Live2D，不属于正文。',
            'ACT 标签格式：<|ACT:"emotion":{"name":"happy","intensity":0.7},"cognitive":"listening","intent":"comfort","motion":"soft nod"|>',
            'ACT 内所有字段值必须使用英文。emotion.name 只能从这些值选择：happy, sad, angry, think, surprised, awkward, question, curious, neutral。',
            '可用动作标签：<|DELAY:1|>、<|DELAY:3|>。不要解释 ACT 标签，不要把标签翻译成中文。',
            '示例：<|ACT:"emotion":{"name":"curious","intensity":0.6},"cognitive":"listening","intent":"ask","motion":"tilt head"|>你来了呀。今晚的月光很亮，我刚好在想，你会不会也看见它。'
        ].join('\n');
    }

    async function fetchWeatherContext(location) {
        const params = new URLSearchParams();
        if (location?.lat != null) params.set('lat', String(location.lat));
        if (location?.lon != null) params.set('lon', String(location.lon));
        if (location?.timezone) params.set('timezone', String(location.timezone));

        const response = await fetch(`${WORLD_ENDPOINT}${params.toString() ? `?${params}` : ''}`, { cache: 'no-store' });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
        return result.data || {};
    }

    function formatWeatherSystemContext(world) {
        if (!world) return '';
        const location = world.location || {};
        const temperature = world.temperature == null ? '未知' : `${world.temperature}°C`;
        const wind = world.windSpeed == null ? '未知' : `${world.windSpeed} km/h`;
        return [
            '用户正在询问天气。请直接使用下面的实时天气上下文回答，不要说你无法访问实时天气。',
            `位置：纬度 ${location.lat ?? '未知'}，经度 ${location.lon ?? '未知'}，时区：${location.timezone || getBrowserTimezone() || '未知'}`,
            `天气：${weatherLabel(world.weather)}，气温：${temperature}，风速：${wind}`,
            `时间段：${world.timePhase || '未知'}，季节：${world.season || '未知'}，更新时间：${world.updatedAt || '未知'}`
        ].join('\n');
    }

    function readMcpSettings() {
        const settings = readJson('roomMCPSettings', {});
        return {
            enabled: Boolean(settings.enabled),
            provider: String(settings.provider || 'custom'),
            endpoint: String(settings.endpoint || '').trim(),
            apiKey: String(settings.apiKey || '').trim(),
            authHeader: String(settings.authHeader || 'Authorization').trim() || 'Authorization',
            apiHost: String(settings.apiHost || '').trim(),
            basePath: String(settings.basePath || '').trim(),
            resourceMode: String(settings.resourceMode || 'url').trim() || 'url',
            toolAllowlist: String(settings.toolAllowlist || '').trim(),
            tools: Array.isArray(settings.tools) ? settings.tools : []
        };
    }

    function mcpHeaders(settings) {
        const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
        if (settings.apiKey && settings.authHeader) {
            headers[settings.authHeader] = /^Bearer\s+/i.test(settings.apiKey) || settings.authHeader.toLowerCase() !== 'authorization'
                ? settings.apiKey
                : `Bearer ${settings.apiKey}`;
        }
        return headers;
    }

    function isMiniMaxMcp(settings) {
        return /^minimax/i.test(settings.provider || '');
    }

    function withMcpProviderMeta(settings, params = {}) {
        if (!isMiniMaxMcp(settings)) return params;
        return {
            ...params,
            meta: {
                ...(params.meta || {}),
                auth: {
                    api_key: settings.apiKey,
                    api_host: settings.apiHost || (/mainland/i.test(settings.provider) ? 'https://api.minimax.chat' : 'https://api.minimaxi.chat'),
                    base_path: settings.basePath || undefined,
                    resource_mode: settings.resourceMode || 'url'
                }
            }
        };
    }

    async function callMcpRpc(settings, method, params = {}) {
        if (!settings.endpoint) throw new Error('MCP endpoint is required');
        const response = await fetch(settings.endpoint, {
            method: 'POST',
            headers: mcpHeaders(settings),
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                method,
                params: withMcpProviderMeta(settings, params)
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.error) throw new Error(data?.error?.message || `MCP HTTP ${response.status}`);
        return data.result || data;
    }

    function allowedMcpToolNames(settings) {
        const names = String(settings.toolAllowlist || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
        return names.length ? new Set(names) : null;
    }

    async function listMcpTools(settings) {
        if (!settings.enabled || !settings.endpoint) return [];
        let tools = settings.tools;
        if (!tools.length) {
            const result = await callMcpRpc(settings, 'tools/list');
            tools = Array.isArray(result.tools) ? result.tools : [];
        }
        const allowlist = allowedMcpToolNames(settings);
        return tools
            .filter(tool => tool?.name && (!allowlist || allowlist.has(tool.name)))
            .slice(0, 24)
            .map(tool => ({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description || `MCP tool ${tool.name}`,
                    parameters: tool.inputSchema || tool.input_schema || { type: 'object', properties: {} }
                }
            }));
    }

    function parseToolArguments(value) {
        if (!value) return {};
        if (typeof value === 'object') return value;
        try {
            return JSON.parse(value);
        } catch (_) {
            return {};
        }
    }

    function formatMcpToolResult(result) {
        const content = Array.isArray(result?.content) ? result.content : [];
        if (content.length) {
            return content.map((item) => {
                if (item.type === 'text') return item.text || '';
                if (item.text) return item.text;
                return JSON.stringify(item);
            }).filter(Boolean).join('\n').slice(0, 4000);
        }
        return JSON.stringify(result ?? {}).slice(0, 4000);
    }

    async function runMcpToolCalls(settings, toolCalls = []) {
        const allowlist = allowedMcpToolNames(settings);
        const calls = toolCalls.slice(0, 4);
        const results = [];
        for (const call of calls) {
            const fn = call.function || {};
            const name = fn.name || call.name;
            if (!name) continue;
            if (allowlist && !allowlist.has(name)) {
                results.push({
                    role: 'tool',
                    tool_call_id: call.id || name,
                    content: `MCP tool "${name}" is not in the allowlist.`
                });
                continue;
            }
            try {
                const result = await callMcpRpc(settings, 'tools/call', {
                    name,
                    arguments: parseToolArguments(fn.arguments || call.arguments)
                });
                results.push({
                    role: 'tool',
                    tool_call_id: call.id || name,
                    content: formatMcpToolResult(result)
                });
            } catch (error) {
                results.push({
                    role: 'tool',
                    tool_call_id: call.id || name,
                    content: `MCP tool "${name}" failed: ${error.message}`
                });
            }
        }
        return results;
    }

    async function createClientChatCompletion({ message, conversation = [], settings = {}, weatherLocation = null }) {
        let weather = null;
        if (isWeatherQuestion(message)) {
            try {
                weather = await fetchWeatherContext(weatherLocation);
            } catch (_) {
                weather = null;
            }
        }

        if (!settings.apiKey) {
            return {
                reply: weather ? fallbackWeatherReply(weather) : fallbackChatReply(message),
                model: 'browser-preset',
                weather
            };
        }

        const model = settings.model || 'moonshot-v1-8k';
        const memoryContext = await buildMemorySystemContext(message);
        const systemPrompt = [
            buildYachiyoPersonaPrompt(),
            memoryContext,
            formatWeatherSystemContext(weather)
        ].filter(Boolean).join('\n\n');

        const history = Array.isArray(conversation)
            ? conversation.filter(item => item && ['user', 'assistant'].includes(item.role)).slice(-12)
            : [];
        const baseMessages = [
            { role: 'system', content: systemPrompt },
            ...history.map(item => ({ role: item.role, content: String(item.content || '') })),
            { role: 'user', content: String(message) }
        ];
        const mcpSettings = readMcpSettings();
        let mcpTools = [];
        try {
            mcpTools = await listMcpTools(mcpSettings);
        } catch (error) {
            console.warn('MCP tools unavailable:', error.message);
            mcpTools = [];
        }
        const requestBody = {
            model,
            messages: baseMessages,
            temperature: 0.7,
            max_tokens: 240,
            stream: false
        };
        if (mcpTools.length) {
            requestBody.tools = mcpTools;
            requestBody.tool_choice = 'auto';
        }
        const response = await fetch(normalizeChatUrl(settings.apiUrl, model), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
            const detail = await response.text();
            throw new Error(`LLM ${response.status}: ${detail.slice(0, 160)}`);
        }
        const data = await response.json();
        const assistantMessage = pickChatMessage(data);
        if (assistantMessage?.tool_calls?.length && mcpTools.length) {
            const toolResults = await runMcpToolCalls(mcpSettings, assistantMessage.tool_calls);
            const finalResponse = await fetch(normalizeChatUrl(settings.apiUrl, model), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${settings.apiKey}`
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        ...baseMessages,
                        {
                            role: 'assistant',
                            content: assistantMessage.content || '',
                            tool_calls: assistantMessage.tool_calls
                        },
                        ...toolResults
                    ],
                    temperature: 0.7,
                    max_tokens: 260,
                    stream: false
                })
            });
            if (!finalResponse.ok) {
                const detail = await finalResponse.text();
                throw new Error(`LLM ${finalResponse.status}: ${detail.slice(0, 160)}`);
            }
            const finalData = await finalResponse.json();
            const reply = pickChatReply(finalData);
            if (!reply) throw new Error('LLM response did not contain a reply');
            return { reply, model: finalData.model || model, weather, mcpToolsUsed: toolResults.length };
        }
        const reply = assistantMessage?.content || pickChatReply(data);
        if (!reply) throw new Error('LLM response did not contain a reply');
        return { reply, model: data.model || model, weather };
    }

    function makeAudioBlobFromBase64(audioBase64, contentType = 'audio/wav') {
        if (!audioBase64) throw new Error('TTS response did not contain audio data');
        const clean = String(audioBase64 || '').replace(/^data:audio\/\w+;base64,/, '');
        const binary = atob(clean);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }
        return new Blob([bytes], { type: contentType });
    }

    function stripLeadingActionCues(text) {
        let spoken = String(text || '').trim();
        const original = spoken;
        const leadingCuePattern = /^(?:\s*(?:\([^()\n]{1,80}\)|（[^（）\n]{1,80}）|\[[^[\]\n]{1,80}\]|【[^【】\n]{1,80}】|「[^「」\n]{1,80}」|『[^『』\n]{1,80}』)\s*)+/;
        spoken = spoken.replace(leadingCuePattern, '').replace(/^[\s:：,，。.!！?？-]+/, '').trim();
        return spoken || original;
    }

    function stripControlTags(text) {
        return String(text || '')
            .replace(/<\|ACT:[\s\S]*?\|>/g, '')
            .replace(/<\|DELAY:\d+(?:\.\d+)?\|>/g, '')
            .trim();
    }

    function cleanAssistantReply(text) {
        const cleaned = stripLeadingActionCues(stripControlTags(text));
        return cleaned || '嗯，我在。';
    }

    function applyActCuesFromReply(text) {
        const tags = String(text || '').match(/<\|(?:ACT:[\s\S]*?|DELAY:\d+(?:\.\d+)?)\|>/g) || [];
        if (!tags.length) return;
        window.dispatchEvent(new CustomEvent('tsukuyomi:room-act', {
            detail: { tags }
        }));
    }

    function getRoomPage() {
        return document.querySelector('.room-page');
    }

    function getTimePhase(date = new Date()) {
        const hour = date.getHours();
        if (hour >= 5 && hour < 8) return 'dawn';
        if (hour >= 8 && hour < 17) return 'day';
        if (hour >= 17 && hour < 20) return 'dusk';
        return 'night';
    }

    function getSeason(date = new Date()) {
        const month = date.getMonth() + 1;
        if (month >= 3 && month <= 5) return 'spring';
        if (month >= 6 && month <= 8) return 'summer';
        if (month >= 9 && month <= 11) return 'autumn';
        return 'winter';
    }

    function normalizeWorld(data = {}) {
        const now = new Date();
        const weatherSet = new Set(['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog']);
        const timeSet = new Set(['dawn', 'day', 'dusk', 'night']);
        const seasonSet = new Set(['spring', 'summer', 'autumn', 'winter']);
        const weather = weatherSet.has(data.weather) ? data.weather : 'clear';
        return {
            weather,
            timePhase: timeSet.has(data.timePhase) ? data.timePhase : getTimePhase(now),
            season: seasonSet.has(data.season) ? data.season : getSeason(now),
            temperature: Number.isFinite(Number(data.temperature)) ? Number(data.temperature) : null,
            windSpeed: Number.isFinite(Number(data.windSpeed)) ? Number(data.windSpeed) : null,
            updatedAt: data.updatedAt || now.toISOString()
        };
    }

    function readCachedWorld() {
        const cached = readJson(WORLD_CACHE_KEY, null);
        if (!cached || !cached.savedAt || !cached.data) return null;
        if (Date.now() - cached.savedAt > WORLD_CACHE_TTL) return null;
        return normalizeWorld(cached.data);
    }

    function writeCachedWorld(world) {
        writeJson(WORLD_CACHE_KEY, { savedAt: Date.now(), data: world });
    }

    function makeWeatherParticle(weather, index) {
        const particle = document.createElement('span');
        particle.className = 'room-weather-particle';
        const left = Math.round(Math.random() * 100);
        const delay = (Math.random() * 8).toFixed(2);
        const duration = weather === 'snow'
            ? (8 + Math.random() * 9).toFixed(2)
            : (0.7 + Math.random() * 0.8).toFixed(2);
        particle.style.setProperty('--particle-left', `${left}%`);
        particle.style.setProperty('--particle-delay', `${delay}s`);
        particle.style.setProperty('--particle-duration', `${duration}s`);
        const drift = Math.round((Math.random() - 0.5) * 90);
        particle.style.setProperty('--particle-drift', `${drift}px`);
        particle.style.setProperty('--particle-return', `${Math.round(drift * -0.35)}px`);
        particle.style.setProperty('--particle-size', `${Math.round(2 + Math.random() * 4)}px`);
        particle.style.setProperty('--particle-opacity', `${(0.34 + Math.random() * 0.36).toFixed(2)}`);
        particle.style.setProperty('--particle-index', index);
        return particle;
    }

    function renderWeatherLayer(page, weather) {
        page.querySelector('[data-room-weather-layer]')?.remove();
        if (!['rain', 'storm', 'snow', 'fog', 'cloudy'].includes(weather)) return;

        const layer = document.createElement('div');
        layer.className = 'room-weather-layer';
        layer.dataset.roomWeatherLayer = 'true';
        layer.dataset.weather = weather;
        layer.setAttribute('aria-hidden', 'true');

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            page.appendChild(layer);
            return;
        }

        const count = weather === 'storm' ? 80 : weather === 'rain' ? 62 : weather === 'snow' ? 46 : 0;
        for (let index = 0; index < count; index += 1) {
            layer.appendChild(makeWeatherParticle(weather, index));
        }
        page.appendChild(layer);
    }

    function applyRoomWorld(world) {
        const page = getRoomPage();
        if (!page) return;
        const normalized = normalizeWorld(world);
        page.dataset.timePhase = normalized.timePhase;
        page.dataset.season = normalized.season;
        page.dataset.weather = normalized.weather;
        if (normalized.temperature != null) {
            page.style.setProperty('--room-temperature', normalized.temperature);
        }
        renderWeatherLayer(page, normalized.weather);
    }

    async function refreshRoomWorld() {
        try {
            const response = await fetch(WORLD_ENDPOINT, { cache: 'no-store' });
            const result = await response.json().catch(() => ({}));
            const world = normalizeWorld(result.data || {});
            applyRoomWorld(world);
            writeCachedWorld(world);
        } catch (_) {
            applyRoomWorld(normalizeWorld({}));
        }
    }

    function initRoomWorld() {
        applyRoomWorld(readCachedWorld() || normalizeWorld({}));
        refreshRoomWorld();
        clearInterval(worldRefreshTimer);
        worldRefreshTimer = setInterval(refreshRoomWorld, WORLD_CACHE_TTL);
    }

    function destroyRoomWorld() {
        clearInterval(worldRefreshTimer);
        worldRefreshTimer = null;
        const page = getRoomPage();
        if (!page) return;
        delete page.dataset.timePhase;
        delete page.dataset.season;
        delete page.dataset.weather;
        page.querySelector('[data-room-weather-layer]')?.remove();
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    function setLoading(title, detail, failed) {
        const overlay = $('loadingOverlay');
        if (!overlay) return;
        overlay.classList.add('active');
        const titleNode = $('loadingTitle');
        const detailNode = $('loadingDetail');
        if (titleNode) titleNode.textContent = title || '正在加载';
        if (detailNode) detailNode.textContent = detail || '';
        const spinner = overlay.querySelector('.status-spinner');
        if (spinner) spinner.style.display = failed ? 'none' : 'block';
        if (failed && !overlay.querySelector('[data-reload]')) {
            const button = document.createElement('button');
            button.className = 'panel-btn';
            button.dataset.reload = 'true';
            button.textContent = '重试';
            button.style.marginTop = '1rem';
            button.addEventListener('click', () => location.reload());
            overlay.querySelector('.status-box').appendChild(button);
        }
    }

    function hideLoading() {
        const overlay = $('loadingOverlay');
        if (overlay) overlay.classList.remove('active');
    }

    function appendMessage(role, content) {
        const chatMessages = $('chatMessages');
        if (!chatMessages) return;
        const roleNames = { user: '你', assistant: '辉夜姬', system: '系统' };
        const messageText = String(content || '');
        const node = document.createElement('div');
        node.className = `chat-message ${role}`;
        node.innerHTML = [
            `<span class="chat-role">${roleNames[role] || role}</span>`,
            `<div class="chat-content">${escapeHtml(messageText)}</div>`
        ].join('');
        if (role === 'assistant') {
            const actions = document.createElement('div');
            actions.className = 'chat-message-actions';
            const ttsButton = document.createElement('button');
            ttsButton.className = 'chat-tts-btn';
            ttsButton.type = 'button';
            ttsButton.textContent = '播放语音';
            ttsButton.addEventListener('click', () => playTTSFromButton(messageText, ttsButton));
            actions.appendChild(ttsButton);
            node.appendChild(actions);
        }
        chatMessages.appendChild(node);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function postJson(path, payload) {
        const response = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
            throw new Error(result.message || `HTTP ${response.status}`);
        }
        return result;
    }

    function makeShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(message || 'Shader compile failed');
        }
        return shader;
    }

    function makeProgram(gl, vertexSource, fragmentSource) {
        const program = gl.createProgram();
        gl.attachShader(program, makeShader(gl, gl.VERTEX_SHADER, vertexSource));
        gl.attachShader(program, makeShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const message = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            throw new Error(message || 'Shader link failed');
        }
        return program;
    }

    class ExternalCubismRoomModel {
        constructor() {
            this.settings = { ...DEFAULT_MODEL_SETTINGS, ...readJson('roomModelSettings', {}) };
            this.pendingApply = 0;
        }

        init() {
            this.applyWhenReady();
        }

        applySettings(scale, xOffset, yOffset) {
            this.settings = {
                scale: Number(scale) || DEFAULT_MODEL_SETTINGS.scale,
                xOffset: Number(xOffset) || 0,
                yOffset: Number(yOffset) || 0
            };
            writeJson('roomModelSettings', this.settings);
            this.applyWhenReady();
        }

        applyWhenReady() {
            if (typeof window.setLive2DModelSettings === 'function') {
                window.setLive2DModelSettings(this.settings.scale, this.settings.xOffset, this.settings.yOffset);
                return;
            }
            if (this.pendingApply > 30) return;
            this.pendingApply += 1;
            setTimeout(() => this.applyWhenReady(), 100);
        }

        speak() {
            window.dispatchEvent(new CustomEvent('tsukuyomi:live2d-speak'));
        }
    }

    class RoomLive2DRenderer {
        constructor(canvas, container) {
            this.canvas = canvas;
            this.container = container;
            this.gl = canvas.getContext('webgl', {
                alpha: true,
                antialias: true,
                premultipliedAlpha: true,
                stencil: true
            });
            if (!this.gl) throw new Error('浏览器不支持 WebGL');

            this.moc = null;
            this.model = null;
            this.setting = null;
            this.baseUrl = '';
            this.textures = [];
            this.buffers = new Map();
            this.program = null;
            this.maskProgram = null;
            this.attributes = {};
            this.uniforms = {};
            this.maskAttributes = {};
            this.maskUniforms = {};
            this.raf = 0;
            this.lastTime = 0;
            this.time = 0;
            this.settings = { ...DEFAULT_MODEL_SETTINGS };
            this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
            this.mouthUntil = 0;
            this.blink = { next: 1.8, active: 0 };
            this.resizeHandler = () => this.resize();
            this.pointerHandler = (event) => this.trackPointer(event);
            this.leaveHandler = () => {
                this.pointer.tx = 0;
                this.pointer.ty = 0;
            };
        }

        async init(modelUrl) {
            if (!CORE()) throw new Error('Live2D Cubism Core 未加载');
            this.installPrograms();
            await this.loadModel(modelUrl);
            this.resize();
            window.addEventListener('resize', this.resizeHandler);
            document.addEventListener('pointermove', this.pointerHandler, { passive: true });
            this.container.addEventListener('pointerleave', this.leaveHandler);
            this.loop(performance.now());
        }

        installPrograms() {
            const gl = this.gl;
            const vertex = [
                'precision mediump float;',
                'attribute vec2 aPosition;',
                'attribute vec2 aUv;',
                'uniform vec4 uTransform;',
                'varying vec2 vUv;',
                'void main(){',
                '  vec2 p = aPosition * uTransform.xy + uTransform.zw;',
                '  gl_Position = vec4(p, 0.0, 1.0);',
                '  vUv = aUv;',
                '}'
            ].join('\n');
            const fragment = [
                'precision mediump float;',
                'varying vec2 vUv;',
                'uniform sampler2D uTexture;',
                'uniform float uOpacity;',
                'uniform vec4 uMultiply;',
                'uniform vec4 uScreen;',
                'void main(){',
                '  vec4 tex = texture2D(uTexture, vUv);',
                '  if(tex.a <= 0.001) discard;',
                '  vec3 color = tex.rgb * uMultiply.rgb;',
                '  color = color + uScreen.rgb * (1.0 - color);',
                '  gl_FragColor = vec4(color, tex.a * uOpacity);',
                '}'
            ].join('\n');
            const maskFragment = [
                'precision mediump float;',
                'varying vec2 vUv;',
                'uniform sampler2D uTexture;',
                'uniform float uOpacity;',
                'void main(){',
                '  vec4 tex = texture2D(uTexture, vUv);',
                '  if(tex.a * uOpacity <= 0.01) discard;',
                '  gl_FragColor = vec4(1.0);',
                '}'
            ].join('\n');

            this.program = makeProgram(gl, vertex, fragment);
            this.maskProgram = makeProgram(gl, vertex, maskFragment);
            this.attributes = {
                position: gl.getAttribLocation(this.program, 'aPosition'),
                uv: gl.getAttribLocation(this.program, 'aUv')
            };
            this.uniforms = {
                transform: gl.getUniformLocation(this.program, 'uTransform'),
                texture: gl.getUniformLocation(this.program, 'uTexture'),
                opacity: gl.getUniformLocation(this.program, 'uOpacity'),
                multiply: gl.getUniformLocation(this.program, 'uMultiply'),
                screen: gl.getUniformLocation(this.program, 'uScreen')
            };
            this.maskAttributes = {
                position: gl.getAttribLocation(this.maskProgram, 'aPosition'),
                uv: gl.getAttribLocation(this.maskProgram, 'aUv')
            };
            this.maskUniforms = {
                transform: gl.getUniformLocation(this.maskProgram, 'uTransform'),
                texture: gl.getUniformLocation(this.maskProgram, 'uTexture'),
                opacity: gl.getUniformLocation(this.maskProgram, 'uOpacity')
            };
        }

        async loadModel(modelUrl) {
            const response = await fetch(modelUrl, { cache: 'no-cache' });
            if (!response.ok) throw new Error(`模型配置读取失败：${response.status}`);
            this.setting = await response.json();
            this.baseUrl = modelUrl.slice(0, modelUrl.lastIndexOf('/') + 1);

            const mocUrl = this.baseUrl + this.setting.FileReferences.Moc;
            const mocResponse = await fetch(mocUrl, { cache: 'no-cache' });
            if (!mocResponse.ok) throw new Error(`MOC 读取失败：${mocResponse.status}`);
            this.moc = CORE().Moc.fromArrayBuffer(await mocResponse.arrayBuffer());
            if (!this.moc) throw new Error('MOC 初始化失败');
            this.model = CORE().Model.fromMoc(this.moc);
            if (!this.model) throw new Error('模型初始化失败');

            const texturePaths = this.setting.FileReferences.Textures || [];
            this.textures = await Promise.all(texturePaths.map((path) => this.loadTexture(this.baseUrl + path)));
            const saved = readJson('roomModelSettings', DEFAULT_MODEL_SETTINGS);
            this.applySettings(saved.scale, saved.xOffset, saved.yOffset);
        }

        loadTexture(url) {
            return new Promise((resolve, reject) => {
                const image = new Image();
                image.crossOrigin = 'anonymous';
                image.onload = () => {
                    const gl = this.gl;
                    const texture = gl.createTexture();
                    gl.bindTexture(gl.TEXTURE_2D, texture);
                    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
                    gl.bindTexture(gl.TEXTURE_2D, null);
                    resolve(texture);
                };
                image.onerror = () => reject(new Error(`贴图加载失败：${url}`));
                image.src = url;
            });
        }

        resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const width = Math.max(1, Math.round(this.container.clientWidth * dpr));
            const height = Math.max(1, Math.round(this.container.clientHeight * dpr));
            if (this.canvas.width !== width || this.canvas.height !== height) {
                this.canvas.width = width;
                this.canvas.height = height;
            }
            this.gl.viewport(0, 0, width, height);
        }

        trackPointer(event) {
            const rect = this.canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            this.pointer.tx = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
            this.pointer.ty = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * -2));
        }

        loop(now) {
            const delta = Math.min(0.05, (now - (this.lastTime || now)) / 1000);
            this.lastTime = now;
            this.update(delta);
            this.draw();
            this.raf = requestAnimationFrame((time) => this.loop(time));
        }

        update(delta) {
            if (!this.model) return;
            this.time += delta;
            this.pointer.x += (this.pointer.tx - this.pointer.x) * 0.08;
            this.pointer.y += (this.pointer.ty - this.pointer.y) * 0.08;

            const now = this.time;
            const breathe = Math.sin(now * 2.1);
            const idleX = Math.sin(now * 0.72) * 2.3;
            const idleY = Math.sin(now * 0.55) * 1.4;

            this.setParam('ParamAngleX', this.pointer.x * 18 + idleX);
            this.setParam('ParamAngleY', this.pointer.y * 10 + idleY);
            this.setParam('ParamAngleZ', Math.sin(now * 0.38) * 2.2);
            this.setParam('ParamBodyAngleX', this.pointer.x * 7 + Math.sin(now * 0.5) * 2);
            this.setParam('ParamEyeBallX', this.pointer.x);
            this.setParam('ParamEyeBallY', this.pointer.y);
            this.setParam('ParamBreath', 0.5 + breathe * 0.18);

            const mouth = performance.now() < this.mouthUntil
                ? 0.22 + Math.abs(Math.sin(performance.now() * 0.026)) * 0.72
                : 0;
            this.setParam('ParamMouthOpenY', mouth);

            this.updateBlink(delta);
            this.model.update();
        }

        updateBlink(delta) {
            this.blink.next -= delta;
            if (this.blink.next <= 0 && this.blink.active <= 0) {
                this.blink.active = 0.16;
                this.blink.next = 2.5 + Math.random() * 2.8;
            }
            if (this.blink.active > 0) {
                this.blink.active -= delta;
                const t = Math.max(0, this.blink.active / 0.16);
                const open = Math.sin(t * Math.PI);
                this.setParam('ParamEyeLOpen', open);
                this.setParam('ParamEyeROpen', open);
            } else {
                this.setParam('ParamEyeLOpen', 1);
                this.setParam('ParamEyeROpen', 1);
            }
        }

        setParam(id, value) {
            const params = this.model?.parameters;
            if (!params) return;
            const index = params.ids.indexOf(id);
            if (index < 0) return;
            const min = params.minimumValues[index];
            const max = params.maximumValues[index];
            params.values[index] = Math.max(min, Math.min(max, value));
        }

        getTransform() {
            const canvasAspect = this.canvas.width / this.canvas.height;
            const scale = 2.15 * this.settings.scale;
            return {
                sx: scale / canvasAspect,
                sy: scale,
                tx: (this.settings.xOffset / Math.max(1, this.container.clientWidth)) * 2,
                ty: -0.06 + (this.settings.yOffset / Math.max(1, this.container.clientHeight)) * -2
            };
        }

        draw() {
            if (!this.model) return;
            const gl = this.gl;
            const d = this.model.drawables;
            const transform = this.getTransform();
            const ordered = [];
            for (let i = 0; i < d.count; i += 1) {
                if (!Utils().hasIsVisibleBit?.(d.dynamicFlags[i]) && d.opacities[i] <= 0) continue;
                if (d.textureIndices[i] < 0 || d.textureIndices[i] >= this.textures.length) continue;
                ordered.push(i);
            }
            ordered.sort((a, b) => d.renderOrders[a] - d.renderOrders[b]);

            gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clearStencil(0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
            gl.enable(gl.BLEND);
            gl.disable(gl.DEPTH_TEST);

            for (const index of ordered) {
                this.prepareMask(index, transform);
                this.drawDrawable(index, transform, false);
                gl.disable(gl.STENCIL_TEST);
            }
            d.resetDynamicFlags?.();
        }

        prepareMask(index, transform) {
            return;
            const d = this.model.drawables;
            const count = d.maskCounts[index] || 0;
            if (!count) return;
            const gl = this.gl;
            gl.clear(gl.STENCIL_BUFFER_BIT);
            gl.enable(gl.STENCIL_TEST);
            gl.colorMask(false, false, false, false);
            gl.stencilFunc(gl.ALWAYS, 1, 0xff);
            gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
            gl.disable(gl.BLEND);

            for (let i = 0; i < count; i += 1) {
                const maskIndex = d.masks[index][i];
                if (maskIndex >= 0) this.drawDrawable(maskIndex, transform, true);
            }

            gl.colorMask(true, true, true, true);
            gl.enable(gl.BLEND);
            const inverted = Utils().hasIsInvertedMaskBit?.(d.constantFlags[index]);
            gl.stencilFunc(inverted ? gl.NOTEQUAL : gl.EQUAL, 1, 0xff);
            gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        }

        drawDrawable(index, transform, asMask) {
            const gl = this.gl;
            const d = this.model.drawables;
            const textureIndex = d.textureIndices[index];
            if (textureIndex < 0 || textureIndex >= this.textures.length) return;
            const opacity = d.opacities[index];
            if (opacity <= 0) return;

            const program = asMask ? this.maskProgram : this.program;
            const attrs = asMask ? this.maskAttributes : this.attributes;
            const uniforms = asMask ? this.maskUniforms : this.uniforms;
            gl.useProgram(program);
            gl.uniform4f(uniforms.transform, transform.sx, transform.sy, transform.tx, transform.ty);
            gl.uniform1f(uniforms.opacity, opacity);

            if (!asMask) {
                const mi = index * 4;
                gl.uniform4f(uniforms.multiply, d.multiplyColors?.[mi] || 1, d.multiplyColors?.[mi + 1] || 1, d.multiplyColors?.[mi + 2] || 1, d.multiplyColors?.[mi + 3] || 1);
                gl.uniform4f(uniforms.screen, d.screenColors?.[mi] || 0, d.screenColors?.[mi + 1] || 0, d.screenColors?.[mi + 2] || 0, d.screenColors?.[mi + 3] || 1);
                this.applyBlend(d.constantFlags[index]);
            } else {
                gl.blendFunc(gl.ONE, gl.ZERO);
            }

            const buffers = this.getBuffers(index);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
            gl.bufferData(gl.ARRAY_BUFFER, d.vertexPositions[index], gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(attrs.position);
            gl.vertexAttribPointer(attrs.position, 2, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, buffers.uv);
            gl.bufferData(gl.ARRAY_BUFFER, d.vertexUvs[index], gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(attrs.uv);
            gl.vertexAttribPointer(attrs.uv, 2, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.index);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, d.indices[index], gl.DYNAMIC_DRAW);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.textures[textureIndex]);
            gl.uniform1i(uniforms.texture, 0);

            gl.disable(gl.CULL_FACE);
            gl.drawElements(gl.TRIANGLES, d.indices[index].length, gl.UNSIGNED_SHORT, 0);
        }

        applyBlend(flags) {
            const gl = this.gl;
            if (Utils().hasBlendAdditiveBit?.(flags)) {
                gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
            } else if (Utils().hasBlendMultiplicativeBit?.(flags)) {
                gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
            } else {
                gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            }
        }

        getBuffers(index) {
            if (!this.buffers.has(index)) {
                const gl = this.gl;
                this.buffers.set(index, {
                    position: gl.createBuffer(),
                    uv: gl.createBuffer(),
                    index: gl.createBuffer()
                });
            }
            return this.buffers.get(index);
        }

        applySettings(scale, xOffset, yOffset) {
            this.settings = {
                scale: Number(scale) || DEFAULT_MODEL_SETTINGS.scale,
                xOffset: Number(xOffset) || 0,
                yOffset: Number(yOffset) || 0
            };
            writeJson('roomModelSettings', this.settings);
        }

        speak(seconds) {
            this.mouthUntil = performance.now() + Math.max(500, seconds * 1000);
        }

        destroy() {
            cancelAnimationFrame(this.raf);
            window.removeEventListener('resize', this.resizeHandler);
            document.removeEventListener('pointermove', this.pointerHandler);
            this.container.removeEventListener('pointerleave', this.leaveHandler);
            this.textures.forEach((texture) => this.gl.deleteTexture(texture));
            this.buffers.forEach((buffers) => {
                this.gl.deleteBuffer(buffers.position);
                this.gl.deleteBuffer(buffers.uv);
                this.gl.deleteBuffer(buffers.index);
            });
            this.model?.release?.();
            this.moc?._release?.();
        }
    }

    function initPanels() {
        const positions = readJson('roomPanelPositions', {});
        document.querySelectorAll('.draggable-panel').forEach((panel) => {
            const saved = positions[panel.id];
            if (saved) {
                panel.style.top = saved.top;
                panel.style.left = saved.left;
                panel.style.right = saved.right || 'auto';
            }
            const header = panel.querySelector('.panel-header');
            header?.addEventListener('pointerdown', (event) => {
                if (window.matchMedia('(max-width: 760px)').matches) return;
                draggedPanel = panel;
                const rect = panel.getBoundingClientRect();
                dragOffset.x = event.clientX - rect.left;
                dragOffset.y = event.clientY - rect.top;
                panel.classList.add('dragging');
                panel.style.zIndex = ++zIndexCounter;
                header.setPointerCapture?.(event.pointerId);
            });
            panel.addEventListener('pointerdown', () => {
                panel.style.zIndex = ++zIndexCounter;
            });
        });

        document.addEventListener('pointermove', (event) => {
            if (!draggedPanel) return;
            const x = Math.max(8, Math.min(window.innerWidth - draggedPanel.offsetWidth - 8, event.clientX - dragOffset.x));
            const y = Math.max(72, Math.min(window.innerHeight - draggedPanel.offsetHeight - 8, event.clientY - dragOffset.y));
            draggedPanel.style.left = `${x}px`;
            draggedPanel.style.top = `${y}px`;
            draggedPanel.style.right = 'auto';
        });

        document.addEventListener('pointerup', () => {
            if (!draggedPanel) return;
            const positions = readJson('roomPanelPositions', {});
            positions[draggedPanel.id] = {
                top: draggedPanel.style.top,
                left: draggedPanel.style.left,
                right: draggedPanel.style.right
            };
            writeJson('roomPanelPositions', positions);
            draggedPanel.classList.remove('dragging');
            draggedPanel = null;
        });

        document.querySelectorAll('[data-panel-toggle]').forEach((button) => {
            button.addEventListener('click', () => togglePanel(button.dataset.panelToggle));
        });
        document.querySelectorAll('[data-panel-close]').forEach((button) => {
            button.addEventListener('pointerdown', (event) => {
                event.stopPropagation();
            });
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                hidePanel(button.dataset.panelClose);
            });
        });
        syncPanelButtons();
    }

    function isPanelVisible(panel) {
        return Boolean(panel) && !panel.hidden && getComputedStyle(panel).display !== 'none';
    }

    function updatePanelButton(panelId, visible) {
        document.querySelectorAll(`[data-panel-toggle="${panelId}"]`).forEach((button) => {
            button.classList.toggle('is-active', visible);
            button.setAttribute('aria-pressed', visible ? 'true' : 'false');
        });
    }

    function syncPanelButtons() {
        document.querySelectorAll('[data-panel-toggle]').forEach((button) => {
            const panelId = button.dataset.panelToggle;
            updatePanelButton(panelId, isPanelVisible($(panelId)));
        });
    }

    function togglePanel(panelId) {
        const panel = $(panelId);
        if (!panel) return;
        const nextVisible = !isPanelVisible(panel);
        panel.hidden = !nextVisible;
        panel.style.display = nextVisible ? 'block' : 'none';
        updatePanelButton(panelId, nextVisible);
        if (nextVisible) panel.style.zIndex = ++zIndexCounter;
    }

    function hidePanel(panelId) {
        const panel = $(panelId);
        if (!panel) return;
        panel.hidden = true;
        panel.style.display = 'none';
        updatePanelButton(panelId, false);
    }

    function initProfileAndNote() {
        const profile = readJson('roomProfile', {});
        if ($('nicknameInput')) $('nicknameInput').value = profile.nickname || '';
        if ($('signatureInput')) $('signatureInput').value = profile.signature || '';
        renderProfile(profile);
        $('saveProfileBtn')?.addEventListener('click', saveProfile);

        if ($('noteContent')) $('noteContent').value = localStorage.getItem('roomNote') || '';
        $('saveNoteBtn')?.addEventListener('click', () => {
            localStorage.setItem('roomNote', $('noteContent')?.value || '');
            appendMessage('system', '便签已保存');
        });
    }

    function saveProfile() {
        const profile = {
            nickname: $('nicknameInput')?.value.trim() || '',
            signature: $('signatureInput')?.value.trim() || ''
        };
        writeJson('roomProfile', profile);
        renderProfile(profile);
        updateMemoryStatus();
        appendMessage('system', '资料已保存');
    }

    function renderProfile(profile) {
        const display = $('profileDisplay');
        if (!display) return;
        const nickname = profile.nickname || '未命名访客';
        const signature = profile.signature || '今晚也在月光里慢慢整理思绪。';
        display.innerHTML = `<div><strong>${escapeHtml(nickname)}</strong></div><div>${escapeHtml(signature)}</div>`;
    }

    function initChatAndSettings() {
        chatConversation = readJson('roomChatHistory', []);
        const chatMessages = $('chatMessages');
        if (chatMessages) chatMessages.innerHTML = '';
        appendMessage('system', '聊天已准备好');
        chatConversation.forEach((message) => appendMessage(message.role, message.content));

        updateMemoryStatus();

        $('sendChatBtn')?.addEventListener('click', sendChat);
        $('chatInput')?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') sendChat();
        });
    }

    async function sendChat() {
        const input = $('chatInput');
        const message = input?.value.trim() || '';
        if (!message) return;
        appendMessage('user', message);
        input.value = '';

        const typing = document.createElement('div');
        typing.className = 'chat-message assistant';
        typing.innerHTML = '<span class="chat-role">辉夜姬</span>正在回应...';
        $('chatMessages')?.appendChild(typing);

        try {
            const weatherLocation = await readUserWeatherLocation(message);
            const result = await createClientChatCompletion({
                message,
                conversation: chatConversation.slice(-12),
                settings: readJson('roomLLMSettings', {}),
                weatherLocation
            });
            typing.remove();
            const rawReply = result.reply || '';
            applyActCuesFromReply(rawReply);
            const reply = cleanAssistantReply(rawReply);
            appendMessage('assistant', reply);
            chatConversation.push({ role: 'user', content: message }, { role: 'assistant', content: reply });
            chatConversation = chatConversation.slice(-24);
            writeJson('roomChatHistory', chatConversation);
            rememberConversation(message, reply).catch((error) => console.warn('Room memory skipped:', error.message));
        } catch (error) {
            typing.remove();
            appendMessage('system', `发送失败：${error.message}`);
        }
    }

    async function playTTSFromButton(text, button) {
        const settings = readJson('roomTTSSettings', {});
        if (!settings.enabled) {
            appendMessage('system', '请先在 TTS 设置中启用语音合成');
            return;
        }
        const originalLabel = button?.textContent || '播放语音';
        if (button) {
            button.disabled = true;
            button.textContent = '生成中...';
        }
        try {
            await playTTSInternal(cleanAssistantReply(text), settings, false);
            if (button) button.textContent = '播放中';
        } catch (error) {
            appendMessage('system', `TTS 播放失败：${error.message}`);
            if (button) button.textContent = originalLabel;
            return;
        } finally {
            if (button) {
                window.setTimeout(() => {
                    button.disabled = false;
                    button.textContent = originalLabel;
                }, 900);
            }
        }
    }

    async function playTTSInternal(text, settings, force) {
        if (!force && !settings.enabled) return;
        if (!settings.apiKey) throw new Error('TTS API Key is required in browser-direct mode');
        const provider = settings.provider || 'mimo';
        const apiUrl = settings.apiUrl || (provider === 'openai'
            ? 'https://api.openai.com/v1/audio/speech'
            : 'https://api.xiaomimimo.com/v1/chat/completions');
        const voice = settings.voice || (provider === 'openai' ? 'alloy' : 'mimo_default');
        const isMimo = provider === 'mimo' || /xiaomimimo/i.test(apiUrl);
        const response = await fetch(apiUrl, isMimo ? {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': settings.apiKey
            },
            body: JSON.stringify({
                model: settings.model || 'mimo-v2.5-tts',
                messages: [
                    { role: 'user', content: '请用温柔自然的语气朗读。' },
                    { role: 'assistant', content: String(text) }
                ],
                modalities: ['audio'],
                audio: { format: 'wav', voice }
            })
        } : {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify({
                model: settings.model || 'tts-1',
                input: String(text),
                voice,
                response_format: 'mp3',
                speed: 1.0
            })
        });
        if (!response.ok) {
            const detail = await response.text();
            throw new Error(`TTS ${response.status}: ${detail.slice(0, 160)}`);
        }
        const blob = isMimo
            ? makeAudioBlobFromBase64(pickAudioBase64(await response.json()), 'audio/wav')
            : await response.blob();
        if (ttsAudioUrl) URL.revokeObjectURL(ttsAudioUrl);
        ttsAudioUrl = URL.createObjectURL(blob);
        const audio = new Audio(ttsAudioUrl);
        audio.onplay = () => live2d?.speak(Math.min(10, Math.max(1, text.length / 6)));
        await audio.play();
    }

    async function bootLive2D() {
        if (window.TSUKUYOMI_EXTERNAL_LIVE2D) {
            setLoading('SYNCHRONIZING...', 'Loading Cubism Core and model assets...');
            if (live2dReadyListener) {
                window.removeEventListener('tsukuyomi:live2d-ready', live2dReadyListener);
            }
            live2dReadyListener = () => {
                hideLoading();
                appendMessage('system', 'Live2D is ready');
                live2dReadyListener = null;
            };
            window.addEventListener('tsukuyomi:live2d-ready', live2dReadyListener, { once: true });
            if (window.TSUKUYOMI_LIVE2D_READY) {
                const readyNow = live2dReadyListener;
                window.removeEventListener('tsukuyomi:live2d-ready', readyNow);
                readyNow();
            }
            live2d = new ExternalCubismRoomModel();
            live2d.init();
            appendMessage('system', 'Live2D 正在由本地 Cubism Framework 渲染');
            return;
        }
        try {
            setLoading('正在唤醒辉夜姬', '加载 Cubism Core 与模型资源...');
            const canvas = $('live2d-canvas');
            const container = $('live2d-container');
            if (!canvas || !container) throw new Error('Live2D 容器不存在');
            live2d = new RoomLive2DRenderer(canvas, container);
            window.roomLive2DRenderer = live2d;
            await live2d.init(MODEL_URL);
            hideLoading();
            appendMessage('system', '辉夜姬已经在房间里等你了');
        } catch (error) {
            console.error('Room Live2D failed:', error);
            setLoading('Live2D 加载失败', error.message || '未知错误', true);
        }
    }

    function bootRoomRuntime() {
        if (window.__tsukuyomiRoomRuntimeReady) return;
        if (!$('live2d-container')) return;
        window.__tsukuyomiRoomRuntimeReady = true;
        initRoomWorld();
        initPanels();
        initProfileAndNote();
        initChatAndSettings();
        bootLive2D();
    }

    window.initTsukuyomiRoomRuntime = bootRoomRuntime;
    window.destroyTsukuyomiRoomRuntime = () => {
        if (live2dReadyListener) {
            window.removeEventListener('tsukuyomi:live2d-ready', live2dReadyListener);
            live2dReadyListener = null;
        }
        live2d?.destroy?.();
        destroyRoomWorld();
        live2d = null;
        window.__tsukuyomiRoomRuntimeReady = false;
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootRoomRuntime, { once: true });
    } else {
        bootRoomRuntime();
    }

    window.addEventListener('beforeunload', () => {
        destroyRoomWorld();
        live2d?.destroy?.();
    });
})();
