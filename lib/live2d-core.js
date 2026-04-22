/**
 * Live2D Cubism 5 WebGL Renderer - Simplified Direct NDC Transformation
 */

(function() {
  'use strict';

  // ========================================================================
  // Shaders
  // ========================================================================

  var VERTEX_SHADER = [
    'precision mediump float;',
    'attribute vec2 aVertexPosition;',
    'attribute vec2 aTextureCoord;',
    'varying vec2 vTextureCoord;',
    'void main() {',
    '  gl_Position = vec4(aVertexPosition, 0.0, 1.0);',
    '  vTextureCoord = aTextureCoord;',
    '}'
  ].join('\n');

  var FRAGMENT_SHADER = [
    'precision mediump float;',
    'varying vec2 vTextureCoord;',
    'uniform sampler2D uTexture;',
    'uniform float uOpacity;',
    'void main() {',
    '  vec4 color = texture2D(uTexture, vTextureCoord);',
    '  gl_FragColor = vec4(color.rgb, color.a * uOpacity);',
    '}'
  ].join('\n');

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
  };

  LAppModel.prototype.load = function(dir, fileName, callback) {
    var self = this;
    this._modelHomeDir = dir;

    console.log('[LAppModel] Loading model from:', dir + fileName);

    fetch(dir + fileName)
      .then(function(r) { return r.json(); })
      .then(function(json) {
        console.log('[LAppModel] Model JSON loaded:', json);
        self._modelSetting = json;

        var mocPath = dir + json.FileReferences.Moc;
        console.log('[LAppModel] Loading moc:', mocPath);
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

    console.log('[LAppModel] Core version:', core.Version);

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
    console.log('[LAppModel] Model canvas:', this._canvasWidth, 'x', this._canvasHeight);
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

    this._shaderProgram.aVertexPosition = gl.getAttribLocation(this._shaderProgram, 'aVertexPosition');
    this._shaderProgram.aTextureCoord = gl.getAttribLocation(this._shaderProgram, 'aTextureCoord');
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
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(this._shaderProgram);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    var drawables = this._model.drawables;
    var count = drawables.count;

    this._frameCount++;
    if (this._frameCount === 1) {
      console.log('[LAppModel] Draw frame 1, drawables:', count);
    }

    // Calculate aspect ratio correction
    var canvasAspect = this._canvas.width / this._canvas.height;
    var modelAspect = this._canvasWidth / this._canvasHeight;

    for (var i = 0; i < count; i++) {
      var texIdx = drawables.textureIndices[i];
      if (texIdx < 0 || texIdx >= this._textures.length) continue;

      var opacity = drawables.opacities[i];
      if (opacity <= 0) continue;

      var verts = drawables.vertexPositions[i];
      var uvs = drawables.vertexUvs[i];
      var indices = drawables.indices[i];

      if (!verts || !uvs || !indices || verts.length === 0) continue;

      if (this._frameCount === 1 && i < 3) {
        console.log('[LAppModel] Drawable', i, ':', verts.length, 'verts');
        console.log('[LAppModel]   Vertex 0:', verts[0], verts[1]);
      }

      var vertexCount = verts.length / 2;
      var ndcVerts = new Float32Array(vertexCount * 2);

      // Cubism vertices are already normalized! Just flip Y for WebGL
      // Cubism: origin center, Y increases downward
      // WebGL: origin center, Y increases upward
      for (var v = 0; v < vertexCount; v++) {
        var cx = verts[v * 2];
        var cy = verts[v * 2 + 1];
        ndcVerts[v * 2] = cx;
        ndcVerts[v * 2 + 1] = -cy; // Flip Y
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
      gl.bufferData(gl.ARRAY_BUFFER, ndcVerts, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this._shaderProgram.aVertexPosition);
      gl.vertexAttribPointer(this._shaderProgram.aVertexPosition, 2, gl.FLOAT, false, 0, 0);

      // UV buffer
      if (!this._buffers[i].uv) {
        this._buffers[i].uv = gl.createBuffer();
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers[i].uv);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(this._shaderProgram.aTextureCoord);
      gl.vertexAttribPointer(this._shaderProgram.aTextureCoord, 2, gl.FLOAT, false, 0, 0);

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