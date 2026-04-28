(function () {
    'use strict';

    const MODEL_CANDIDATES = [
        '/models/tsukimi-yachiyo/tsukimi-yachiyo.model3.json',
        '/models/【雪熊企划】八千代辉夜姬/八千代辉夜姬.model3.json'
    ];
    const CHAT_ENDPOINT = '/api/room/chat';
    const TTS_ENDPOINT = '/api/room/tts';

    let chatConversation = [];
    let ttsAudioUrl = null;
    let live2d = null;
    let live2dStarted = false;

    function $(id) {
        return document.getElementById(id);
    }

    function readJson(key, fallback) {
        try {
            return JSON.parse(localStorage.getItem(key)) || fallback;
        } catch (_) {
            return fallback;
        }
    }

    function writeJson(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    function appendMessage(role, content) {
        const chatMessages = $('chatMessages');
        if (!chatMessages) return;
        const msgDiv = document.createElement('div');
        const roleNames = { user: '你', assistant: '辉夜姬', system: '系统' };
        msgDiv.className = `chat-message ${role}`;
        msgDiv.innerHTML = `<strong>${roleNames[role] || role}:</strong><br>${escapeHtml(content)}`;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function setLoading(message, failed) {
        const overlay = $('loadingOverlay');
        if (!overlay) return;
        overlay.style.display = 'flex';
        overlay.innerHTML = [
            '<div style="color: var(--sakura-pink); text-align: center; max-width: 520px; padding: 2rem;">',
            `<div style="font-size: 1.1rem; margin-bottom: 0.8rem;">${failed ? 'Live2D 加载失败' : '正在唤醒辉夜姬'}</div>`,
            `<div style="font-size: 0.85rem; opacity: 0.75;">${escapeHtml(message)}</div>`,
            failed ? '<button class="panel-btn" onclick="location.reload()" style="margin-top: 1rem;">重试</button>' : '',
            '</div>'
        ].join('');
    }

    function hideLoading() {
        const overlay = $('loadingOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    class PixiLive2DRoom {
        constructor(canvas, container) {
            this.canvas = canvas;
            this.container = container;
            this.app = null;
            this.model = null;
            this.modelUrl = '';
            this.modelTextures = [];
            this.toneFilter = null;
            this.focusX = 0;
            this.focusY = 0;
            this.currentFocusX = 0;
            this.currentFocusY = 0;
            this.focusTicker = null;
            this.pointerFocusHandler = null;
            this.scaleSetting = 0.13;
            this.xOffset = 0;
            this.yOffset = 0;
            this.mouthUntil = 0;
            this.mouthTicker = null;
        }

        async init() {
            if (!window.PIXI) throw new Error('PIXI 未加载');
            if (!window.PIXI.live2d || !window.PIXI.live2d.Live2DModel) throw new Error('Cubism5 Live2D 运行时未加载');
            if (!window.Live2DCubismCore) throw new Error('Live2DCubismCore 未加载');

            window.PIXI.settings.PREFER_ENV = window.PIXI.ENV.WEBGL2;
            this.installAssetProgress();
            this.createApp();
            await this.resolveModelAssets();

            const Live2DModel = window.PIXI.live2d.Live2DModel;
            this.model = Live2DModel.fromSync(this.modelUrl, {
                autoInteract: false,
                autoUpdate: true,
                ticker: this.app.ticker,
                motionPreload: window.PIXI.live2d.MotionPreloadStrategy?.NONE
            });
            await this.waitForInternalModel();
            this.normalizeDrawableColors();
            this.applyToneMapping();

            this.model.pivot.set(this.model.internalModel.width / 2, this.model.internalModel.height / 2);
            this.model.setRenderer(this.app.renderer);
            await this.patchPixi7TextureExtractor();
            this.model._render = this.model.onRender;
            this.model.interactive = true;
            this.app.stage.addChild(this.model);

            const saved = readJson('roomModelSettings', null);
            if (saved) {
                this.applySettings(saved.scale, saved.xOffset, saved.yOffset);
                this.syncControls(saved);
            } else {
                this.applySettings(0.13, 0, 0);
            }

            this.installResize();
            this.removeIdleEyeMotionConflicts();
            this.installPointerFocus();
            this.installTapExpression();
            this.installLipSyncTicker();
            this.installFocusTicker();
            this.layout();
        }

        createApp() {
            const options = {
                view: this.canvas,
                backgroundAlpha: 0,
                antialias: true,
                autoDensity: true,
                resolution: Math.min(window.devicePixelRatio || 1, 2)
            };
            this.app = new window.PIXI.Application(options);
            this.resizeRenderer();
        }

        async resolveModelAssets() {
            for (const url of MODEL_CANDIDATES) {
                try {
                    const response = await fetch(url, { cache: 'no-cache' });
                    if (!response.ok) continue;
                    const json = await response.json();
                    const base = url.slice(0, url.lastIndexOf('/') + 1);
                    this.modelUrl = url;
                    this.modelTextures = (json.FileReferences?.Textures || []).map((texture) => base + texture);
                    if (this.modelTextures.length) return;
                } catch (_) {}
            }
            throw new Error('没有找到可用的 Live2D 模型配置');
        }

        waitForInternalModel() {
            return new Promise((resolve, reject) => {
                const startedAt = performance.now();
                const timer = setInterval(() => {
                    if (this.model.internalModel) {
                        clearInterval(timer);
                        resolve();
                    } else if (performance.now() - startedAt > 20000) {
                        clearInterval(timer);
                        reject(new Error('模型核心加载超时'));
                    }
                }, 50);
            });
        }

        normalizeDrawableColors() {
            const coreModel = this.model?.internalModel?.coreModel;
            const drawableCount = coreModel?.getDrawableCount?.() || 0;
            if (!drawableCount) return;
            coreModel.setOverrideFlagForModelMultiplyColors?.(true);
            coreModel.setOverrideFlagForModelScreenColors?.(true);
            for (let i = 0; i < drawableCount; i += 1) {
                coreModel.setMultiplyColor?.(i, 1, 1, 1, 1);
                coreModel.setScreenColor?.(i, 0, 0, 0, 1);
            }
        }

        applyToneMapping() {
            this.canvas.style.filter = 'none';
            this.canvas.style.webkitFilter = this.canvas.style.filter;
        }

        installAssetProgress() {}

        async patchPixi7TextureExtractor() {
            const manualTextures = await Promise.all(this.modelTextures.map((url) => this.createWebGLTexture(url)));
            const contextUid = this.model._getContextUID(this.app.renderer.gl);
            this.model.glContextID = contextUid;
            this.model.internalModel.updateWebGLContext(this.app.renderer.gl, contextUid);
            manualTextures.forEach((texture, index) => this.model.internalModel.bindTexture(index, texture));
            const manualSlots = manualTextures.map((_, index) => ({ roomManualTextureIndex: index }));
            this.model.textures = manualSlots;
            const textureMap = new Map();
            this.model.textures.forEach((texture, index) => textureMap.set(texture, manualTextures[index]));
            window.setInterval(() => {
                if (this.model && this.model.textures !== manualSlots) this.model.textures = manualSlots;
            }, 250);
            const original = this.model.extractWebGLTexture?.bind(this.model);
            this.model.extractWebGLTexture = (renderer, texture) => {
                if (textureMap.has(texture)) return textureMap.get(texture);
                const extracted = original ? original(renderer, texture) : null;
                if (extracted instanceof WebGLTexture) return extracted;

                const baseTexture = texture.baseTexture || texture.source;
                const glTextures = baseTexture && baseTexture._glTextures;
                const contextUid = renderer.CONTEXT_UID || this.model.glContextID;
                const glTexture = glTextures && (glTextures[contextUid] || glTextures[this.model.glContextID]);
                if (glTexture) return glTexture.texture || glTexture;

                renderer.texture.bind(texture.baseTexture || texture);
                const rebound = glTextures && (glTextures[contextUid] || glTextures[this.model.glContextID]);
                return rebound ? (rebound.texture || rebound) : null;
            };
        }

        createWebGLTexture(url) {
            return new Promise((resolve, reject) => {
                const image = new Image();
                image.crossOrigin = 'anonymous';
                image.onload = () => {
                    const gl = this.app.renderer.gl;
                    const texture = gl.createTexture();
                    gl.bindTexture(gl.TEXTURE_2D, texture);
                    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, this.model.internalModel.textureFlipY);
                    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                    gl.bindTexture(gl.TEXTURE_2D, null);
                    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
                    resolve(texture);
                };
                image.onerror = () => reject(new Error(`贴图加载失败：${url}`));
                image.src = url;
            });
        }

        removeIdleEyeMotionConflicts() {
            const motionManager = this.model?.internalModel?.motionManager;
            const idleGroup = motionManager?.groups?.idle ?? motionManager?.groups?.Idle;
            const motions = idleGroup != null ? motionManager?.motionGroups?.[idleGroup] : null;
            motions?.forEach?.((motion) => {
                motion?._motionData?.curves?.forEach?.((curve) => {
                    if (curve.id === 'ParamEyeBallX' || curve.id === 'ParamEyeBallY') {
                        curve.id = `_${curve.id}`;
                    }
                });
            });
        }

        installResize() {
            window.addEventListener('resize', () => {
                this.resizeRenderer();
                this.layout();
            });
        }

        resizeRenderer() {
            const width = Math.max(1, this.container.clientWidth || 600);
            const height = Math.max(1, this.container.clientHeight || 700);
            this.app.renderer.resize(width, height);
            this.canvas.style.width = `${width}px`;
            this.canvas.style.height = `${height}px`;
        }

        installPointerFocus() {
            this.pointerFocusHandler = (event) => {
                if (!this.model) return;
                const rect = this.canvas.getBoundingClientRect();
                const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
                const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
                this.focusX = Math.max(-1, Math.min(1, x));
                this.focusY = Math.max(-1, Math.min(1, y));
            };
            document.addEventListener('pointermove', this.pointerFocusHandler, { passive: true });
            this.container.addEventListener('pointerleave', () => {
                this.focusX = 0;
                this.focusY = 0;
            });
        }

        installFocusTicker() {
            this.focusTicker = () => {
                if (!this.model) return;
                this.currentFocusX += (this.focusX - this.currentFocusX) * 0.12;
                this.currentFocusY += (this.focusY - this.currentFocusY) * 0.12;
                const x = (this.currentFocusX * 0.5 + 0.5) * this.app.renderer.width;
                const y = (this.currentFocusY * 0.5 + 0.5) * this.app.renderer.height;
                this.model.focus(x, y);
            };
            this.app.ticker.add(this.focusTicker);
        }

        installTapExpression() {
            this.canvas.addEventListener('pointerdown', () => {
                const manager = this.model?.internalModel?.motionManager?.expressionManager;
                if (manager?.definitions?.length) manager.setRandomExpression().catch(() => {});
            });
        }

        installLipSyncTicker() {
            this.mouthTicker = () => {
                if (!this.model?.internalModel?.coreModel) return;
                const coreModel = this.model.internalModel.coreModel;
                const speaking = performance.now() < this.mouthUntil;
                const value = speaking ? 0.35 + Math.abs(Math.sin(performance.now() * 0.026)) * 0.55 : 0;
                try {
                    coreModel.setParameterValueById('ParamMouthOpenY', value, 0.85);
                } catch (_) {
                    try {
                        const id = window.PIXI.live2d.Live2DCubismFramework.CubismFramework.getIdManager().getId('ParamMouthOpenY');
                        coreModel.setParameterValueById(id, value, 0.85);
                    } catch (_) {}
                }
            };
            this.app.ticker.add(this.mouthTicker);
        }

        applySettings(scale, xOffset, yOffset) {
            this.scaleSetting = Number(scale) || 0.13;
            this.xOffset = Number(xOffset) || 0;
            this.yOffset = Number(yOffset) || 0;
            this.layout();
        }

        syncControls(settings) {
            if ($('modelScaleInput')) $('modelScaleInput').value = Math.round((settings.scale || 0.13) * 100);
            if ($('modelScaleValue')) $('modelScaleValue').textContent = `${Math.round((settings.scale || 0.13) * 100)}%`;
            if ($('modelXInput')) $('modelXInput').value = settings.xOffset || 0;
            if ($('modelXValue')) $('modelXValue').textContent = settings.xOffset || 0;
            if ($('modelYInput')) $('modelYInput').value = settings.yOffset || 0;
            if ($('modelYValue')) $('modelYValue').textContent = settings.yOffset || 0;
        }

        layout() {
            if (!this.model || !this.model.internalModel) return;
            const width = this.app.renderer.width;
            const height = this.app.renderer.height;
            const nativeHeight = this.model.internalModel.height || this.model.height || 1;
            const fitScale = height * 0.92 / nativeHeight;
            const userMultiplier = this.scaleSetting / 0.13;
            const scale = fitScale * userMultiplier;

            this.model.scale.set(scale);
            this.model.x = width / 2 + this.xOffset;
            this.model.y = height / 2 + this.yOffset;
        }

        speak(seconds) {
            this.mouthUntil = performance.now() + Math.max(500, seconds * 1000);
        }

        destroy() {
            if (this.pointerFocusHandler) document.removeEventListener('pointermove', this.pointerFocusHandler);
            if (this.focusTicker && this.app) this.app.ticker.remove(this.focusTicker);
            if (this.mouthTicker && this.app) this.app.ticker.remove(this.mouthTicker);
            if (this.model) this.model.destroy({ children: true, texture: false, baseTexture: false });
            if (this.app) this.app.destroy(false, { children: true, texture: false, baseTexture: false });
        }
    }

    function normalizeSettings(prefix) {
        const settings = prefix === 'llm' ? readJson('roomLLMSettings', {}) : readJson('roomTTSSettings', {});
        const fields = prefix === 'llm'
            ? ['apiUrl', 'apiKey', 'model']
            : ['enabled', 'provider', 'apiUrl', 'apiKey', 'voice'];
        fields.forEach((field) => {
            const el = $(`${prefix}${field[0].toUpperCase()}${field.slice(1)}`);
            if (!el) return;
            settings[field] = el.type === 'checkbox' ? el.checked : el.value.trim();
        });
        return settings;
    }

    async function postJson(path, payload) {
        const response = await fetch(window.location.origin + path, {
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

    window.loadLive2DModel = async function loadLive2DModel() {
        if (live2dStarted) return;
        live2dStarted = true;
        try {
            const canvas = $('live2d-canvas');
            const container = $('live2d-container');
            if (!canvas || !container) throw new Error('Live2D 容器不存在');
            setLoading('正在加载 Cubism5 模型、物理与贴图...');
            live2d = new PixiLive2DRoom(canvas, container);
            window.roomLive2DRenderer = live2d;
            await live2d.init();
            hideLoading();
            appendMessage('system', '辉夜姬已经在房间里等你了。');
        } catch (error) {
            live2dStarted = false;
            console.error('Room Live2D failed:', error);
            setLoading(error.message || '未知错误', true);
        }
    };

    window.setLive2DModelSettings = function setLive2DModelSettings(scale, xOffset, yOffset) {
        if (live2d) live2d.applySettings(scale, xOffset, yOffset);
    };

    window.loadChatHistory = function loadChatHistory() {
        chatConversation = readJson('roomChatHistory', []);
        const chatMessages = $('chatMessages');
        if (chatMessages) chatMessages.innerHTML = '<div class="chat-message system">与辉夜姬的聊天开始</div>';
        chatConversation.forEach((msg) => appendMessage(msg.role, msg.content));

        const llm = readJson('roomLLMSettings', {});
        if (llm.apiUrl && $('llmApiUrl')) $('llmApiUrl').value = llm.apiUrl;
        if (llm.apiKey && $('llmApiKey')) $('llmApiKey').value = llm.apiKey;
        if (llm.model && $('llmModel')) $('llmModel').value = llm.model;

        const tts = readJson('roomTTSSettings', {});
        if ($('ttsEnabled')) $('ttsEnabled').checked = Boolean(tts.enabled);
        if (tts.provider && $('ttsProvider')) $('ttsProvider').value = tts.provider;
        if (tts.apiUrl && $('ttsApiUrl')) $('ttsApiUrl').value = tts.apiUrl;
        if (tts.apiKey && $('ttsApiKey')) $('ttsApiKey').value = tts.apiKey;
        if (tts.voice && $('ttsVoice')) $('ttsVoice').value = tts.voice;
    };

    window.appendChatMessage = appendMessage;
    window.escapeHtml = escapeHtml;

    window.saveLLMSettings = function saveLLMSettings() {
        writeJson('roomLLMSettings', normalizeSettings('llm'));
        appendMessage('system', 'API 设置已保存');
    };

    window.saveTTSSettings = function saveTTSSettings() {
        writeJson('roomTTSSettings', normalizeSettings('tts'));
        appendMessage('system', 'TTS 设置已保存');
    };

    window.testLLMConnection = async function testLLMConnection() {
        const settings = normalizeSettings('llm');
        appendMessage('system', '正在测试 LLM 连接...');
        try {
            const result = await postJson(CHAT_ENDPOINT, {
                message: '你好，请用一句话回应连接测试。',
                conversation: [],
                settings
            });
            appendMessage('system', `连接成功：${result.data.model || 'room-llm'}`);
            appendMessage('assistant', result.data.reply);
        } catch (error) {
            appendMessage('system', `连接失败：${error.message}`);
        }
    };

    window.sendChat = async function sendChat() {
        const input = $('chatInput');
        const message = input ? input.value.trim() : '';
        if (!message) return;
        appendMessage('user', message);
        input.value = '';

        const typing = document.createElement('div');
        typing.className = 'chat-message assistant chat-typing';
        typing.textContent = '辉夜姬正在回应...';
        $('chatMessages').appendChild(typing);

        try {
            const result = await postJson(CHAT_ENDPOINT, {
                message,
                conversation: chatConversation.slice(-12),
                settings: readJson('roomLLMSettings', {})
            });
            typing.remove();
            const reply = result.data.reply;
            appendMessage('assistant', reply);
            chatConversation.push({ role: 'user', content: message }, { role: 'assistant', content: reply });
            chatConversation = chatConversation.slice(-24);
            writeJson('roomChatHistory', chatConversation);
            window.playTTS(reply);
        } catch (error) {
            typing.remove();
            appendMessage('system', `发送失败：${error.message}`);
        }
    };

    window.testTTS = async function testTTS() {
        const settings = normalizeSettings('tts');
        appendMessage('system', '正在测试 TTS...');
        try {
            await playTTSInternal('你好，我是八千代。今晚的月光，也很温柔呢。', settings, true);
            appendMessage('system', 'TTS 测试成功');
        } catch (error) {
            appendMessage('system', `TTS 测试失败：${error.message}`);
        }
    };

    window.playTTS = async function playTTS(text) {
        const settings = readJson('roomTTSSettings', {});
        if (!settings.enabled) return;
        try {
            await playTTSInternal(text, settings, false);
        } catch (error) {
            console.warn('TTS skipped:', error.message);
        }
    };

    async function playTTSInternal(text, settings, force) {
        if (!force && !settings.enabled) return;
        const response = await fetch(window.location.origin + TTS_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, settings })
        });
        if (!response.ok) {
            const detail = await response.json().catch(() => ({}));
            throw new Error(detail.message || `HTTP ${response.status}`);
        }
        const blob = await response.blob();
        if (ttsAudioUrl) URL.revokeObjectURL(ttsAudioUrl);
        ttsAudioUrl = URL.createObjectURL(blob);
        const audio = new Audio(ttsAudioUrl);
        audio.onplay = () => {
            if (live2d) live2d.speak(Math.min(10, Math.max(1, text.length / 6)));
        };
        await audio.play();
    }

    document.addEventListener('DOMContentLoaded', () => {
        window.loadLive2DModel();
    });
})();
