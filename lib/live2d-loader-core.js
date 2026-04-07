// src/types/renderer.ts
var BlendMode = /* @__PURE__ */ ((BlendMode2) => {
  BlendMode2[BlendMode2["Normal"] = 0] = "Normal";
  BlendMode2[BlendMode2["Additive"] = 1] = "Additive";
  BlendMode2[BlendMode2["Multiplicative"] = 2] = "Multiplicative";
  return BlendMode2;
})(BlendMode || {});

// src/events.ts
var EventBus = class {
  constructor() {
    this.listeners = /* @__PURE__ */ new Map();
  }
  on(event, listener) {
    let set = this.listeners.get(event);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return this;
  }
  off(event, listener) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }
  once(event, listener) {
    const wrapper = (payload) => {
      this.off(event, wrapper);
      listener(payload);
    };
    return this.on(event, wrapper);
  }
  emit(event, payload) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error(`[Live2DLoader] Error in event listener for "${event}":`, err);
      }
    }
  }
  removeAllListeners(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
};

// src/pipeline/middleware/resolve-url.ts
var resolveURL = async (ctx, next) => {
  ctx.onProgress("resolve", 0, 1);
  const source = ctx.source;
  if (typeof source === "string") {
    ctx.resolvedAsset = await ctx.assetResolver.resolve(source);
  } else if (typeof source === "object" && "url" in source && typeof source.url === "string") {
    ctx.resolvedAsset = await ctx.assetResolver.resolve(source.url);
  } else if (typeof source === "object" && "version" in source) {
    ctx.settings = source;
    ctx.resolvedAsset = {
      url: source.url,
      baseUrl: source.url.substring(0, source.url.lastIndexOf("/") + 1),
      sourceType: "url"
    };
  } else {
    throw new Error("[Live2DLoader] Invalid model source.");
  }
  ctx.onProgress("resolve", 1, 1);
  await next();
};

// src/pipeline/middleware/fetch-model-json.ts
var fetchModelJSON = async (ctx, next) => {
  if (ctx.settings) {
    await next();
    return;
  }
  if (!ctx.resolvedAsset) {
    throw new Error("[Live2DLoader] No resolved asset to fetch.");
  }
  ctx.onProgress("fetch-json", 0, 1);
  let url = ctx.resolvedAsset.url;
  if (url.endsWith("/")) {
    url = await resolveSettingsFile(url);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `[Live2DLoader] Failed to fetch model settings: ${response.status} ${response.statusText}`
    );
  }
  const json = await response.json();
  if (isModelListJSON(json)) {
    const baseUrl = url.substring(0, url.lastIndexOf("/") + 1);
    const modelUrl = await resolveModelFromList(json, baseUrl);
    const modelResp = await fetch(modelUrl);
    if (!modelResp.ok) {
      throw new Error(
        `[Live2DLoader] Failed to fetch model from list: ${modelResp.status} ${modelResp.statusText} (${modelUrl})`
      );
    }
    ctx.settingsJSON = await modelResp.json();
    ctx.resolvedAsset.url = modelUrl;
    ctx.resolvedAsset.baseUrl = modelUrl.substring(0, modelUrl.lastIndexOf("/") + 1);
  } else {
    ctx.settingsJSON = json;
    ctx.resolvedAsset.url = url;
    ctx.resolvedAsset.baseUrl = url.substring(0, url.lastIndexOf("/") + 1);
  }
  ctx.onProgress("fetch-json", 1, 1);
  await next();
};
function isModelListJSON(json) {
  return typeof json === "object" && json !== null && "models" in json && Array.isArray(json.models) && json.models.length > 0 && Array.isArray(json.models[0]);
}
async function resolveModelFromList(list, baseUrl) {
  const firstGroup = list.models[0];
  const modelPath = firstGroup[0];
  const candidates = [
    `${baseUrl}model/${modelPath}/index.json`,
    `${baseUrl}${modelPath}/index.json`,
    `${baseUrl}model/${modelPath}/model.json`,
    `${baseUrl}${modelPath}/model.json`,
    `${baseUrl}model/${modelPath}/model3.json`,
    `${baseUrl}${modelPath}/model3.json`
  ];
  for (const candidateUrl of candidates) {
    try {
      const resp = await fetch(candidateUrl, { method: "HEAD" });
      if (resp.ok) return candidateUrl;
    } catch {
    }
  }
  throw new Error(
    `[Live2DLoader] Could not resolve model "${modelPath}" from model list. Tried:
${candidates.map((c) => `  - ${c}`).join("\n")}`
  );
}
async function resolveSettingsFile(baseUrl) {
  const candidates = ["model3.json", "model.json", "index.json", "model_list.json"];
  for (const name of candidates) {
    const url = baseUrl + name;
    try {
      const resp = await fetch(url, { method: "HEAD" });
      if (resp.ok) return url;
    } catch {
    }
  }
  throw new Error(
    `[Live2DLoader] Could not find model settings file in ${baseUrl}. Tried: ${candidates.join(", ")}`
  );
}

// src/pipeline/middleware/detect-version.ts
var detectVersion = async (ctx, next) => {
  if (ctx.settings) {
    await next();
    return;
  }
  if (!ctx.settingsJSON) {
    throw new Error("[Live2DLoader] No settings JSON to detect version from.");
  }
  ctx.onProgress("detect-version", 0, 1);
  const json = ctx.settingsJSON;
  const baseUrl = ctx.resolvedAsset.baseUrl;
  if (isCubism3JSON(json)) {
    ctx.settings = normalizeCubism3(json, ctx.resolvedAsset.url, baseUrl);
  } else if (isCubism2JSON(json)) {
    ctx.settings = normalizeCubism2(json, ctx.resolvedAsset.url, baseUrl);
  } else {
    const keys = Object.keys(json).join(", ");
    throw new Error(
      `[Live2DLoader] Unrecognized model settings format. Expected a Cubism 2 model.json (with "model" + "textures") or Cubism 3/4/5 model3.json (with "FileReferences"). Got keys: ${keys}`
    );
  }
  if (ctx.options.cubismVersion) {
    ctx.settings.version = ctx.options.cubismVersion;
  }
  const adapter = ctx.adapters.find((a) => a.canHandle(ctx.settingsJSON));
  if (!adapter) {
    const explicit = ctx.adapters.find((a) => a.version === ctx.settings.version);
    if (!explicit) {
      throw new Error(
        `[Live2DLoader] No adapter found for Cubism version "${ctx.settings.version}". Registered adapters: ${ctx.adapters.map((a) => a.version).join(", ")}`
      );
    }
    ctx.adapter = explicit;
  } else {
    ctx.adapter = adapter;
  }
  ctx.onProgress("detect-version", 1, 1);
  await next();
};
function isCubism2JSON(json) {
  return typeof json === "object" && json !== null && "model" in json && "textures" in json && Array.isArray(json.textures);
}
function isCubism3JSON(json) {
  return typeof json === "object" && json !== null && "FileReferences" in json;
}
function normalizeCubism2(json, url, baseUrl) {
  return {
    version: "cubism2",
    url,
    name: json.name,
    moc: resolveRel(json.model, baseUrl),
    textures: json.textures.map((t) => resolveRel(t, baseUrl)),
    motionGroups: Object.fromEntries(
      Object.entries(json.motions ?? {}).map(([group, entries]) => [
        group,
        entries.map((e) => ({
          file: resolveRel(e.file, baseUrl),
          sound: e.sound ? resolveRel(e.sound, baseUrl) : void 0,
          fadeInTime: e.fade_in,
          fadeOutTime: e.fade_out
        }))
      ])
    ),
    expressions: (json.expressions ?? []).map((e) => ({
      name: e.name,
      file: resolveRel(e.file, baseUrl)
    })),
    physics: json.physics ? resolveRel(json.physics, baseUrl) : void 0,
    pose: json.pose ? resolveRel(json.pose, baseUrl) : void 0,
    hitAreas: (json.hit_areas ?? []).map((h) => ({ name: h.name, id: h.id })),
    layout: json.layout
  };
}
function normalizeCubism3(json, url, baseUrl) {
  const refs = json.FileReferences;
  const version = (json.Version ?? 3) >= 4 ? "cubism5" : "cubism5";
  return {
    version,
    url,
    moc: resolveRel(refs.Moc, baseUrl),
    textures: refs.Textures.map((t) => resolveRel(t, baseUrl)),
    motionGroups: Object.fromEntries(
      Object.entries(refs.Motions ?? {}).map(([group, entries]) => [
        group,
        entries.map((e) => ({
          file: resolveRel(e.File, baseUrl),
          sound: e.Sound ? resolveRel(e.Sound, baseUrl) : void 0,
          fadeInTime: e.FadeInTime,
          fadeOutTime: e.FadeOutTime
        }))
      ])
    ),
    expressions: (refs.Expressions ?? []).map((e) => ({
      name: e.Name,
      file: resolveRel(e.File, baseUrl)
    })),
    physics: refs.Physics ? resolveRel(refs.Physics, baseUrl) : void 0,
    pose: refs.Pose ? resolveRel(refs.Pose, baseUrl) : void 0,
    hitAreas: (json.HitAreas ?? []).map((h) => ({ name: h.Name, id: h.Id }))
  };
}
function resolveRel(path, baseUrl) {
  if (/^https?:\/\//i.test(path)) return path;
  return baseUrl + path;
}

// src/pipeline/middleware/load-cubism-core.ts
var loadCubismCore = async (ctx, next) => {
  const adapter = ctx.adapter;
  if (!adapter) {
    throw new Error("[Live2DLoader] No adapter selected before loading Cubism Core.");
  }
  ctx.onProgress("load-core", 0, 1);
  if (!adapter.isCoreLoaded()) {
    const corePath = ctx.options.cubismCorePath ?? adapter.defaultCorePath;
    await adapter.loadCore(corePath);
  }
  ctx.onProgress("load-core", 1, 1);
  await next();
};

// src/pipeline/middleware/load-textures.ts
var loadTextures = async (ctx, next) => {
  if (!ctx.settings) {
    throw new Error("[Live2DLoader] No model settings available for texture loading.");
  }
  const texturePaths = ctx.settings.textures;
  ctx.onProgress("load-textures", 0, texturePaths.length);
  const textures = await Promise.all(
    texturePaths.map(async (url, index) => {
      const image = await loadImage(url);
      ctx.onProgress("load-textures", index + 1, texturePaths.length);
      return { image };
    })
  );
  ctx._textures = textures;
  await next();
};
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`[Live2DLoader] Failed to load texture: ${url}`));
    img.src = url;
  });
}

// src/pipeline/middleware/create-model.ts
var createModel = async (ctx, next) => {
  const adapter = ctx.adapter;
  const settings = ctx.settings;
  if (!adapter || !settings) {
    throw new Error("[Live2DLoader] Adapter and settings are required to create a model.");
  }
  ctx.onProgress("create-model", 0, 1);
  const model = await adapter.createModel(settings, ctx.options);
  const textures = ctx._textures;
  if (textures) {
    model.textures = textures;
  }
  model.ready = true;
  ctx.model = model;
  ctx.onProgress("create-model", 1, 1);
  await next();
};

// src/pipeline/load-pipeline.ts
var LoadPipeline = class {
  constructor(customMiddleware) {
    this.middleware = customMiddleware ?? [
      resolveURL,
      fetchModelJSON,
      detectVersion,
      loadCubismCore,
      loadTextures,
      createModel
    ];
  }
  /** Insert middleware before the pipeline runs */
  use(mw) {
    this.middleware.push(mw);
    return this;
  }
  /** Insert middleware at a specific position */
  useAt(index, mw) {
    this.middleware.splice(index, 0, mw);
    return this;
  }
  /** Execute the pipeline to load a model */
  async load(source, options, adapters, assetResolver, eventBus) {
    const context = {
      source,
      options,
      adapters,
      assetResolver,
      onProgress: (stage, progress, total) => {
        eventBus.emit("load:progress", {
          stage,
          progress,
          total
        });
      }
    };
    await this.execute(context, 0);
    if (!context.model) {
      throw new Error("[Live2DLoader] Pipeline completed but no model was created.");
    }
    return context.model;
  }
  async execute(context, index) {
    if (index >= this.middleware.length) return;
    const mw = this.middleware[index];
    await mw(context, () => this.execute(context, index + 1));
  }
};

// src/model-manager.ts
var ModelManager = class {
  constructor(adapters, renderer, assetResolver, eventBus, customMiddleware) {
    this.adapters = adapters;
    this.renderer = renderer;
    this.assetResolver = assetResolver;
    this.eventBus = eventBus;
    this.models = /* @__PURE__ */ new Map();
    this.modelIdCounter = 0;
    this.pipeline = new LoadPipeline(customMiddleware);
  }
  /** Load a model from any supported source */
  async loadModel(source, options = {}) {
    const sourceStr = typeof source === "string" ? source : "(object)";
    this.eventBus.emit("load:start", { source: sourceStr });
    if (!options.gl && this.renderer.getGL) {
      const gl = this.renderer.getGL();
      if (gl) options = { ...options, gl };
    }
    try {
      const model = await this.pipeline.load(
        source,
        options,
        this.adapters,
        this.assetResolver,
        this.eventBus
      );
      model.id = `model_${++this.modelIdCounter}`;
      const adapter = this.adapters.find((a) => a.version === model.version);
      if (!adapter) {
        throw new Error(`[Live2DLoader] No adapter for version ${model.version}`);
      }
      const modelRenderer = this.renderer.createModelRenderer();
      const textures = model.textures.map((t, i) => ({
        index: i,
        image: t.image,
        width: t.image instanceof HTMLImageElement ? t.image.naturalWidth : t.image.width,
        height: t.image instanceof HTMLImageElement ? t.image.naturalHeight : t.image.height
      }));
      modelRenderer.setTextures(textures);
      if (adapter.setupTextures && this.renderer.getGL) {
        const gl = this.renderer.getGL();
        if (gl) adapter.setupTextures(model, gl);
      }
      this.models.set(model.id, { model, adapter, modelRenderer });
      this.eventBus.emit("load:complete", { modelId: model.id });
      this.eventBus.emit("model:ready", { modelId: model.id });
      return model.id;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.eventBus.emit("load:error", { source: sourceStr, error });
      throw error;
    }
  }
  /** Update all models for a frame */
  update(deltaTime) {
    for (const { model, adapter } of this.models.values()) {
      if (!model.ready) continue;
      adapter.updateModel(model, deltaTime);
    }
  }
  /** Draw all models */
  draw() {
    this.renderer.beginFrame();
    for (const { model, adapter, modelRenderer } of this.models.values()) {
      if (!model.ready) continue;
      if (adapter.drawModel && adapter.drawModel(model)) {
        continue;
      }
      const drawables = adapter.getDrawables(model);
      modelRenderer.draw(drawables, model.modelMatrix);
    }
    this.renderer.endFrame();
  }
  /** Perform hit testing across all models */
  hitTest(x, y) {
    for (const { model, adapter } of this.models.values()) {
      if (!model.ready) continue;
      const hit = adapter.hitTest(model, x, y);
      if (hit) return { modelId: model.id, hitArea: hit };
    }
    return null;
  }
  /** Remove and destroy a model */
  removeModel(modelId) {
    const managed = this.models.get(modelId);
    if (!managed) return;
    managed.modelRenderer.destroy();
    managed.adapter.destroyModel(managed.model);
    this.models.delete(modelId);
    this.eventBus.emit("model:destroy", { modelId });
  }
  /** Get a model by ID */
  getModel(modelId) {
    return this.models.get(modelId)?.model;
  }
  /** Get all model IDs */
  getModelIds() {
    return [...this.models.keys()];
  }
  /** Destroy all models */
  destroy() {
    for (const id of this.models.keys()) {
      this.removeModel(id);
    }
  }
};

// src/motion-manager.ts
var MotionManager = class {
  constructor(eventBus, idleInterval = 5e3) {
    this.eventBus = eventBus;
    this.idleInterval = idleInterval;
    this.currentMotion = /* @__PURE__ */ new Map();
    this.idleMotionGroup = "idle";
    this.idleTimers = /* @__PURE__ */ new Map();
  }
  /**
   * Start a motion on a model.
   * The actual motion application is delegated to the adapter.
   */
  startMotion(modelId, group, index, _priority = "normal") {
    this.currentMotion.set(modelId, { group, index });
    this.eventBus.emit("motion:start", { modelId, group, index });
  }
  /** Notify that a motion has ended */
  endMotion(modelId, group, index) {
    this.currentMotion.delete(modelId);
    this.eventBus.emit("motion:end", { modelId, group, index });
  }
  /** Set the expression for a model */
  setExpression(modelId, name) {
    this.eventBus.emit("expression:set", { modelId, name });
  }
  /** Start random idle motion on a timer */
  startIdleMotion(modelId, motionGroups) {
    this.stopIdleMotion(modelId);
    const idleMotions = motionGroups[this.idleMotionGroup];
    if (!idleMotions || idleMotions.length === 0) return;
    const tick = () => {
      const index = Math.floor(Math.random() * idleMotions.length);
      this.startMotion(modelId, this.idleMotionGroup, index, "idle");
      this.idleTimers.set(modelId, setTimeout(tick, this.idleInterval + Math.random() * 2e3));
    };
    this.idleTimers.set(modelId, setTimeout(tick, this.idleInterval));
  }
  /** Stop idle motion timer */
  stopIdleMotion(modelId) {
    const timer = this.idleTimers.get(modelId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(modelId);
    }
  }
  /** Get current motion for a model */
  getCurrentMotion(modelId) {
    return this.currentMotion.get(modelId);
  }
  /** Set the idle motion group name */
  setIdleMotionGroup(group) {
    this.idleMotionGroup = group;
  }
  destroy() {
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();
    this.currentMotion.clear();
  }
};

// src/interaction-manager.ts
var InteractionManager = class {
  constructor(modelManager, eventBus) {
    this.modelManager = modelManager;
    this.eventBus = eventBus;
    this.canvas = null;
    this.isPointerOver = false;
    this.boundHandlers = {
      pointerMove: this.onPointerMove.bind(this),
      pointerDown: this.onPointerDown.bind(this),
      pointerEnter: this.onPointerEnter.bind(this),
      pointerLeave: this.onPointerLeave.bind(this)
    };
    /** Normalized pointer position (-1 to 1), used for focus/gaze tracking */
    this.pointerX = 0;
    this.pointerY = 0;
  }
  /** Attach event listeners to a canvas element */
  attach(canvas) {
    this.detach();
    this.canvas = canvas;
    canvas.addEventListener("pointermove", this.boundHandlers.pointerMove);
    canvas.addEventListener("pointerdown", this.boundHandlers.pointerDown);
    canvas.addEventListener("pointerenter", this.boundHandlers.pointerEnter);
    canvas.addEventListener("pointerleave", this.boundHandlers.pointerLeave);
  }
  /** Remove event listeners */
  detach() {
    if (!this.canvas) return;
    this.canvas.removeEventListener("pointermove", this.boundHandlers.pointerMove);
    this.canvas.removeEventListener("pointerdown", this.boundHandlers.pointerDown);
    this.canvas.removeEventListener("pointerenter", this.boundHandlers.pointerEnter);
    this.canvas.removeEventListener("pointerleave", this.boundHandlers.pointerLeave);
    this.canvas = null;
  }
  onPointerMove(e) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointerX = (e.clientX - rect.left) / rect.width * 2 - 1;
    this.pointerY = -((e.clientY - rect.top) / rect.height * 2 - 1);
  }
  onPointerDown(e) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height * 2 - 1);
    const hit = this.modelManager.hitTest(x, y);
    if (hit) {
      this.eventBus.emit("hit", {
        modelId: hit.modelId,
        hitArea: hit.hitArea,
        x,
        y
      });
    }
  }
  onPointerEnter(_e) {
    this.isPointerOver = true;
    for (const modelId of this.modelManager.getModelIds()) {
      this.eventBus.emit("pointer:enter", { modelId });
    }
  }
  onPointerLeave(_e) {
    this.isPointerOver = false;
    this.pointerX = 0;
    this.pointerY = 0;
    for (const modelId of this.modelManager.getModelIds()) {
      this.eventBus.emit("pointer:leave", { modelId });
    }
  }
  destroy() {
    this.detach();
  }
};

// src/asset-resolver.ts
var DefaultAssetResolver = class {
  constructor(options) {
    this.builtins = /* @__PURE__ */ new Map();
    this.npmCdnTemplate = options?.npmCdnTemplate ?? "https://unpkg.com/{package}/";
  }
  async resolve(source) {
    if (source.startsWith("builtin:")) {
      return this.resolveBuiltin(source.slice("builtin:".length));
    }
    if (this.isFullUrl(source)) {
      return this.resolveUrl(source);
    }
    if (source.startsWith("@") || /^[a-z][\w.-]*$/i.test(source)) {
      return this.resolveNpm(source);
    }
    return this.resolveLocal(source);
  }
  resolveRelative(relativePath, baseUrl) {
    if (this.isFullUrl(relativePath)) return relativePath;
    const base = baseUrl.endsWith("/") ? baseUrl : baseUrl.substring(0, baseUrl.lastIndexOf("/") + 1);
    return new URL(relativePath, base).href;
  }
  registerBuiltin(name, url, description) {
    this.builtins.set(name, { name, url, description });
  }
  isFullUrl(source) {
    return /^https?:\/\//i.test(source);
  }
  resolveUrl(url) {
    const baseUrl = url.substring(0, url.lastIndexOf("/") + 1);
    return { url, baseUrl, sourceType: "url" };
  }
  resolveNpm(packageName) {
    const url = this.npmCdnTemplate.replace("{package}", packageName);
    return { url, baseUrl: url, sourceType: "npm" };
  }
  resolveLocal(path) {
    const normalized = path.startsWith("/") ? path : `./${path}`;
    const baseUrl = normalized.substring(0, normalized.lastIndexOf("/") + 1);
    return { url: normalized, baseUrl, sourceType: "local" };
  }
  resolveBuiltin(name) {
    const entry = this.builtins.get(name);
    if (!entry) {
      throw new Error(
        `[Live2DLoader] Built-in model "${name}" not found. Register it first with registerBuiltin().`
      );
    }
    return this.resolveUrl(entry.url);
  }
};

// src/loader.ts
var Live2DLoader = class _Live2DLoader {
  constructor(options) {
    this.options = options;
    this.canvas = null;
    this.animationFrameId = null;
    this.lastTimestamp = 0;
    this.running = false;
    this.renderErrorCount = 0;
    this.tick = (timestamp) => {
      if (!this.running) return;
      const deltaTime = (timestamp - this.lastTimestamp) / 1e3;
      this.lastTimestamp = timestamp;
      try {
        this.models.update(deltaTime);
        this.models.draw();
        this.events.emit("render:frame", { deltaTime });
        this.renderErrorCount = 0;
      } catch (err) {
        this.renderErrorCount++;
        const error = err instanceof Error ? err : new Error(String(err));
        this.events.emit("render:error", { error });
        if (this.renderErrorCount >= _Live2DLoader.MAX_RENDER_ERRORS) {
          console.error("[Live2DLoader] Too many consecutive render errors, stopping render loop.");
          this.running = false;
          return;
        }
      }
      this.animationFrameId = requestAnimationFrame(this.tick);
    };
    this.events = new EventBus();
    const assetResolver = options.assetResolver ?? new DefaultAssetResolver();
    this.models = new ModelManager(
      options.adapters,
      options.renderer,
      assetResolver,
      this.events,
      options.middleware
    );
    this.motions = new MotionManager(this.events);
    this.interactions = new InteractionManager(this.models, this.events);
  }
  /** Initialize the loader with a canvas element */
  mount(canvas) {
    this.canvas = canvas;
    this.options.renderer.initialize(canvas);
    this.interactions.attach(canvas);
    if (this.options.autoStart !== false) {
      this.start();
    }
  }
  /** Load a model and add it to the scene */
  async loadModel(source, options) {
    return this.models.loadModel(source, options);
  }
  /** Remove a model by ID */
  removeModel(modelId) {
    this.motions.stopIdleMotion(modelId);
    this.models.removeModel(modelId);
  }
  /** Start the render loop */
  start() {
    if (this.running) return;
    this.running = true;
    this.lastTimestamp = performance.now();
    this.tick(this.lastTimestamp);
  }
  /** Stop the render loop */
  stop() {
    this.running = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
  /** Resize the renderer */
  resize(width, height) {
    this.options.renderer.resize(width, height);
  }
  /** Subscribe to events */
  on(event, listener) {
    this.events.on(event, listener);
    return this;
  }
  /** Unsubscribe from events */
  off(event, listener) {
    this.events.off(event, listener);
    return this;
  }
  /** Release all resources */
  destroy() {
    this.stop();
    this.interactions.destroy();
    this.motions.destroy();
    this.models.destroy();
    this.options.renderer.destroy();
    this.events.removeAllListeners();
  }
  static {
    this.MAX_RENDER_ERRORS = 5;
  }
};
function createLive2DLoader(options) {
  return new Live2DLoader(options);
}

window.Live2DLoaderCore = { BlendMode, DefaultAssetResolver, EventBus, InteractionManager, Live2DLoader, LoadPipeline, ModelManager, MotionManager, createLive2DLoader, createModel, detectVersion, fetchModelJSON, loadCubismCore, loadTextures, resolveURL };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map