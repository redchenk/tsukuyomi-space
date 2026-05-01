(function () {
    'use strict';

    const STYLE_ID = 'tsukuyomi-ambient-fish-style';
    const DEFAULTS = {
        containerId: 'sakuraContainer',
        toggleId: null,
        density: null,
        enabled: true
    };
    const COLORS = ['#68f6ff', '#ff6fd8', '#fff36a', '#ffb36b', '#8dffcc', '#8fb7ff'];

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function resolveElement(target) {
        if (!target) return null;
        if (typeof target === 'string') return document.getElementById(target);
        return target.nodeType === 1 ? target : null;
    }

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '.tsukuyomi-ambient-fish { overflow: hidden; }',
            '.tsukuyomi-ambient-fish-glow, .tsukuyomi-ambient-fish-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }',
            '.tsukuyomi-ambient-fish-glow {',
            '  background:',
            '    radial-gradient(circle at 45% 45%, rgba(80, 160, 255, 0.12), transparent 32%),',
            '    radial-gradient(circle at 70% 70%, rgba(255, 120, 220, 0.08), transparent 28%);',
            '  opacity: 0.85;',
            '  transition: opacity 0.3s ease;',
            '}',
            '.tsukuyomi-ambient-fish-canvas { display: block; opacity: 0.96; transition: opacity 0.3s ease; }',
            '.tsukuyomi-ambient-fish.is-disabled .tsukuyomi-ambient-fish-glow,',
            '.tsukuyomi-ambient-fish.is-disabled .tsukuyomi-ambient-fish-canvas { opacity: 0; }',
            '@media (prefers-reduced-motion: reduce) {',
            '  .tsukuyomi-ambient-fish-glow, .tsukuyomi-ambient-fish-canvas { display: none !important; }',
            '}'
        ].join('\n');
        document.head.appendChild(style);
    }

    function randomColor() {
        return COLORS[(Math.random() * COLORS.length) | 0];
    }

    function detectLowPower() {
        const cores = navigator.hardwareConcurrency || 8;
        const mobileWidth = window.innerWidth < 768;
        return mobileWidth || cores <= 4 || (window.devicePixelRatio || 1) > 2;
    }

    function defaultDensity() {
        return document.getElementById('live2d-container') ? 0.72 : 0.92;
    }

    function drawFishShape(ctx, size) {
        ctx.beginPath();
        ctx.moveTo(size * 1.12, 0);
        ctx.lineTo(size * 0.5, -size * 0.34);
        ctx.lineTo(-size * 0.38, -size * 0.4);
        ctx.lineTo(-size * 1.02, 0);
        ctx.lineTo(-size * 0.38, size * 0.4);
        ctx.lineTo(size * 0.5, size * 0.34);
        ctx.closePath();

        ctx.moveTo(-size * 1.02, 0);
        ctx.lineTo(-size * 1.62, -size * 0.46);
        ctx.lineTo(-size * 1.42, 0);
        ctx.lineTo(-size * 1.62, size * 0.46);
        ctx.closePath();

        ctx.fill();
        ctx.stroke();
    }

    function drawFishHighlights(ctx, size) {
        ctx.beginPath();
        ctx.moveTo(size * 1.12, 0);
        ctx.lineTo(size * 0.24, -size * 0.34);
        ctx.lineTo(-size * 0.26, size * 0.34);
        ctx.lineTo(-size * 0.74, -size * 0.2);
        ctx.lineTo(size * 0.06, 0);
        ctx.lineTo(size * 0.5, size * 0.34);

        ctx.moveTo(-size * 1.02, 0);
        ctx.lineTo(-size * 0.38, -size * 0.4);

        ctx.moveTo(-size * 1.02, 0);
        ctx.lineTo(-size * 0.38, size * 0.4);

        ctx.moveTo(-size * 1.62, -size * 0.46);
        ctx.lineTo(-size * 1.42, 0);
        ctx.lineTo(-size * 1.62, size * 0.46);
        ctx.stroke();
    }

    function createFishSprite(scene, size, color, alpha, layer) {
        const padding = Math.ceil(size * 1.2);
        const spriteWidth = Math.ceil(size * 4.2 + padding * 2);
        const spriteHeight = Math.ceil(size * 2.2 + padding * 2);
        const sprite = document.createElement('canvas');
        sprite.width = Math.floor(spriteWidth * scene.dpr);
        sprite.height = Math.floor(spriteHeight * scene.dpr);

        const spriteCtx = sprite.getContext('2d');
        spriteCtx.setTransform(scene.dpr, 0, 0, scene.dpr, 0, 0);
        spriteCtx.translate(spriteWidth / 2, spriteHeight / 2);
        spriteCtx.globalAlpha = alpha;
        spriteCtx.shadowColor = color;
        spriteCtx.shadowBlur = (scene.lowPower ? 10 : 18) * layer;
        spriteCtx.fillStyle = color;
        spriteCtx.strokeStyle = 'rgba(255,255,255,0.52)';
        spriteCtx.lineWidth = Math.max(0.8, 1.1 * layer);
        drawFishShape(spriteCtx, size);

        spriteCtx.shadowBlur = 4 * layer;
        spriteCtx.strokeStyle = 'rgba(255,255,255,0.6)';
        spriteCtx.lineWidth = 0.9;
        drawFishHighlights(spriteCtx, size);
        return sprite;
    }

    class AmbientFish {
        constructor(scene, layer) {
            this.scene = scene;
            this.layer = layer;
            this.seedAppearance();
            this.resetPosition(true);
        }

        seedAppearance() {
            this.size = (16 + Math.random() * 44) * this.layer;
            this.speedBase = (0.18 + Math.random() * 0.75) * this.layer;
            this.color = randomColor();
            this.alpha = 0.28 + Math.random() * 0.42;
            this.angle = -0.06 + Math.random() * 0.12;
            this.waveAmp = 8 + Math.random() * 22;
            this.sprite = createFishSprite(this.scene, this.size, this.color, this.alpha, this.layer);
        }

        resetPosition(randomX) {
            this.x = randomX ? Math.random() * this.scene.width : -160 - Math.random() * 220;
            this.baseY = Math.random() * this.scene.height;
            this.y = this.baseY;
            this.speed = this.speedBase * (0.8 + Math.random() * 0.45);
            this.phase = Math.random() * Math.PI * 2;
        }

        recycle() {
            if (Math.random() < 0.15) this.seedAppearance();
            this.resetPosition(false);
        }

        update(deltaScale) {
            this.x += this.speed * deltaScale;
            this.phase += 0.014 * this.layer * deltaScale;
            this.y = this.baseY + Math.sin(this.phase) * this.waveAmp;
            if (this.x > this.scene.width + this.size * 3) this.recycle();
        }

        draw(ctx) {
            const spriteWidth = this.sprite.width / this.scene.dpr;
            const spriteHeight = this.sprite.height / this.scene.dpr;
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle);
            ctx.drawImage(this.sprite, -spriteWidth / 2, -spriteHeight / 2, spriteWidth, spriteHeight);
            ctx.restore();
        }
    }

    class LightParticle {
        constructor(scene) {
            this.scene = scene;
            this.reset();
        }

        reset() {
            this.x = Math.random() * this.scene.width;
            this.y = Math.random() * this.scene.height;
            this.radius = 0.9 + Math.random() * 2.5;
            this.color = randomColor();
            this.alpha = 0.08 + Math.random() * 0.18;
            this.speed = 0.05 + Math.random() * 0.22;
            this.phase = Math.random() * Math.PI * 2;
        }

        update(deltaScale) {
            this.y -= this.speed * deltaScale;
            this.x += Math.sin(this.phase) * 0.08 * deltaScale;
            this.phase += 0.014 * deltaScale;
            if (this.y < -20) {
                this.y = this.scene.height + 20;
                this.x = Math.random() * this.scene.width;
            }
        }

        draw(ctx) {
            ctx.globalAlpha = this.alpha;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.ellipse(this.x, this.y, this.radius * 0.75, this.radius * 2.2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    class AmbientFishController {
        constructor(container, options) {
            this.container = container;
            this.options = { ...DEFAULTS, ...options };
            this.enabled = this.options.enabled !== false;
            this.lowPower = detectLowPower();
            this.reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            this.dpr = 1;
            this.width = 0;
            this.height = 0;
            this.lastTime = 0;
            this.animationId = 0;
            this.resizeTimer = 0;
            this.fishes = [];
            this.particles = [];
            this.boundAnimate = (time) => this.animate(time);
            this.boundVisibility = () => this.onVisibilityChange();
            this.boundResize = () => this.onResize();
            this.boundReducedMotion = () => this.onReducedMotionChange();
            this.boundToggleChange = null;
            this.toggle = null;
        }

        init() {
            ensureStyles();
            this.container.classList.add('tsukuyomi-ambient-fish');

            this.glow = document.createElement('div');
            this.glow.className = 'tsukuyomi-ambient-fish-glow';
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'tsukuyomi-ambient-fish-canvas';
            this.canvas.setAttribute('aria-hidden', 'true');
            this.container.appendChild(this.glow);
            this.container.appendChild(this.canvas);

            this.ctx = this.canvas.getContext('2d', {
                alpha: true,
                desynchronized: true
            }) || this.canvas.getContext('2d');

            if (!this.ctx) {
                this.container.classList.add('is-disabled');
                return this;
            }

            document.addEventListener('visibilitychange', this.boundVisibility);
            window.addEventListener('resize', this.boundResize, { passive: true });

            if (window.matchMedia) {
                this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
                if (this.motionQuery.addEventListener) {
                    this.motionQuery.addEventListener('change', this.boundReducedMotion);
                } else if (this.motionQuery.addListener) {
                    this.motionQuery.addListener(this.boundReducedMotion);
                }
            }

            this.applyOptions(this.options);
            return this;
        }

        applyOptions(options) {
            this.options = { ...this.options, ...options };
            this.lowPower = detectLowPower();
            this.reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            this.density = clamp(Number(this.options.density ?? defaultDensity()) || defaultDensity(), 0.25, 1.4);
            this.maxDpr = this.lowPower ? 1.25 : 1.5;
            this.resize();
            this.rebuild();
            this.bindToggle(this.options.toggleId);
            if (!this.toggle && Object.prototype.hasOwnProperty.call(this.options, 'enabled')) {
                this.setEnabled(this.options.enabled !== false);
            } else if (!this.toggle) {
                this.setEnabled(this.enabled);
            }
        }

        bindToggle(toggleId) {
            const nextToggle = resolveElement(toggleId);
            if (this.toggle === nextToggle) return;
            if (this.toggle && this.boundToggleChange) {
                this.toggle.removeEventListener('change', this.boundToggleChange);
            }
            this.toggle = nextToggle;
            this.boundToggleChange = null;

            if (!this.toggle) return;
            this.boundToggleChange = () => this.setEnabled(this.toggle.checked);
            this.toggle.addEventListener('change', this.boundToggleChange);
            this.setEnabled(this.toggle.checked);
        }

        resize() {
            this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
            this.width = Math.max(1, this.container.clientWidth || window.innerWidth || 1);
            this.height = Math.max(1, this.container.clientHeight || window.innerHeight || 1);
            this.canvas.width = Math.floor(this.width * this.dpr);
            this.canvas.height = Math.floor(this.height * this.dpr);
            this.canvas.style.width = `${this.width}px`;
            this.canvas.style.height = `${this.height}px`;
            this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            this.frameInterval = 1000 / 45;
        }

        rebuild() {
            const viewportScale = clamp(Math.sqrt((this.width * this.height) / (1440 * 900)), 0.72, 1.2);
            const densityScale = viewportScale * this.density;
            const farFish = Math.max(4, Math.round((this.lowPower ? 12 : 22) * densityScale));
            const midFish = Math.max(6, Math.round((this.lowPower ? 16 : 28) * densityScale));
            const nearFish = Math.max(2, Math.round((this.lowPower ? 4 : 8) * densityScale));
            const particles = Math.max(10, Math.round((this.lowPower ? 25 : 55) * densityScale));

            this.fishes = [];
            this.particles = [];

            for (let i = 0; i < farFish; i += 1) {
                this.fishes.push(new AmbientFish(this, 0.45 + Math.random() * 0.22));
            }
            for (let i = 0; i < midFish; i += 1) {
                this.fishes.push(new AmbientFish(this, 0.72 + Math.random() * 0.28));
            }
            for (let i = 0; i < nearFish; i += 1) {
                this.fishes.push(new AmbientFish(this, 1 + Math.random() * 0.24));
            }
            for (let i = 0; i < particles; i += 1) {
                this.particles.push(new LightParticle(this));
            }
        }

        animate(time) {
            this.animationId = window.requestAnimationFrame(this.boundAnimate);
            const elapsed = time - this.lastTime;
            if (elapsed < this.frameInterval) return;

            const deltaScale = Math.min(elapsed / 16.67, 2);
            this.lastTime = time - (elapsed % this.frameInterval);
            this.ctx.clearRect(0, 0, this.width, this.height);

            for (let i = 0; i < this.particles.length; i += 1) {
                this.particles[i].update(deltaScale);
                this.particles[i].draw(this.ctx);
            }

            for (let i = 0; i < this.fishes.length; i += 1) {
                this.fishes[i].update(deltaScale);
                this.fishes[i].draw(this.ctx);
            }

            this.drawVignette();
        }

        drawVignette() {
            const gradient = this.ctx.createRadialGradient(
                this.width * 0.5, this.height * 0.5, this.height * 0.1,
                this.width * 0.5, this.height * 0.5, this.height * 0.75
            );
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(1, 'rgba(0,0,0,0.48)');
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(0, 0, this.width, this.height);
        }

        start() {
            if (!this.ctx || this.animationId || !this.enabled || this.reducedMotion || document.hidden) return;
            this.lastTime = performance.now();
            this.animationId = window.requestAnimationFrame(this.boundAnimate);
            this.container.classList.remove('is-disabled');
        }

        stop() {
            if (this.animationId) {
                window.cancelAnimationFrame(this.animationId);
                this.animationId = 0;
            }
        }

        clear() {
            if (this.ctx) this.ctx.clearRect(0, 0, this.width, this.height);
        }

        setEnabled(enabled) {
            this.enabled = Boolean(enabled);
            const active = this.enabled && !this.reducedMotion;
            this.container.classList.toggle('is-disabled', !active);
            if (!active) {
                this.stop();
                this.clear();
                return;
            }
            this.start();
        }

        onVisibilityChange() {
            if (document.hidden) {
                this.stop();
            } else if (this.enabled) {
                this.start();
            }
        }

        onResize() {
            window.clearTimeout(this.resizeTimer);
            this.resizeTimer = window.setTimeout(() => {
                this.resize();
                this.rebuild();
                if (this.enabled && !this.reducedMotion && !document.hidden) {
                    this.start();
                } else {
                    this.clear();
                }
            }, 140);
        }

        onReducedMotionChange() {
            this.reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            this.setEnabled(this.toggle ? this.toggle.checked : this.enabled);
        }

        destroy() {
            this.stop();
            window.clearTimeout(this.resizeTimer);
            document.removeEventListener('visibilitychange', this.boundVisibility);
            window.removeEventListener('resize', this.boundResize);
            if (this.motionQuery) {
                if (this.motionQuery.removeEventListener) {
                    this.motionQuery.removeEventListener('change', this.boundReducedMotion);
                } else if (this.motionQuery.removeListener) {
                    this.motionQuery.removeListener(this.boundReducedMotion);
                }
            }
            if (this.toggle && this.boundToggleChange) {
                this.toggle.removeEventListener('change', this.boundToggleChange);
            }
            this.canvas?.remove();
            this.glow?.remove();
            this.container.classList.remove('tsukuyomi-ambient-fish', 'is-disabled');
            delete this.container.__tsukuyomiAmbientFish;
        }
    }

    window.initTsukuyomiAmbientFish = function initTsukuyomiAmbientFish(options) {
        const settings = { ...DEFAULTS, ...(options || {}) };
        const container = resolveElement(settings.container || settings.containerId);
        if (!container) return null;
        if (container.__tsukuyomiAmbientFish) {
            container.__tsukuyomiAmbientFish.applyOptions(settings);
            return container.__tsukuyomiAmbientFish;
        }
        const controller = new AmbientFishController(container, settings).init();
        container.__tsukuyomiAmbientFish = controller;
        return controller;
    };
})();
