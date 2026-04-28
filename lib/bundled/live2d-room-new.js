/**
 * Tsukuyomi-Space Live2D Controller
 * Uses official Cubism Framework with proper model loading
 */
(function () {
    'use strict';

    class Live2DRoom {
        constructor() {
            this.canvas = null;
            this.gl = null;
            this.model = null;
            this.isInitialized = false;
            this.isModelLoaded = false;
            this.frameCount = 0;
            this.lastTime = 0;

            this.mouseX = 0;
            this.mouseY = 0;
            this.dragX = 0;
            this.dragY = 0;
        }

        async initialize(canvasElement) {
            if (this.isInitialized) return false;

            this.canvas = canvasElement;

            // Get WebGL context
            this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
            if (!this.gl) {
                console.error('WebGL not supported');
                return false;
            }

            // Setup GL
            const gl = this.gl;
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

            // Setup events
            this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
            this.canvas.addEventListener('click', this.onClick.bind(this));

            // Resize
            this.onResize();

            this.isInitialized = true;
            console.log('Live2DRoom initialized');
            return true;
        }

        async loadModel(modelPath) {
            if (!this.isInitialized) return false;

            try {
                this.onLoading('正在加载模型...');

                // Create LAppModel
                const fw = window.Live2DCubismFramework;
                this.model = new fw.LAppModel();
                this.model.setGl(this.gl);

                const self = this;

                // Load assets
                return new Promise((resolve, reject) => {
                    self.model.loadAssets(modelPath, '八千代辉夜姬.model3.json', function (loadedModel) {
                        if (!loadedModel) {
                            reject(new Error('Model loading failed'));
                            return;
                        }

                        self.model = loadedModel;
                        self.isModelLoaded = true;

                        // Create renderer
                        self.model.createRenderer();
                        const renderer = self.model.getRenderer();
                        renderer.initialize(self.gl);

                        // Convert textures to WebGL
                        const textures = [];
                        for (let i = 0; i < self.model._textures.length; i++) {
                            const img = self.model._textures[i];
                            if (img) {
                                const tex = self.gl.createTexture();
                                self.gl.bindTexture(self.gl.TEXTURE_2D, tex);
                                self.gl.texImage2D(self.gl.TEXTURE_2D, 0, self.gl.RGBA, self.gl.RGBA, self.gl.UNSIGNED_BYTE, img);
                                self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_WRAP_S, self.gl.CLAMP_TO_EDGE);
                                self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_WRAP_T, self.gl.CLAMP_TO_EDGE);
                                self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_MIN_FILTER, self.gl.LINEAR);
                                self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_MAG_FILTER, self.gl.LINEAR);
                                textures[i] = tex;
                            }
                        }
                        renderer.setTextures(textures);

                        // Start render loop
                        self.lastTime = performance.now();

                        // Debug: log model info
                        const coreModel = self.model.getModel();
                        if (coreModel) {
                            console.log('Canvas:', self.canvas.width, 'x', self.canvas.height);
                            console.log('Model canvas:', coreModel.canvasinfo.CanvasWidth, 'x', coreModel.canvasinfo.CanvasHeight);
                            console.log('Drawables:', coreModel.drawables.count);
                            console.log('Textures:', self.model._textures.length);
                            console.log('Model matrix:', self.model.getModelMatrix()._matrix);
                        }

                        self.render();

                        self.onReady();
                        console.log('Live2D model loaded successfully');
                        resolve(true);
                    });
                });

            } catch (error) {
                console.error('Failed to load model:', error);
                this.onError('模型加载失败: ' + error.message);
                return false;
            }
        }

        render() {
            if (!this.isModelLoaded || !this.model) return;

            const currentTime = performance.now();
            const deltaTime = currentTime - this.lastTime;
            this.lastTime = currentTime;
            this.frameCount++;

            // Update core model directly (bypass LAppModel.update which uses addParameterValue)
            const coreModel = this.model.getModel();
            if (coreModel) {
                coreModel.update();

                // Apply drag directly to parameters
                const params = coreModel.parameters;
                for (let i = 0; i < params.count; i++) {
                    const id = params.ids[i];
                    if (id === 'ParamAngleX') {
                        params.values[i] = this.dragX * 30;
                    } else if (id === 'ParamAngleY') {
                        params.values[i] = this.dragY * 30;
                    } else if (id === 'ParamEyeBallX') {
                        params.values[i] = this.dragX;
                    } else if (id === 'ParamEyeBallY') {
                        params.values[i] = this.dragY;
                    } else if (id === 'ParamBreath') {
                        params.values[i] = 0.5 + Math.sin(currentTime * 0.002) * 0.1;
                    }
                }
            }

            // Draw
            const gl = this.gl;
            gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            // Draw with model matrix
            const matrix = new window.Live2DCubismFramework.CubismMatrix44();
            matrix.multiplyByMatrix(this.model.getModelMatrix());
            this.model.draw(matrix);

            // Next frame
            requestAnimationFrame(this.render.bind(this));
        }

        onResize() {
            if (!this.canvas) return;
            this.canvas.width = this.canvas.clientWidth || 600;
            this.canvas.height = this.canvas.clientHeight || 700;
        }

        onMouseMove(event) {
            if (!this.isModelLoaded) return;

            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = event.clientX - rect.left;
            this.mouseY = event.clientY - rect.top;

            // Normalize to -1 to 1
            this.dragX = (this.mouseX / this.canvas.width) * 2 - 1;
            this.dragY = -((this.mouseY / this.canvas.height) * 2 - 1);
        }

        onClick(event) {
            if (!this.isModelLoaded || !this.model) return;

            const rect = this.canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            // Hit test
            if (this.model.hitTest) {
                const hit = this.model.hitTest('HitArea', x, y);
                if (hit) {
                    console.log('Hit:', hit);
                    this.model.startRandomMotion('TapBody', 0);
                }
            }
        }

        setSettings(settings) {
            if (!this.isModelLoaded || !this.model) return;

            if (settings.scale !== undefined) {
                // Adjust model matrix scale
            }
            if (settings.xOffset !== undefined) {
                // Adjust model position
            }
            if (settings.yOffset !== undefined) {
                // Adjust model position
            }
        }

        onLoading(message) {
            console.log('Loading:', message);
            const overlay = document.getElementById('loadingOverlay');
            if (overlay) {
                const text = overlay.querySelector('.loading-text');
                if (text) text.textContent = message;
            }
        }

        onReady() {
            const overlay = document.getElementById('loadingOverlay');
            if (overlay) {
                overlay.style.display = 'none';
            }
        }

        onError(message) {
            console.error('Live2D Error:', message);
            const overlay = document.getElementById('loadingOverlay');
            if (overlay) {
                const text = overlay.querySelector('.loading-text');
                if (text) text.textContent = '加载失败';
            }
        }
    }

    window.Live2DRoom = Live2DRoom;

    // Auto-initialize
    async function autoInit() {
        // Wait for framework
        if (typeof window.Live2DCubismFramework === 'undefined') {
            console.log('Waiting for Live2DCubismFramework...');
            setTimeout(autoInit, 100);
            return;
        }

        const canvas = document.getElementById('live2d-canvas');
        if (!canvas) {
            console.error('live2d-canvas not found');
            return;
        }

        // Initialize framework
        window.Live2DCubismFramework.CubismFramework.initialize();

        const room = new Live2DRoom();
        const success = await room.initialize(canvas);

        if (success) {
            window.live2dRoom = room;

            // Load bundled model
            await room.loadModel('/lib/bundled/resource/%E5%85%AB%E5%8D%83%E4%BB%A3%E8%BE%89%E5%A4%9C%E5%A7%AC/');

            // Expose settings function
            window.setLive2DModelSettings = function(scale, xOffset, yOffset) {
                room.setSettings({ scale, xOffset, yOffset });
            };

            console.log('Live2D auto-initialized');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInit);
    } else {
        autoInit();
    }
})();
