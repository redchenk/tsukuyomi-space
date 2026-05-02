(function () {
    'use strict';

    const MODEL_URL = '/models/tsukimi-yachiyo/tsukimi-yachiyo.model3.json';
    const CHAT_ENDPOINT = '/api/room/chat';
    const TTS_ENDPOINT = '/api/room/tts';
    const CORE = () => window.Live2DCubismCore;
    const Utils = () => CORE()?.Utils || {};

    const DEFAULT_MODEL_SETTINGS = { scale: 1, xOffset: 0, yOffset: 0 };
    const LLM_PRESETS = {
        deepseek: { apiUrl: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
        moonshot: { apiUrl: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k' },
        openai: { apiUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
        aliyun: { apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus' }
    };

    let chatConversation = [];
    let live2d = null;
    let ttsAudioUrl = null;
    let ambientFish = null;
    let draggedPanel = null;
    let dragOffset = { x: 0, y: 0 };
    let zIndexCounter = 30;
    let live2dReadyListener = null;

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
        const node = document.createElement('div');
        node.className = `chat-message ${role}`;
        node.innerHTML = `<span class="chat-role">${roleNames[role] || role}</span>${escapeHtml(content)}`;
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
            this.syncControls(this.settings);
            this.applyWhenReady();
        }

        applySettings(scale, xOffset, yOffset) {
            this.settings = {
                scale: Number(scale) || DEFAULT_MODEL_SETTINGS.scale,
                xOffset: Number(xOffset) || 0,
                yOffset: Number(yOffset) || 0
            };
            writeJson('roomModelSettings', this.settings);
            this.syncControls(this.settings);
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

        syncControls(settings = this.settings) {
            const scale = Math.round(settings.scale * 100);
            if ($('modelScaleInput')) $('modelScaleInput').value = scale;
            if ($('modelScaleValue')) $('modelScaleValue').textContent = `${scale}%`;
            if ($('modelXInput')) $('modelXInput').value = settings.xOffset;
            if ($('modelXValue')) $('modelXValue').textContent = settings.xOffset;
            if ($('modelYInput')) $('modelYInput').value = settings.yOffset;
            if ($('modelYValue')) $('modelYValue').textContent = settings.yOffset;
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
            this.syncControls();
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
            this.syncControls();
        }

        syncControls() {
            const scale = Math.round(this.settings.scale * 100);
            if ($('modelScaleInput')) $('modelScaleInput').value = scale;
            if ($('modelScaleValue')) $('modelScaleValue').textContent = `${scale}%`;
            if ($('modelXInput')) $('modelXInput').value = this.settings.xOffset;
            if ($('modelXValue')) $('modelXValue').textContent = this.settings.xOffset;
            if ($('modelYInput')) $('modelYInput').value = this.settings.yOffset;
            if ($('modelYValue')) $('modelYValue').textContent = this.settings.yOffset;
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

    function initSakura() {
        ambientFish = window.initTsukuyomiAmbientFish?.({
            containerId: 'sakuraContainer',
            toggleId: 'sakuraToggle',
            density: 0.48
        }) || null;
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
        $('resetPanelsBtn')?.addEventListener('click', () => {
            localStorage.removeItem('roomPanelPositions');
            location.reload();
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
        appendMessage('system', '资料已保存');
    }

    function renderProfile(profile) {
        const display = $('profileDisplay');
        if (!display) return;
        const nickname = profile.nickname || '未命名访客';
        const signature = profile.signature || '今晚也在月光里慢慢整理思绪。';
        display.innerHTML = `<div><strong>${escapeHtml(nickname)}</strong></div><div>${escapeHtml(signature)}</div>`;
    }

    function normalizeSettings(prefix) {
        const current = readJson(prefix === 'llm' ? 'roomLLMSettings' : 'roomTTSSettings', {});
        const fields = prefix === 'llm'
            ? ['apiUrl', 'apiKey', 'model']
            : ['enabled', 'provider', 'apiUrl', 'apiKey', 'voice'];
        fields.forEach((field) => {
            const id = `${prefix}${field[0].toUpperCase()}${field.slice(1)}`;
            const el = $(id);
            if (!el) return;
            current[field] = el.type === 'checkbox' ? el.checked : el.value.trim();
        });
        return current;
    }

    function initChatAndSettings() {
        chatConversation = readJson('roomChatHistory', []);
        const chatMessages = $('chatMessages');
        if (chatMessages) chatMessages.innerHTML = '';
        appendMessage('system', '聊天已准备好');
        chatConversation.forEach((message) => appendMessage(message.role, message.content));

        const llm = readJson('roomLLMSettings', {});
        if ($('llmApiUrl')) $('llmApiUrl').value = llm.apiUrl || '';
        if ($('llmApiKey')) $('llmApiKey').value = llm.apiKey || '';
        if ($('llmModel')) $('llmModel').value = llm.model || '';

        const tts = readJson('roomTTSSettings', {});
        if ($('ttsEnabled')) $('ttsEnabled').checked = Boolean(tts.enabled);
        if ($('ttsProvider')) $('ttsProvider').value = tts.provider || 'mimo';
        if ($('ttsApiUrl')) $('ttsApiUrl').value = tts.apiUrl || '';
        if ($('ttsApiKey')) $('ttsApiKey').value = tts.apiKey || '';
        if ($('ttsVoice')) $('ttsVoice').value = tts.voice || '';

        $('sendChatBtn')?.addEventListener('click', sendChat);
        $('chatInput')?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') sendChat();
        });
        $('saveLLMBtn')?.addEventListener('click', () => {
            writeJson('roomLLMSettings', normalizeSettings('llm'));
            appendMessage('system', 'API 设置已保存');
        });
        $('saveTTSBtn')?.addEventListener('click', () => {
            writeJson('roomTTSSettings', normalizeSettings('tts'));
            appendMessage('system', 'TTS 设置已保存');
        });
        $('testLLMBtn')?.addEventListener('click', testLLMConnection);
        $('testTTSBtn')?.addEventListener('click', testTTS);
        document.querySelectorAll('[data-llm-preset]').forEach((button) => {
            button.addEventListener('click', () => {
                const preset = LLM_PRESETS[button.dataset.llmPreset];
                if (!preset) return;
                $('llmApiUrl').value = preset.apiUrl;
                $('llmModel').value = preset.model;
                appendMessage('system', `已应用 ${button.textContent} 预设`);
            });
        });
    }

    function initModelControls() {
        const sync = () => {
            const scale = Number($('modelScaleInput')?.value || 100) / 100;
            const xOffset = Number($('modelXInput')?.value || 0);
            const yOffset = Number($('modelYInput')?.value || 0);
            live2d?.applySettings(scale, xOffset, yOffset);
        };
        ['modelScaleInput', 'modelXInput', 'modelYInput'].forEach((id) => {
            $(id)?.addEventListener('input', sync);
        });
        $('resetModelBtn')?.addEventListener('click', () => {
            live2d?.applySettings(DEFAULT_MODEL_SETTINGS.scale, DEFAULT_MODEL_SETTINGS.xOffset, DEFAULT_MODEL_SETTINGS.yOffset);
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
            const result = await postJson(CHAT_ENDPOINT, {
                message,
                conversation: chatConversation.slice(-12),
                settings: readJson('roomLLMSettings', {})
            });
            typing.remove();
            const reply = result.data.reply || '';
            appendMessage('assistant', reply);
            chatConversation.push({ role: 'user', content: message }, { role: 'assistant', content: reply });
            chatConversation = chatConversation.slice(-24);
            writeJson('roomChatHistory', chatConversation);
            playTTS(reply);
        } catch (error) {
            typing.remove();
            appendMessage('system', `发送失败：${error.message}`);
        }
    }

    async function testLLMConnection() {
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
    }

    async function testTTS() {
        const settings = normalizeSettings('tts');
        appendMessage('system', '正在测试 TTS...');
        try {
            await playTTSInternal('你好，我是八千代辉夜姬。今晚的月光，也很温柔。', settings, true);
            appendMessage('system', 'TTS 测试成功');
        } catch (error) {
            appendMessage('system', `TTS 测试失败：${error.message}`);
        }
    }

    async function playTTS(text) {
        const settings = readJson('roomTTSSettings', {});
        if (!settings.enabled) return;
        try {
            await playTTSInternal(text, settings, false);
        } catch (error) {
            console.warn('TTS skipped:', error.message);
        }
    }

    async function playTTSInternal(text, settings, force) {
        if (!force && !settings.enabled) return;
        const response = await fetch(TTS_ENDPOINT, {
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
        initSakura();
        initPanels();
        initProfileAndNote();
        initChatAndSettings();
        initModelControls();
        bootLive2D();
    }

    window.initTsukuyomiRoomRuntime = bootRoomRuntime;
    window.destroyTsukuyomiRoomRuntime = () => {
        if (live2dReadyListener) {
            window.removeEventListener('tsukuyomi:live2d-ready', live2dReadyListener);
            live2dReadyListener = null;
        }
        ambientFish?.destroy?.();
        live2d?.destroy?.();
        ambientFish = null;
        live2d = null;
        window.__tsukuyomiRoomRuntimeReady = false;
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootRoomRuntime, { once: true });
    } else {
        bootRoomRuntime();
    }

    window.addEventListener('beforeunload', () => {
        ambientFish?.destroy?.();
        live2d?.destroy?.();
    });
})();
