// src/cubism5-adapter.ts
var BLEND_ADDITIVE = 1 << 0;
var BLEND_MULTIPLICATIVE = 1 << 1;
var IS_VISIBLE = 1 << 0;
var Cubism5Adapter = class {
  constructor() {
    this.version = "cubism5";
    this.defaultCorePath = "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js";
  }
  isCoreLoaded() {
    return typeof window !== "undefined" && !!window.Live2DCubismCore;
  }
  async loadCore(corePath) {
    if (this.isCoreLoaded()) return;
    const url = corePath ?? this.defaultCorePath;
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.onload = () => {
        if (this.isCoreLoaded()) {
          resolve();
        } else {
          reject(
            new Error(
              "[Cubism5Adapter] Core script loaded but Live2DCubismCore not found in global scope."
            )
          );
        }
      };
      script.onerror = () => reject(new Error(`[Cubism5Adapter] Failed to load Cubism Core from: ${url}`));
      document.head.appendChild(script);
    });
  }
  canHandle(json) {
    if (typeof json !== "object" || json === null) return false;
    return "FileReferences" in json;
  }
  async createModel(settings, _options) {
    const core = window.Live2DCubismCore;
    if (!core) {
      throw new Error("[Cubism5Adapter] Cubism Core is not loaded.");
    }
    const mocResponse = await fetch(settings.moc);
    if (!mocResponse.ok) {
      throw new Error(`[Cubism5Adapter] Failed to fetch .moc3 file: ${settings.moc}`);
    }
    const mocBuffer = await mocResponse.arrayBuffer();
    const moc = core.Moc.fromArrayBuffer(mocBuffer);
    if (!moc) {
      throw new Error("[Cubism5Adapter] Failed to create Moc from buffer.");
    }
    const coreModel = core.Model.fromMoc(moc);
    if (!coreModel) {
      throw new Error("[Cubism5Adapter] Failed to create Model from Moc.");
    }
    const modelMatrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    return {
      id: "",
      version: "cubism5",
      settings,
      coreModel,
      textures: [],
      modelMatrix,
      ready: false
    };
  }
  updateModel(model, _deltaTime) {
    const coreModel = model.coreModel;
    coreModel.update();
  }
  getDrawables(model) {
    const cm = model.coreModel;
    const d = cm.drawables;
    const meshes = [];
    for (let i = 0; i < d.count; i++) {
      const constFlags = d.constantFlags[i];
      const dynFlags = d.dynamicFlags[i];
      let blendMode;
      if (constFlags & BLEND_ADDITIVE) {
        blendMode = 1;
      } else if (constFlags & BLEND_MULTIPLICATIVE) {
        blendMode = 2;
      } else {
        blendMode = 0;
      }
      const maskIndices = [];
      if (d.maskCounts[i] > 0 && d.masks[i]) {
        for (let m = 0; m < d.maskCounts[i]; m++) {
          maskIndices.push(d.masks[i][m]);
        }
      }
      meshes.push({
        index: i,
        textureIndex: d.textureIndices[i],
        vertexPositions: d.vertexPositions[i],
        uvs: d.vertexUvs[i],
        indices: d.indices[i],
        opacity: d.opacities[i],
        blendMode,
        invertedMask: false,
        renderOrder: d.renderOrders[i],
        dynamicFlag: dynFlags !== 0,
        maskIndices,
        visible: (dynFlags & IS_VISIBLE) !== 0 || d.opacities[i] > 0
      });
    }
    meshes.sort((a, b) => a.renderOrder - b.renderOrder);
    return meshes;
  }
  hitTest(model, x, y) {
    const settings = model.settings;
    if (!settings.hitAreas || settings.hitAreas.length === 0) return null;
    const cm = model.coreModel;
    const d = cm.drawables;
    for (const area of settings.hitAreas) {
      const drawIndex = d.ids.indexOf(area.id);
      if (drawIndex < 0) continue;
      const verts = d.vertexPositions[drawIndex];
      if (!verts) continue;
      if (isPointInMesh(x, y, verts)) {
        return area.name;
      }
    }
    return null;
  }
  destroyModel(model) {
    const coreModel = model.coreModel;
    coreModel.release();
    model.coreModel = null;
    model.ready = false;
  }
};
function isPointInMesh(px, py, vertices) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < vertices.length; i += 2) {
    const vx = vertices[i];
    const vy = vertices[i + 1];
    if (vx < minX) minX = vx;
    if (vx > maxX) maxX = vx;
    if (vy < minY) minY = vy;
    if (vy > maxY) maxY = vy;
  }
  return px >= minX && px <= maxX && py >= minY && py <= maxY;
}

export { Cubism5Adapter };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map