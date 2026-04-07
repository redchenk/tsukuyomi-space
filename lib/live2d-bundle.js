/**
 * Live2D Bundle for tsukuyomi-space
 * Proper implementation based on TsukimiYachiyo architecture
 */

(function() {
  'use strict';

  // ========================================================================
  // Matrix Math Utilities
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
  // Model Matrix (for positioning/scaling model in viewport)
  // ========================================================================

  var ModelMatrix = function(width, height) {
    this._width = width;
    this._height = height;
    this._matrix = new Matrix44();
  };

  ModelMatrix.prototype.setupFromLayout = function(layout) {
    var layoutWidth = layout.Width || this._width;
    var layoutHeight = layout.Height || this._height;
    var layoutX = layout.X || 0;
    var layoutY = layout.Y || 0;

    // Calculate scale to fit model in viewport
    // Assuming viewport is 2x2 (from -1 to 1 in both axes)
    var scaleX = 2.0 / layoutWidth;
    var scaleY = 2.0 / layoutHeight;
    var scale = Math.min(scaleX, scaleY);

    // Position: center X, Y is already center at 0 after inversion
    var offsetX = layoutX * scaleX - 1.0;
    var offsetY = 1.0 - layoutY * scaleY;

    this._matrix.identity();
    this._matrix.scale(scale, -scale, 1.0);  // Y flip for WebGL
    this._matrix.translate(offsetX, offsetY, 0);
  };

  ModelMatrix.prototype.getMatrix = function() {
    return this._matrix;
  };

  // ========================================================================
  // View Matrix (for viewport transformation)
  // ========================================================================

  var ViewMatrix = function() {
    this._matrix = new Matrix44();
    this._screenLeft = -1;
    this._screenRight = 1;
    this._screenTop = 1;
    this._screenBottom = -1;
  };

  ViewMatrix.prototype.setupForViewport = function(width, height) {
    var aspectRatio = width / height;
    this._screenLeft = -aspectRatio;
    this._screenRight = aspectRatio;
    this._screenTop = 1;
    this._screenBottom = -1;

    var scaleX = 2.0 / (this._screenRight - this._screenLeft);
    var scaleY = 2.0 / (this._screenTop - this._screenBottom);
    var translateX = -(this._screenRight + this._screenLeft) / 2;
    var translateY = -(this._screenTop + this._screenBottom) / 2;

    this._matrix.identity();
    this._matrix.scale(scaleX, scaleY, 1.0);
    this._matrix.translate(translateX, translateY, 0);
  };

  ViewMatrix.prototype.getMatrix = function() {
    return this._matrix;
  };

  // ========================================================================
  // Motion Manager
  // ========================================================================

  var MotionManager = function() {
    this._currentMotion = null;
    this._startTime = 0;
    this._fadeTime = 0;
  };

  MotionManager.prototype.startMotion = function(motion, model) {
    this._currentMotion = motion;
    this._startTime = Date.now();
    this._fadeTime = (motion.fadeInTime || 0.5) * 1000;
  };

  MotionManager.prototype.update = function(model, deltaTime, motions) {
    if (!this._currentMotion) return;
  };

  MotionManager.prototype.isFinished = function() {
    return false; // Loop or idle
  };

  MotionManager.prototype.stopAllMotions = function() {
    this._currentMotion = null;
  };

  // ========================================================================
  // Expression Manager
  // ========================================================================

  var ExpressionManager = function() {
    this._currentExpression = null;
  };

  ExpressionManager.prototype.update = function(model, deltaTime, expressions) {
    // Expression updates
  };

  // ========================================================================
  // Breath
  // ========================================================================

  var Breath = function() {
    this._breathTime = 0;
    this._parameters = [
      { id: 'ParamAngleX', min: -10, max: 10, speed: 0.5 },
      { id: 'ParamAngleY', min: -10, max: 10, speed: 0.5 },
      { id: 'ParamBreath', min: 0.4, max: 0.6, speed: 3.0 }
    ];
  };

  Breath.prototype.update = function(model, deltaTime) {
    this._breathTime += deltaTime;
    for (var i = 0; i < this._parameters.length; i++) {
      var p = this._parameters[i];
      var value = (Math.sin(this._breathTime * p.speed) + 1) / 2 * (p.max - p.min) + p.min;
    }
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
    this._motions = {};
    this._expressions = {};
    this._motionManager = new MotionManager();
    this._expressionManager = new ExpressionManager();
    this._eyeBlink = null;
    this._breath = new Breath();
    this._physics = null;
    this._dragX = 0;
    this._dragY = 0;
    this._state = 0;
    this._userTimeSeconds = 0;
    this._initialized = false;
    this._shaderProgram = null;
    this._buffers = {};
    this._idParamAngleX = 'ParamAngleX';
    this._idParamAngleY = 'ParamAngleY';
    this._idParamAngleZ = 'ParamAngleZ';
    this._idParamEyeBallX = 'ParamEyeBallX';
    this._idParamEyeBallY = 'ParamEyeBallY';
    this._idParamBodyAngleX = 'ParamBodyAngleX';
    this._idParamBreath = 'ParamBreath';
  };

  LAppModel.STATE_LOAD_ASSETS = 0;
  LAppModel.STATE_LOAD_MODEL = 1;
  LAppModel.STATE_WAIT_LOAD_MODEL = 2;
  LAppModel.STATE_LOAD_EXPRESSION = 3;
  LAppModel.STATE_LOAD_PHYSICS = 4;
  LAppModel.STATE_LOAD_MOTIONS = 5;
  LAppModel.STATE_COMPLETE = 6;

  LAppModel.prototype.load = function(dir, fileName, callback) {
    var thisModel = this;
    this._modelHomeDir = dir;
    this._state = LAppModel.STATE_LOAD_ASSETS;

    fetch(dir + fileName)
      .then(function(response) { return response.json(); })
      .then(function(json) {
        thisModel._modelSetting = json;
        thisModel._state = LAppModel.STATE_LOAD_MODEL;
        var mocPath = dir + json.FileReferences.Moc;
        return fetch(mocPath);
      })
      .then(function(response) { return response.arrayBuffer(); })
      .then(function(buffer) {
        thisModel._createModel(buffer);
        thisModel._state = LAppModel.STATE_LOAD_EXPRESSION;
        thisModel._loadExpressions(callback);
      })
      .catch(function(error) {
        console.error('Failed to load model:', error);
      });
  };

  LAppModel.prototype._createModel = function(buffer) {
    var core = window.Live2DCubismCore;
    if (!core) {
      console.error('Live2D Cubism Core not loaded');
      return;
    }

    this._moc = core.Moc.fromArrayBuffer(buffer);
    if (!this._moc) {
      console.error('Failed to create Moc');
      return;
    }

    this._model = core.Model.fromMoc(this._moc);
    if (!this._model) {
      console.error('Failed to create Model');
      return;
    }

    console.log('Model created, canvas size:', this._model.canvasinfo.CanvasWidth, 'x', this._model.canvasinfo.CanvasHeight);

    // Initialize WebGL shaders
    this._initializeWebGL();

    // Create matrices
    var canvasWidth = this._model.canvasinfo.CanvasWidth;
    var canvasHeight = this._model.canvasinfo.CanvasHeight;

    this._modelMatrix = new ModelMatrix(canvasWidth, canvasHeight);
    this._viewMatrix = new ViewMatrix();
    this._viewMatrix.setupForViewport(this._canvas.width, this._canvas.height);
  };

  LAppModel.prototype._initializeWebGL = function() {
    var gl = this._gl;

    var vertexShaderSource = [
      'attribute vec4 aVertexPosition;',
      'attribute vec2 aTextureCoord;',
      'uniform mat4 uMvpMatrix;',
      'varying vec2 vTextureCoord;',
      'void main() {',
      '  gl_Position = uMvpMatrix * aVertexPosition;',
      '  vTextureCoord = aTextureCoord;',
      '}'
    ].join('\n');

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
      console.error('Vertex shader error:', gl.getShaderInfoLog(vertexShader));
    }

    var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderSource);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.error('Fragment shader error:', gl.getShaderInfoLog(fragmentShader));
    }

    this._shaderProgram = gl.createProgram();
    gl.attachShader(this._shaderProgram, vertexShader);
    gl.attachShader(this._shaderProgram, fragmentShader);
    gl.linkProgram(this._shaderProgram);
    if (!gl.getProgramParameter(this._shaderProgram, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(this._shaderProgram));
    }

    gl.useProgram(this._shaderProgram);

    this._shaderProgram.aVertexPosition = gl.getAttribLocation(this._shaderProgram, 'aVertexPosition');
    this._shaderProgram.aTextureCoord = gl.getAttribLocation(this._shaderProgram, 'aTextureCoord');
    this._shaderProgram.uMvpMatrix = gl.getUniformLocation(this._shaderProgram, 'uMvpMatrix');
    this._shaderProgram.uTexture = gl.getUniformLocation(this._shaderProgram, 'uTexture');
    this._shaderProgram.uOpacity = gl.getUniformLocation(this._shaderProgram, 'uOpacity');

    console.log('WebGL shaders initialized');
  };

  LAppModel.prototype._loadExpressions = function(callback) {
    var thisModel = this;
    var expressions = this._modelSetting.FileReferences.Expressions || [];

    if (expressions.length === 0) {
      this._state = LAppModel.STATE_LOAD_PHYSICS;
      this._loadPhysics(callback);
      return;
    }

    var loaded = 0;
    expressions.forEach(function(expr, index) {
      fetch(thisModel._modelHomeDir + expr.File)
        .then(function(response) { return response.json(); })
        .then(function(json) {
          var name = expr.Name || json.Name || 'exp_' + index;
          thisModel._expressions[name] = json;
          loaded++;
          if (loaded >= expressions.length) {
            thisModel._state = LAppModel.STATE_LOAD_PHYSICS;
            thisModel._loadPhysics(callback);
          }
        })
        .catch(function(error) {
          console.error('Failed to load expression:', error);
          loaded++;
          if (loaded >= expressions.length) {
            thisModel._state = LAppModel.STATE_LOAD_PHYSICS;
            thisModel._loadPhysics(callback);
          }
        });
    });
  };

  LAppModel.prototype._loadPhysics = function(callback) {
    var thisModel = this;
    var physicsPath = this._modelSetting.FileReferences.Physics;

    if (!physicsPath) {
      this._state = LAppModel.STATE_LOAD_MOTIONS;
      this._loadMotions(callback);
      return;
    }

    fetch(this._modelHomeDir + physicsPath)
      .then(function(response) { return response.json(); })
      .then(function(json) {
        thisModel._physics = json;
        thisModel._state = LAppModel.STATE_LOAD_MOTIONS;
        thisModel._loadMotions(callback);
      })
      .catch(function(error) {
        console.error('Failed to load physics:', error);
        thisModel._state = LAppModel.STATE_LOAD_MOTIONS;
        thisModel._loadMotions(callback);
      });
  };

  LAppModel.prototype._loadMotions = function(callback) {
    var thisModel = this;
    var motions = this._modelSetting.FileReferences.Motions || {};
    var groupNames = Object.keys(motions);

    if (groupNames.length === 0) {
      this._state = LAppModel.STATE_COMPLETE;
      this._loadTextures(callback);
      return;
    }

    var totalLoaded = 0;
    var totalToLoad = 0;

    groupNames.forEach(function(groupName) {
      totalToLoad += motions[groupName].length;
    });

    if (totalToLoad === 0) {
      this._state = LAppModel.STATE_COMPLETE;
      this._loadTextures(callback);
      return;
    }

    groupNames.forEach(function(groupName) {
      var group = motions[groupName];
      group.forEach(function(motionInfo, index) {
        var motionPath = thisModel._modelHomeDir + motionInfo.File;
        var motionName = groupName + '_' + index;

        fetch(motionPath)
          .then(function(response) { return response.arrayBuffer(); })
          .then(function(buffer) {
            thisModel._motions[motionName] = {
              buffer: buffer,
              name: motionName,
              fadeInTime: motionInfo.FadeInTime || 0,
              fadeOutTime: motionInfo.FadeOutTime || 0
            };
            totalLoaded++;
            if (totalLoaded >= totalToLoad) {
              thisModel._state = LAppModel.STATE_COMPLETE;
              thisModel._loadTextures(callback);
            }
          })
          .catch(function(error) {
            console.error('Failed to load motion:', motionPath);
            totalLoaded++;
            if (totalLoaded >= totalToLoad) {
              thisModel._state = LAppModel.STATE_COMPLETE;
              thisModel._loadTextures(callback);
            }
          });
      });
    });
  };

  LAppModel.prototype._loadTextures = function(callback) {
    var thisModel = this;
    var textures = this._modelSetting.FileReferences.Textures || [];
    var gl = this._gl;

    if (textures.length === 0) {
      this._initialized = true;
      if (callback) callback(this);
      return;
    }

    var loaded = 0;

    textures.forEach(function(texturePath, index) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() {
        console.log('Texture loaded:', index, img.width, 'x', img.height);

        var texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        thisModel._textures[index] = texture;
        loaded++;
        if (loaded >= textures.length) {
          thisModel._initialized = true;
          console.log('All textures loaded, model ready');
          if (callback) callback(thisModel);
        }
      };
      img.onerror = function() {
        console.error('Failed to load texture:', texturePath);
        loaded++;
        if (loaded >= textures.length) {
          thisModel._initialized = true;
          if (callback) callback(thisModel);
        }
      };
      img.src = thisModel._modelHomeDir + texturePath;
    });
  };

  LAppModel.prototype.update = function(deltaTime) {
    if (!this._initialized || !this._model) return;

    this._userTimeSeconds += deltaTime;

    // Update model core
    this._model.update();

    // Update breath
    if (this._breath) {
      this._breath.update(this, deltaTime);
    }

    // Update motion
    this._motionManager.update(this._model, deltaTime, this._motions);

    // Update expression
    this._expressionManager.update(this._model, deltaTime, this._expressions);

    // Apply drag (mouse follow) with smoothing
    var targetX = this._dragX;
    var targetY = this._dragY;

    var currentAngleX = this._getParameterValue(this._idParamAngleX);
    var currentAngleY = this._getParameterValue(this._idParamAngleY);
    var currentAngleZ = this._getParameterValue(this._idParamAngleZ);

    var newAngleX = currentAngleX + (targetX * 30 - currentAngleX) * 0.1;
    var newAngleY = currentAngleY + (targetY * 30 - currentAngleY) * 0.1;
    var newAngleZ = currentAngleZ + (this._dragX * this._dragY * -30 - currentAngleZ) * 0.1;

    this._setParameterValue(this._idParamAngleX, newAngleX);
    this._setParameterValue(this._idParamAngleY, newAngleY);
    this._setParameterValue(this._idParamAngleZ, newAngleZ);

    // Body angle
    var currentBodyAngle = this._getParameterValue(this._idParamBodyAngleX);
    var newBodyAngle = currentBodyAngle + (this._dragX * 10 - currentBodyAngle) * 0.1;
    this._setParameterValue(this._idParamBodyAngleX, newBodyAngle);
  };

  LAppModel.prototype.draw = function() {
    if (!this._initialized || !this._model || !this._gl) return;

    var gl = this._gl;
    gl.useProgram(this._shaderProgram);

    // Calculate MVP matrix: Model * View * Projection
    // View matrix already includes projection for viewport
    var mvpMatrix = new Matrix44();

    // Start with view matrix (which includes aspect ratio correction)
    mvpMatrix.setMatrix(this._viewMatrix.getMatrix().getArray());

    // Apply model matrix (positioning and Y-flip)
    var modelMatArray = this._modelMatrix.getMatrix().getArray();
    mvpMatrix.multiply({ m: modelMatArray });

    gl.uniformMatrix4fv(this._shaderProgram.uMvpMatrix, false, mvpMatrix.getArray());

    // Get drawables from model
    var drawables = this._model.drawables;
    var drawableCount = drawables.count;

    // Get canvas dimensions for coordinate conversion
    var canvasWidth = this._model.canvasinfo.CanvasWidth;
    var canvasHeight = this._model.canvasinfo.CanvasHeight;

    // Vertex positions in WebGL NDC space need to be calculated
    // Cubism coordinates: origin at top-left, Y-up, in pixels
    // WebGL coordinates: origin at bottom-left, Y-down, in pixels
    // Conversion: webgl_x = (cubism_x / canvasWidth) * 2 - 1
    //             webgl_y = 1 - (cubism_y / canvasHeight) * 2

    for (var i = 0; i < drawableCount; i++) {
      var textureIndex = drawables.textureIndices[i];
      if (textureIndex < 0 || textureIndex >= this._textures.length) continue;

      var opacity = drawables.opacities[i];
      if (opacity <= 0) continue;

      var vertexPositions = drawables.vertexPositions[i];
      var uvs = drawables.vertexUvs[i];
      var indices = drawables.indices[i];

      if (!vertexPositions || !uvs || !indices) continue;

      // Convert Cubism coordinates to WebGL NDC (-1 to 1)
      var vertexCount = vertexPositions.length / 2;
      var ndcVerts = new Float32Array(vertexPositions.length * 2);

      for (var v = 0; v < vertexCount; v++) {
        var cubismX = vertexPositions[v * 2];
        var cubismY = vertexPositions[v * 2 + 1];

        // Convert to NDC
        var ndcX = (cubismX / canvasWidth) * 2 - 1;
        var ndcY = 1 - (cubismY / canvasHeight) * 2;

        ndcVerts[v * 2] = ndcX;
        ndcVerts[v * 2 + 1] = ndcY;
      }

      // Bind texture
      gl.activeTexture(gl.TEXTURE0 + textureIndex);
      gl.bindTexture(gl.TEXTURE_2D, this._textures[textureIndex]);
      gl.uniform1i(this._shaderProgram.uTexture, textureIndex);
      gl.uniform1f(this._shaderProgram.uOpacity, opacity);

      // Create or update position buffer
      if (!this._buffers[i]) this._buffers[i] = {};
      if (!this._buffers[i].position) {
        this._buffers[i].position = gl.createBuffer();
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers[i].position);
      gl.bufferData(gl.ARRAY_BUFFER, ndcVerts, gl.STATIC_DRAW);
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

      // Draw
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    }
  };

  LAppModel.prototype._getParameterValue = function(id) {
    if (!this._model) return 0;
    var params = this._model.parameters;
    for (var i = 0; i < params.count; i++) {
      if (params.ids[i] === id) {
        return params.values[i];
      }
    }
    return 0;
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

  LAppModel.prototype.setDrag = function(x, y) {
    this._dragX = x;
    this._dragY = y;
  };

  LAppModel.prototype.startMotion = function(group, index) {
    var motionKey = group + '_' + index;
    var motion = this._motions[motionKey];
    if (motion) {
      this._motionManager.startMotion(motion, this._model);
    }
  };

  LAppModel.prototype.startRandomMotion = function(group, priority) {
    var motionGroups = this._modelSetting.FileReferences.Motions || {};
    var groupMotions = motionGroups[group];
    if (!groupMotions || groupMotions.length === 0) return;
    var index = Math.floor(Math.random() * groupMotions.length);
    this.startMotion(group, index);
  };

  LAppModel.prototype.setExpression = function(name) {
    var expr = this._expressions[name];
    if (!expr) return;
    var params = expr.Parameters || [];
    for (var i = 0; i < params.length; i++) {
      this._setParameterValue(params[i].Id, params[i].Value);
    }
  };

  LAppModel.prototype.setRandomExpression = function() {
    var names = Object.keys(this._expressions);
    if (names.length === 0) return;
    var name = names[Math.floor(Math.random() * names.length)];
    this.setExpression(name);
  };

  LAppModel.prototype.hitTest = function(x, y) {
    var hitAreas = this._modelSetting.HitAreas || [];
    for (var i = 0; i < hitAreas.length; i++) {
      if (hitAreas[i].Name === 'Head' || hitAreas[i].Name === 'Body') {
        return hitAreas[i].Name;
      }
    }
    return null;
  };

  LAppModel.prototype.getModelMatrix = function() {
    return this._modelMatrix;
  };

  LAppModel.prototype.isInitialized = function() {
    return this._initialized;
  };

  LAppModel.prototype.resize = function(width, height) {
    if (this._viewMatrix) {
      this._viewMatrix.setupForViewport(width, height);
    }
  };

  // ========================================================================
  // Export
  // ========================================================================

  window.LAppModel = LAppModel;

})();
