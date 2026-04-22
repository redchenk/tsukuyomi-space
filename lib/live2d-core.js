/**
 * Live2D Cubism 5 WebGL Renderer - Clean Implementation
 * Based on standard Live2D WebGL rendering approach
 */

(function() {
  'use strict';

  // ========================================================================
  // Shaders
  // ========================================================================

  var VERTEX_SHADER = [
    'precision mediump float;',
    'attribute vec2 aPosition;',
    'attribute vec2 aTexCoord;',
    'varying vec2 vTexCoord;',
    'uniform mat4 uProjectionMatrix;',
    'uniform mat4 uModelMatrix;',
    'void main() {',
    '  gl_Position = uProjectionMatrix * uModelMatrix * vec4(aPosition, 0.0, 1.0);',
    '  vTexCoord = aTexCoord;',
    '}'
  ].join('\n');

  var FRAGMENT_SHADER = [
    'precision mediump float;',
    'varying vec2 vTexCoord;',
    'uniform sampler2D uTexture;',
    'uniform float uOpacity;',
    'void main() {',
    '  vec4 color = texture2D(uTexture, vTexCoord);',
    '  if (color.a < 0.001) discard;',
    '  gl_FragColor = vec4(color.rgb, color.a * uOpacity);',
    '}'
  ].join('\n');

  // ========================================================================
  // Matrix utilities (column-major for WebGL)
  // ========================================================================

  var mat4 = {
    create: function() {
      return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    },
    identity: function(out) {
      out.fill(0);
      out[0] = out[5] = out[10] = out[15] = 1;
      return out;
    },
    ortho: function(out, left, right, bottom, top, near, far) {
      var lr = 1 / (left - right);
      var bt = 1 / (bottom - top);
      var nf = 1 / (near - far);
      out[0] = -2 * lr; out[1] = 0; out[2] = 0; out[3] = 0;
      out[4] = 0; out[5] = -2 * bt; out[6] = 0; out[7] = 0;
      out[8] = 0; out[9] = 0; out[10] = 2 * nf; out[11] = 0;
      out[12] = (left + right) * lr;
      out[13] = (top + bottom) * bt;
      out[14] = (far + near) * nf;
      out[15] = 1;
      return out;
    },
    multiply: function(out, a, b) {
      var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      var b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
      out[0] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
      out[1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
      out[2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
      out[3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
      b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
      out[4] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
      out[5] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
      out[6] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
      out[7] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
      b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
      out[8] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
      out[9] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
      out[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
      out[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
      b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
      out[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
      out[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
      out[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
      out[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
      return out;
    },
    translate: function(out, v) {
      var x = v[0], y = v[1];
      out[12] = out[0]*x + out[4]*y + out[12];
      out[13] = out[1]*x + out[5]*y + out[13];
      out[14] = out[2]*x + out[6]*y + out[14];
      out[15] = out[3]*x + out[7]*y + out[15];
      return out;
    },
    scale: function(out, v) {
      var x = v[0], y = v[1];
      out[0] *= x; out[1] *= x; out[2] *= x; out[3] *= x;
      out[4] *= y; out[5] *= y; out[6] *= y; out[7] *= y;
      return out;
    }
  };

  // ========================================================================
  // LAppModel
  // ========================================================================

  var LAppModel = function(gl, canvas) {
    this._gl = gl;
    this._canvas = canvas;
    this._model = null;
    this._textures = [];
    this._modelHomeDir = '';
    this._modelSetting = null;
    this._shaderProgram = null;
    this._buffers = {};
    this._frameCount = 0;
    this._initialized = false;
    this._canvasWidth = 0;
    this._canvasHeight = 0;

    // Matrices
    this._projectionMatrix = mat4.create();
    this._modelMatrix = mat4.create();
    this._mvpMatrix = mat4.create();
  };

  LAppModel.prototype.load = function(dir, fileName, callback) {
    var self = this;
    this._modelHomeDir = dir;

    console.log('[LAppModel] Loading model from:', dir + fileName);

    fetch(dir + fileName)
      .then(function(r) { return r.json(); })
      .then(function(json) {
        console.log('[LAppModel] Model JSON loaded');
        self._modelSetting = json;
        var mocPath = dir + json.FileReferences.Moc;
        return fetch(mocPath);
      })
      .then(function(r) { return r.arrayBuffer(); })
      .then(function(buffer) {
        console.log('[LAppModel] Moc loaded, creating model...');
        self._createModel(buffer);
        self._setupShaders();
        self._loadTextures(function() {
          self._initialized = true;
          console.log('[LAppModel] Model ready');
          if (callback) callback(self);
        });
      })
      .catch(function(e) {
        console.error('[LAppModel] Load error:', e);
      });
  };

  LAppModel.prototype._createModel = function(buffer) {
    var core = window.Live2DCubismCore;
    if (!core) {
      console.error('[LAppModel] Core not found');
      return;
    }

    var moc = core.Moc.fromArrayBuffer(buffer);
    if (!moc) {
      console.error('[LAppModel] Moc create failed');
      return;
    }

    this._model = core.Model.fromMoc(moc);
    if (!this._model) {
      console.error('[LAppModel] Model create failed');
      return;
    }

    this._canvasWidth = this._model.canvasinfo.CanvasWidth;
    this._canvasHeight = this._model.canvasinfo.CanvasHeight;
    console.log('[LAppModel] Canvas:', this._canvasWidth, 'x', this._canvasHeight);

    // Setup projection matrix (orthographic, centered at model center)
    // Model space: -1 to 1 in the smaller dimension, larger dimension clipped
    var scale = 2.0 / Math.max(this._canvasWidth, this._canvasHeight);
    mat4.identity(this._projectionMatrix);
    mat4.ortho(this._projectionMatrix,
      -this._canvasWidth * scale / 2, this._canvasWidth * scale / 2,
      -this._canvasHeight * scale / 2, this._canvasHeight * scale / 2,
      -1, 1);

    // Model matrix - center the model
    mat4.identity(this._modelMatrix);
    // Translate to center (model coordinates are centered at 0,0)
    mat4.translate(this._modelMatrix, [0, 0]);
    // Scale to fit
    mat4.scale(this._modelMatrix, [scale, scale]);

    console.log('[LAppModel] Matrix setup complete');
  };

  LAppModel.prototype._setupShaders = function() {
    var gl = this._gl;

    var vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, VERTEX_SHADER);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error('[LAppModel] VS error:', gl.getShaderInfoLog(vs));
    }

    var fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, FRAGMENT_SHADER);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error('[LAppModel] FS error:', gl.getShaderInfoLog(fs));
    }

    this._shaderProgram = gl.createProgram();
    gl.attachShader(this._shaderProgram, vs);
    gl.attachShader(this._shaderProgram, fs);
    gl.linkProgram(this._shaderProgram);
    if (!gl.getProgramParameter(this._shaderProgram, gl.LINK_STATUS)) {
      console.error('[LAppModel] Link error:', gl.getProgramInfoLog(this._shaderProgram));
    }

    gl.useProgram(this._shaderProgram);

    this._shaderProgram.aPosition = gl.getAttribLocation(this._shaderProgram, 'aPosition');
    this._shaderProgram.aTexCoord = gl.getAttribLocation(this._shaderProgram, 'aTexCoord');
    this._shaderProgram.uProjectionMatrix = gl.getUniformLocation(this._shaderProgram, 'uProjectionMatrix');
    this._shaderProgram.uModelMatrix = gl.getUniformLocation(this._shaderProgram, 'uModelMatrix');
    this._shaderProgram.uTexture = gl.getUniformLocation(this._shaderProgram, 'uTexture');
    this._shaderProgram.uOpacity = gl.getUniformLocation(this._shaderProgram, 'uOpacity');

    console.log('[LAppModel] Shaders compiled');
  };

  LAppModel.prototype._loadTextures = function(callback) {
    var textures = this._modelSetting.FileReferences.Textures || [];
    if (textures.length === 0) {
      callback();
      return;
    }

    var gl = this._gl;
    var self = this;
    var loaded = 0;

    console.log('[LAppModel] Loading', textures.length, 'textures');

    textures.forEach(function(path, i) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() {
        console.log('[LAppModel] Texture', i, 'loaded:', img.width, 'x', img.height);

        var tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

        self._textures[i] = tex;
        loaded++;

        if (loaded >= textures.length) {
          console.log('[LAppModel] All textures loaded');
          callback();
        }
      };
      img.onerror = function() {
        console.error('[LAppModel] Texture load failed:', path);
        loaded++;
        if (loaded >= textures.length) callback();
      };
      img.src = this._modelHomeDir + path;
    }.bind(this));
  };

  LAppModel.prototype.update = function(deltaTime) {
    if (!this._initialized || !this._model) return;
    this._model.update();
  };

  LAppModel.prototype.draw = function() {
    if (!this._initialized || !this._model || !this._gl) return;

    var gl = this._gl;

    gl.viewport(0, 0, this._canvas.width, this._canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(this._shaderProgram);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    // Calculate MVP = Projection * Model
    mat4.multiply(this._mvpMatrix, this._projectionMatrix, this._modelMatrix);
    gl.uniformMatrix4fv(this._shaderProgram.uProjectionMatrix, false, this._projectionMatrix);
    gl.uniformMatrix4fv(this._shaderProgram.uModelMatrix, false, this._modelMatrix);

    var drawables = this._model.drawables;
    var count = drawables.count;

    this._frameCount++;

    for (var i = 0; i < count; i++) {
      var texIdx = drawables.textureIndices[i];
      if (texIdx < 0 || texIdx >= this._textures.length) continue;

      var opacity = drawables.opacities[i];
      if (opacity <= 0) continue;

      var verts = drawables.vertexPositions[i];
      var uvs = drawables.vertexUvs[i];
      var indices = drawables.indices[i];

      if (!verts || !uvs || !indices || verts.length === 0) continue;

      if (this._frameCount === 1 && i < 5) {
        console.log('[LAppModel] Drawable', i, ':', verts.length, 'verts, texIdx:', texIdx);
      }

      // Pass vertices directly (Cubism uses centered coordinates)
      var vertexCount = verts.length / 2;
      var positions = new Float32Array(verts);

      // UV: flip Y because Live2D UV origin is top-left, WebGL is bottom-left
      var uvsFlipped = new Float32Array(uvs.length);
      for (var uv = 0; uv < uvs.length; uv += 2) {
        uvsFlipped[uv] = uvs[uv];
        uvsFlipped[uv + 1] = 1.0 - uvs[uv + 1];
      }

      // Bind texture
      gl.activeTexture(gl.TEXTURE0 + texIdx);
      gl.bindTexture(gl.TEXTURE_2D, this._textures[texIdx]);
      gl.uniform1i(this._shaderProgram.uTexture, texIdx);
      gl.uniform1f(this._shaderProgram.uOpacity, opacity);

      // Position buffer
      if (!this._buffers[i]) this._buffers[i] = {};
      if (!this._buffers[i].position) {
        this._buffers[i].position = gl.createBuffer();
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers[i].position);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this._shaderProgram.aPosition);
      gl.vertexAttribPointer(this._shaderProgram.aPosition, 2, gl.FLOAT, false, 0, 0);

      // UV buffer
      if (!this._buffers[i].uv) {
        this._buffers[i].uv = gl.createBuffer();
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers[i].uv);
      gl.bufferData(gl.ARRAY_BUFFER, uvsFlipped, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(this._shaderProgram.aTexCoord);
      gl.vertexAttribPointer(this._shaderProgram.aTexCoord, 2, gl.FLOAT, false, 0, 0);

      // Index buffer
      if (!this._buffers[i].index) {
        this._buffers[i].index = gl.createBuffer();
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._buffers[i].index);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    }

    if (this._frameCount === 1) {
      console.log('[LAppModel] First frame draw complete');
    }
  };

  LAppModel.prototype.isInitialized = function() {
    return this._initialized;
  };

  window.LAppModel = LAppModel;

})();