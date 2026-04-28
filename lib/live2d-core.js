/**
 * Live2D Cubism 5 WebGL Renderer - Simplified Correct Implementation
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
    'uniform mat4 uModelMatrix;',
    'void main() {',
    '  gl_Position = uModelMatrix * vec4(aPosition, 0.0, 1.0);',
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
    scale: function(out, v) {
      out[0] *= v[0]; out[1] *= v[0]; out[2] *= v[0]; out[3] *= v[0];
      out[4] *= v[1]; out[5] *= v[1]; out[6] *= v[1]; out[7] *= v[1];
      out[8] *= v[2]; out[9] *= v[2]; out[10] *= v[2]; out[11] *= v[2];
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
    this._modelMatrix = mat4.create();
    this._userTimeSeconds = 0;
    this._blinkTime = 0;
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
        return fetch(dir + json.FileReferences.Moc);
      })
      .then(function(r) { return r.arrayBuffer(); })
      .then(function(buffer) {
        console.log('[LAppModel] Moc loaded');
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

    var cw = this._model.canvasinfo.CanvasWidth;
    var ch = this._model.canvasinfo.CanvasHeight;
    console.log('[LAppModel] Canvas:', cw, 'x', ch);

    // Calculate scale to fit model in viewport
    // Model Y range is 0 to ~0.37, scale to fill -1 to 1
    var scaleY = 2.7;
    var aspect = this._canvas.width / this._canvas.height;
    var scaleX = scaleY * aspect;

    // Identity matrix - all scaling done in vertex shader
    mat4.identity(this._modelMatrix);

    console.log('[LAppModel] Scale: X=', scaleX, 'Y=', scaleY);
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
    if (!this._initialized || !this._model) {
      console.log('[LAppModel] Update skipped: init=', this._initialized, 'model=', !!this._model);
      return;
    }

    this._userTimeSeconds += deltaTime;
    this._model.update();

    // Debug: every 60 frames (1 second), log parameter values
    if (this._frameCount % 60 === 0) {
      console.log('[LAppModel] Frame', this._frameCount, 'time:', this._userTimeSeconds.toFixed(2));
      // Check if parameters exist
      var params = this._model.parameters;
      if (params && params.count > 0) {
        // Find breath param
        for (var i = 0; i < params.count; i++) {
          if (params.ids[i] === 'ParamBreath') {
            console.log('  ParamBreath =', params.values[i]);
          }
        }
      }
    }

    // Breathing animation
    var breathCycle = Math.sin(this._userTimeSeconds * 2.0);
    var breathValue = 0.5 + breathCycle * 0.1;
    this._setParameterValue('ParamBreath', breathValue);

    // Body sway
    var swayX = Math.sin(this._userTimeSeconds * 0.5) * 3;
    var swayY = Math.sin(this._userTimeSeconds * 0.3) * 2;
    this._setParameterValue('ParamAngleX', swayX);
    this._setParameterValue('ParamAngleY', swayY);
    this._setParameterValue('ParamBodyAngleX', swayX * 0.3);

    // Eye blink
    this._blinkTime += deltaTime;
    if (this._blinkTime > 3) {
      this._setParameterValue('ParamEyeLOpen', 0);
      this._setParameterValue('ParamEyeROpen', 0);
      var model = this;
      setTimeout(function() {
        model._setParameterValue('ParamEyeLOpen', 1);
        model._setParameterValue('ParamEyeROpen', 1);
      }, 100);
      this._blinkTime = 0;
    }
  };

  LAppModel.prototype._setParameterValue = function(id, value) {
    if (!this._model) return;
    var params = this._model.parameters;
    for (var i = 0; i < params.count; i++) {
      if (params.ids[i] === id) {
        params.values[i] = value;
        return;
      }
    }
  };

  LAppModel.prototype.draw = function() {
    if (!this._initialized || !this._model || !this._gl) return;

    this._frameCount++;
    if (this._frameCount % 60 === 0) {
      console.log('[LAppModel] Draw frame', this._frameCount);
    }

    var gl = this._gl;

    gl.viewport(0, 0, this._canvas.width, this._canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this._shaderProgram);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    gl.uniformMatrix4fv(this._shaderProgram.uModelMatrix, false, this._modelMatrix);

    var drawables = this._model.drawables;
    var count = drawables.count;

    this._frameCount++;

    // Collect and sort drawables by renderOrder
    var drawableList = [];
    for (var i = 0; i < count; i++) {
      var texIdx = drawables.textureIndices[i];
      if (texIdx < 0 || texIdx >= this._textures.length) continue;
      var opacity = drawables.opacities[i];
      if (opacity <= 0) continue;
      var verts = drawables.vertexPositions[i];
      var uvs = drawables.vertexUvs[i];
      var indices = drawables.indices[i];
      if (!verts || !uvs || !indices || verts.length === 0) continue;

      drawableList.push({
        index: i,
        renderOrder: drawables.renderOrders[i],
        texIdx: texIdx,
        opacity: opacity,
        verts: verts,
        uvs: uvs,
        indices: indices
      });
    }

    drawableList.sort(function(a, b) {
      return a.renderOrder - b.renderOrder;
    });

    if (this._frameCount === 1) {
      console.log('[LAppModel] Total drawables:', drawableList.length);
      console.log('[LAppModel] RenderOrder range:', drawableList[0].renderOrder, 'to', drawableList[drawableList.length-1].renderOrder);
    }

    // Draw in renderOrder
    for (var di = 0; di < drawableList.length; di++) {
      var d = drawableList[di];

      // Transform vertices to NDC with uniform scale
      // Cubism coordinates are centered, Y range ~0 to 0.37
      var vertexCount = d.verts.length / 2;
      var positions = new Float32Array(d.verts.length);
      var scale = 3.0; // Uniform scale
      for (var vi = 0; vi < vertexCount; vi++) {
        positions[vi * 2] = d.verts[vi * 2] * scale;
        positions[vi * 2 + 1] = d.verts[vi * 2 + 1] * scale;
      }

      // UV: flip Y
      var uvsFlipped = new Float32Array(d.uvs.length);
      for (var ui = 0; ui < d.uvs.length; ui += 2) {
        uvsFlipped[ui] = d.uvs[ui];
        uvsFlipped[ui + 1] = 1.0 - d.uvs[ui + 1];
      }

      // Bind texture
      gl.activeTexture(gl.TEXTURE0 + d.texIdx);
      gl.bindTexture(gl.TEXTURE_2D, this._textures[d.texIdx]);
      gl.uniform1i(this._shaderProgram.uTexture, d.texIdx);
      gl.uniform1f(this._shaderProgram.uOpacity, d.opacity);

      // Position buffer
      var bufKey = d.index;
      if (!this._buffers[bufKey]) this._buffers[bufKey] = {};
      if (!this._buffers[bufKey].position) {
        this._buffers[bufKey].position = gl.createBuffer();
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers[bufKey].position);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this._shaderProgram.aPosition);
      gl.vertexAttribPointer(this._shaderProgram.aPosition, 2, gl.FLOAT, false, 0, 0);

      // UV buffer
      if (!this._buffers[bufKey].uv) {
        this._buffers[bufKey].uv = gl.createBuffer();
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers[bufKey].uv);
      gl.bufferData(gl.ARRAY_BUFFER, uvsFlipped, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(this._shaderProgram.aTexCoord);
      gl.vertexAttribPointer(this._shaderProgram.aTexCoord, 2, gl.FLOAT, false, 0, 0);

      // Index buffer
      if (!this._buffers[bufKey].index) {
        this._buffers[bufKey].index = gl.createBuffer();
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._buffers[bufKey].index);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(d.indices), gl.STATIC_DRAW);

      gl.drawElements(gl.TRIANGLES, d.indices.length, gl.UNSIGNED_SHORT, 0);
    }
  };

  LAppModel.prototype.isInitialized = function() {
    return this._initialized;
  };

  window.LAppModel = LAppModel;

})();