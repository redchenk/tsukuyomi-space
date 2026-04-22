/**
 * Live2D Cubism 5 WebGL Renderer - Corrected Implementation
 * Proper vertex transformation using MVP matrix
 */

(function() {
  'use strict';

  // ========================================================================
  // Matrix Math Utilities (column-major for WebGL)
  // ========================================================================

  var Matrix44 = function() {
    this.m = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  };

  Matrix44.prototype.identity = function() {
    this.m.fill(0);
    this.m[0] = this.m[5] = this.m[10] = this.m[15] = 1;
    return this;
  };

  Matrix44.prototype.setMatrix = function(m) {
    for (var i = 0; i < 16; i++) this.m[i] = m[i];
    return this;
  };

  Matrix44.prototype.copy = function() {
    var result = new Matrix44();
    for (var i = 0; i < 16; i++) result.m[i] = this.m[i];
    return result;
  };

  Matrix44.prototype.multiply = function(mat) {
    var a = this.m, b = mat.m, result = new Float32Array(16);
    for (var row = 0; row < 4; row++) {
      for (var col = 0; col < 4; col++) {
        result[row * 4 + col] =
          a[row * 4 + 0] * b[0 * 4 + col] +
          a[row * 4 + 1] * b[1 * 4 + col] +
          a[row * 4 + 2] * b[2 * 4 + col] +
          a[row * 4 + 3] * b[3 * 4 + col];
      }
    }
    for (var i = 0; i < 16; i++) this.m[i] = result[i];
    return this;
  };

  Matrix44.prototype.scale = function(x, y, z) {
    var s = new Float32Array([x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]);
    return this.multiply({ m: s });
  };

  Matrix44.prototype.translate = function(x, y, z) {
    var t = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]);
    return this.multiply({ m: t });
  };

  Matrix44.prototype.getArray = function() {
    return this.m;
  };

  // ========================================================================
  // Model Matrix - positions model in viewport
  // ========================================================================

  var ModelMatrix = function(width, height) {
    this._width = width;
    this._height = height;
    this._matrix = new Matrix44();
    this._matrix.identity();
  };

  ModelMatrix.prototype.setupFromLayout = function(layout) {
    var layoutWidth = layout.Width || this._width;
    var layoutHeight = layout.Height || this._height;
    var layoutX = layout.X || 0;
    var layoutY = layout.Y || 0;

    // Calculate scale to fit model in 2-unit viewport (-1 to 1)
    var scaleX = 2.0 / layoutWidth;
    var scaleY = 2.0 / layoutHeight;
    var scale = Math.min(scaleX, scaleY);

    // Center offset
    var centerX = -1.0;
    var centerY = 1.0;

    this._matrix.identity();
    // Y is flipped because Cubism Y is top->down, WebGL Y is bottom->up
    this._matrix.scale(scale, -scale, 1.0);
    // Position: center X, flip Y
    this._matrix.translate(centerX, centerY, 0);
  };

  ModelMatrix.prototype.getMatrix = function() {
    return this._matrix;
  };

  // ========================================================================
  // View Matrix - handles aspect ratio
  // ========================================================================

  var ViewMatrix = function() {
    this._matrix = new Matrix44();
  };

  ViewMatrix.prototype.setupForViewport = function(width, height) {
    var aspectRatio = width / height;

    this._matrix.identity();
    // Scale to normalize coordinates accounting for aspect ratio
    var scaleX = 1.0 / aspectRatio;
    var scaleY = 1.0;
    this._matrix.scale(scaleX, scaleY, 1.0);
  };

  ViewMatrix.prototype.getMatrix = function() {
    return this._matrix;
  };

  // ========================================================================
  // LAppModel
  // ========================================================================

  var LAppModel = function(gl, canvas) {
    this._gl = gl;
    this._canvas = canvas;
    this._model = null;
    this._moc = null;
    this._textures = [];
    this._modelMatrix = null;
    this._viewMatrix = null;
    this._modelHomeDir = '';
    this._modelSetting = null;
    this._shaderProgram = null;
    this._buffers = {};
    this._frameCount = 0;
    this._initialized = false;
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

        // Load moc file
        var mocPath = dir + json.FileReferences.Moc;
        console.log('[LAppModel] Loading moc:', mocPath);
        return fetch(mocPath);
      })
      .then(function(r) { return r.arrayBuffer(); })
      .then(function(buffer) {
        console.log('[LAppModel] Moc loaded, creating model...');
        self._createModel(buffer);
        self._initializeWebGL();
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

    // For Cubism 5, use fromArrayBuffer
    this._moc = core.Moc.fromArrayBuffer(buffer);
    if (!this._moc) {
      console.error('[LAppModel] Moc create failed');
      return;
    }

    this._model = core.Model.fromMoc(this._moc);
    if (!this._model) {
      console.error('[LAppModel] Model create failed');
      return;
    }

    console.log('[LAppModel] Model created');
    console.log('[LAppModel] Canvas size:', this._model.canvasinfo.CanvasWidth, 'x', this._model.canvasinfo.CanvasHeight);

    // Initialize matrices
    var canvasWidth = this._model.canvasinfo.CanvasWidth;
    var canvasHeight = this._model.canvasinfo.CanvasHeight;

    this._modelMatrix = new ModelMatrix(canvasWidth, canvasHeight);
    this._modelMatrix.setupFromLayout({
      Width: canvasWidth,
      Height: canvasHeight,
      X: 0,
      Y: 0
    });

    this._viewMatrix = new ViewMatrix();
    this._viewMatrix.setupForViewport(this._canvas.width, this._canvas.height);
  };

  LAppModel.prototype._initializeWebGL = function() {
    var gl = this._gl;

    // Vertex shader with MVP matrix - vec2 position, z=0, w=1
    var vertexShaderSource = [
      'attribute vec2 aVertexPosition;',
      'attribute vec2 aTextureCoord;',
      'uniform mat4 uMvpMatrix;',
      'varying vec2 vTextureCoord;',
      'void main() {',
      '  gl_Position = uMvpMatrix * vec4(aVertexPosition, 0.0, 1.0);',
      '  vTextureCoord = aTextureCoord;',
      '}'
    ].join('\n');

    // Fragment shader
    var fragmentShaderSource = [
      'precision mediump float;',
      'varying vec2 vTextureCoord;',
      'uniform sampler2D uTexture;',
      'uniform float uOpacity;',
      'void main() {',
      '  vec4 color = texture2D(uTexture, vTextureCoord);',
      '  gl_FragColor = vec4(color.rgb, color.a * uOpacity);',
      '}'
    ].join('\n');

    var vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexShaderSource);
    gl.compileShader(vertexShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      console.error('[LAppModel] Vertex shader error:', gl.getShaderInfoLog(vertexShader));
    }

    var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderSource);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.error('[LAppModel] Fragment shader error:', gl.getShaderInfoLog(fragmentShader));
    }

    this._shaderProgram = gl.createProgram();
    gl.attachShader(this._shaderProgram, vertexShader);
    gl.attachShader(this._shaderProgram, fragmentShader);
    gl.linkProgram(this._shaderProgram);
    if (!gl.getProgramParameter(this._shaderProgram, gl.LINK_STATUS)) {
      console.error('[LAppModel] Program link error:', gl.getProgramInfoLog(this._shaderProgram));
    }

    gl.useProgram(this._shaderProgram);

    this._shaderProgram.aVertexPosition = gl.getAttribLocation(this._shaderProgram, 'aVertexPosition');
    this._shaderProgram.aTextureCoord = gl.getAttribLocation(this._shaderProgram, 'aTextureCoord');
    this._shaderProgram.uMvpMatrix = gl.getUniformLocation(this._shaderProgram, 'uMvpMatrix');
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
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
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
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this._shaderProgram);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Calculate MVP matrix: View * Model (column-major multiplication)
    var mvpMatrix = new Matrix44();
    mvpMatrix.setMatrix(this._viewMatrix.getMatrix().getArray());
    mvpMatrix.multiply(this._modelMatrix.getMatrix());

    gl.uniformMatrix4fv(this._shaderProgram.uMvpMatrix, false, mvpMatrix.getArray());

    var drawables = this._model.drawables;
    var count = drawables.count;

    this._frameCount++;
    if (this._frameCount === 1) {
      console.log('[LAppModel] Draw frame 1, drawables:', count);
      console.log('[LAppModel] Canvas size:', this._canvas.width, 'x', this._canvas.height);
    }

    // Get canvas dimensions for coordinate conversion
    var canvasWidth = this._model.canvasinfo.CanvasWidth;
    var canvasHeight = this._model.canvasinfo.CanvasHeight;

    // Draw each drawable
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
        console.log('[LAppModel] Drawable', i, ':', verts.length, 'verts, texIdx:', texIdx);
        console.log('[LAppModel]   First vert:', verts[0], verts[1]);
      }

      // Convert Cubism vertex coordinates (pixels, top-left origin)
      // to WebGL coordinates (pixels from bottom-left, but we pass to MVP)
      // Cubism: origin top-left, Y increases downward
      // WebGL: origin bottom-left, Y increases upward
      // MVP will handle the transformation
      var vertexCount = verts.length / 2;
      var webglVerts = new Float32Array(verts.length);

      for (var v = 0; v < vertexCount; v++) {
        var cx = verts[v * 2];
        var cy = verts[v * 2 + 1];
        // Convert to WebGL pixel coordinates (origin bottom-left)
        webglVerts[v * 2] = cx;
        webglVerts[v * 2 + 1] = canvasHeight - cy;
      }

      // Bind texture
      gl.activeTexture(gl.TEXTURE0 + texIdx);
      gl.bindTexture(gl.TEXTURE_2D, this._textures[texIdx]);
      gl.uniform1i(this._shaderProgram.uTexture, texIdx);
      gl.uniform1f(this._shaderProgram.uOpacity, opacity);

      // Position buffer (WebGL pixel coords)
      if (!this._buffers[i]) this._buffers[i] = {};
      if (!this._buffers[i].position) {
        this._buffers[i].position = gl.createBuffer();
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers[i].position);
      gl.bufferData(gl.ARRAY_BUFFER, webglVerts, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this._shaderProgram.aVertexPosition);
      gl.vertexAttribPointer(this._shaderProgram.aVertexPosition, 2, gl.FLOAT, false, 0, 0);

      // UV buffer (pass through directly)
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

      // Draw
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    }
  };

  LAppModel.prototype.isInitialized = function() {
    return this._initialized;
  };

  LAppModel.prototype.resize = function() {
    if (!this._canvas || !this._viewMatrix) return;
    this._viewMatrix.setupForViewport(this._canvas.width, this._canvas.height);
  };

  window.LAppModel = LAppModel;

})();