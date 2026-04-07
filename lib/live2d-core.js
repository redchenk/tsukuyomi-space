/**
 * Live2D Cubism 5 WebGL Renderer - Simplified Direct Implementation
 */

(function() {
  'use strict';

  // ============================================================
  // Shaders - Simple passthrough
  // ============================================================

  var VERTEX_SHADER = [
    'precision mediump float;',
    'attribute vec2 aPosition;',
    'attribute vec2 aTexCoord;',
    'uniform mat4 uMatrix;',
    'varying vec2 vTexCoord;',
    'void main(void) {',
    '  gl_Position = uMatrix * vec4(aPosition, 0.0, 1.0);',
    '  vTexCoord = aTexCoord;',
    '}'
  ].join('\n');

  var FRAGMENT_SHADER = [
    'precision mediump float;',
    'varying vec2 vTexCoord;',
    'uniform sampler2D uTexture;',
    'uniform float uAlpha;',
    'void main(void) {',
    '  vec4 color = texture2D(uTexture, vTexCoord);',
    '  gl_FragColor = vec4(color.rgb, color.a * uAlpha);',
    '}'
  ].join('\n');

  // ============================================================
  // LAppModel
  // ============================================================

  var LAppModel = function(gl, canvas) {
    this._gl = gl;
    this._canvas = canvas;
    this._model = null;
    this._textures = [];
    this._modelHomeDir = '';
    this._modelSetting = null;
    this._motions = {};
    this._expressions = {};
    this._dragX = 0;
    this._dragY = 0;
    this._userTimeSeconds = 0;
    this._initialized = false;
    this._shader = null;
    this._buffers = {};
    this._frameCount = 0;
  };

  LAppModel.prototype.load = function(dir, fileName, callback) {
    var thisModel = this;
    this._modelHomeDir = dir;

    console.log('Loading model from:', dir + fileName);

    fetch(dir + fileName)
      .then(function(r) { return r.json(); })
      .then(function(json) {
        console.log('Model JSON loaded:', json);
        thisModel._modelSetting = json;
        var mocPath = dir + json.FileReferences.Moc;
        console.log('Loading moc:', mocPath);
        return fetch(mocPath);
      })
      .then(function(r) { return r.arrayBuffer(); })
      .then(function(buffer) {
        console.log('Moc loaded, creating model...');
        thisModel._createModel(buffer);
        thisModel._loadTextures(function() {
          thisModel._initialized = true;
          console.log('Model ready for rendering');
          if (callback) callback(thisModel);
        });
      })
      .catch(function(e) {
        console.error('Load error:', e);
      });
  };

  LAppModel.prototype._createModel = function(buffer) {
    var core = Live2DCubismCore;
    if (!core) { console.error('Core not found'); return; }

    var moc = core.Moc.fromArrayBuffer(buffer);
    if (!moc) { console.error('Moc create failed'); return; }

    this._model = core.Model.fromMoc(moc);
    if (!this._model) { console.error('Model create failed'); return; }

    console.log('Model created, canvas:', this._model.canvasinfo.CanvasWidth, 'x', this._model.canvasinfo.CanvasHeight);

    this._setupShaders();
  };

  LAppModel.prototype._setupShaders = function() {
    var gl = this._gl;

    var vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, VERTEX_SHADER);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error('VS error:', gl.getShaderInfoLog(vs));
    }

    var fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, FRAGMENT_SHADER);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error('FS error:', gl.getShaderInfoLog(fs));
    }

    this._shader = gl.createProgram();
    gl.attachShader(this._shader, vs);
    gl.attachShader(this._shader, fs);
    gl.linkProgram(this._shader);
    if (!gl.getProgramParameter(this._shader, gl.LINK_STATUS)) {
      console.error('Link error:', gl.getProgramInfoLog(this._shader));
    }

    this._shader.aPosition = gl.getAttribLocation(this._shader, 'aPosition');
    this._shader.aTexCoord = gl.getAttribLocation(this._shader, 'aTexCoord');
    this._shader.uMatrix = gl.getUniformLocation(this._shader, 'uMatrix');
    this._shader.uTexture = gl.getUniformLocation(this._shader, 'uTexture');
    this._shader.uAlpha = gl.getUniformLocation(this._shader, 'uAlpha');

    console.log('Shaders compiled');
  };

  LAppModel.prototype._loadTextures = function(callback) {
    var textures = this._modelSetting.FileReferences.Textures || [];
    if (textures.length === 0) { callback(); return; }

    var loaded = 0;
    var gl = this._gl;
    var self = this;

    console.log('Loading', textures.length, 'textures');

    textures.forEach(function(path, i) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() {
        console.log('Texture', i, 'loaded:', img.width, 'x', img.height);
        var tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        self._textures[i] = tex;
        loaded++;
        if (loaded >= textures.length) {
          console.log('All textures loaded');
          callback();
        }
      };
      img.onerror = function() {
        console.error('Texture load failed:', path);
        loaded++;
        if (loaded >= textures.length) callback();
      };
      img.src = self._modelHomeDir + path;
    });
  };

  LAppModel.prototype.update = function(deltaTime) {
    if (!this._initialized || !this._model) return;
    this._userTimeSeconds += deltaTime;
    this._model.update();
  };

  LAppModel.prototype.draw = function() {
    if (!this._initialized || !this._model || !this._gl) return;

    var gl = this._gl;
    gl.useProgram(this._shader);

    var drawables = this._model.drawables;
    var count = drawables.count;
    var modelW = this._model.canvasinfo.CanvasWidth;
    var modelH = this._model.canvasinfo.CanvasHeight;
    var canvasW = this._canvas.width;
    var canvasH = this._canvas.height;

    this._frameCount++;
    if (this._frameCount === 1) {
      console.log('First draw - model:', modelW, 'x', modelH, 'canvas:', canvasW, 'x', canvasH);
    }

    // Calculate scale to fit model into canvas
    var scaleX = canvasW / modelW;
    var scaleY = canvasH / modelH;
    var scale = Math.min(scaleX, scaleY);

    // Matrix to convert model coords to NDC and apply canvas transform
    // X_ndc = x / modelW * 2 * scale - 1 + offset
    // Y_ndc = -(y / modelH * 2 * scale) + 1 - offset (flipped)
    var s = scale * 2;
    var tx = -1 + (canvasW - modelW * scale) / canvasW;
    var ty = 1 - (canvasH - modelH * scale) / canvasH;

    var matrix = new Float32Array([
      s / modelW, 0, 0, 0,
      0, -s / modelH, 0, 0,
      0, 0, 1, 0,
      tx, ty, 0, 1
    ]);

    gl.uniformMatrix4fv(this._shader.uMatrix, false, matrix);

    // Draw each mesh
    for (var i = 0; i < count; i++) {
      var texIdx = drawables.textureIndices[i];

      if (texIdx < 0 || texIdx >= this._textures.length) continue;

      var opacity = drawables.opacities[i];
      if (opacity <= 0.001) continue;

      var verts = drawables.vertexPositions[i];
      var uvs = drawables.vertexUvs[i];
      var indices = drawables.indices[i];

      if (!verts || !uvs || !indices) continue;
      if (verts.length === 0) continue;

      if (this._frameCount === 1 && i < 3) {
        console.log('  Drawable', i, 'verts:', verts.length, 'indices:', indices.length, 'texIdx:', texIdx);
      }

      // Position buffer - pass model coords directly
      if (!this._buffers[i]) this._buffers[i] = {};
      if (!this._buffers[i].position) {
        this._buffers[i].position = gl.createBuffer();
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers[i].position);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(this._shader.aPosition);
      gl.vertexAttribPointer(this._shader.aPosition, 2, gl.FLOAT, false, 0, 0);

      // UV buffer
      if (!this._buffers[i].uv) {
        this._buffers[i].uv = gl.createBuffer();
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers[i].uv);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(this._shader.aTexCoord);
      gl.vertexAttribPointer(this._shader.aTexCoord, 2, gl.FLOAT, false, 0, 0);

      // Index buffer
      if (!this._buffers[i].index) {
        this._buffers[i].index = gl.createBuffer();
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._buffers[i].index);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

      // Texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._textures[texIdx]);
      gl.uniform1i(this._shader.uTexture, 0);
      gl.uniform1f(this._shader.uAlpha, opacity);

      // Draw
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    }

    if (this._frameCount === 1) {
      console.log('Draw complete, scale:', scale);
    }
  };

  LAppModel.prototype.setDrag = function(x, y) {
    this._dragX = x;
    this._dragY = y;
  };

  LAppModel.prototype.startRandomMotion = function(group) {
    // Simplified - just log
    console.log('Motion:', group);
  };

  LAppModel.prototype.hitTest = function(x, y) {
    var areas = this._modelSetting.HitAreas || [];
    for (var i = 0; i < areas.length; i++) {
      if (areas[i].Name === 'Head' || areas[i].Name === 'Body') return areas[i].Name;
    }
    return null;
  };

  LAppModel.prototype.isInitialized = function() { return this._initialized; };

  window.LAppModel = LAppModel;

})();
