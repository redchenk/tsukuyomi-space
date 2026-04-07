/**
 * Live2D Cubism Framework - Simplified Bundle for tsukuyomi-space
 * Based on TsukimiYachiyo's implementation pattern
 */

// ============================================================================
// Cubism Framework Core
// ============================================================================

var CubismFramework_Instance = null;
var CubismFramework = {
  Version: '5.0.0',

  _idManager: null,
  _logger: null,
  _option: null,

  getIdManager: function() {
    return this._idManager;
  },

  initialize: function(option) {
    this._option = option || { logger: null };
    this._logger = this._option.logger || {
      print: function(msg) { console.log(msg); },
      printMark: function(msg) { console.log('[MARK] ' + msg); },
      printDebug: function(msg) { console.log('[DEBUG] ' + msg); },
      printError: function(msg) { console.error('[ERROR] ' + msg); },
      printInfo: function(msg) { console.log('[INFO] ' + msg); }
    };
    this._idManager = new CubismIdManager();
    CubismFramework_Instance = this;
  },

  clear: function() {
    this._idManager = null;
    this._logger = null;
    this._option = null;
    CubismFramework_Instance = null;
  },

  getLogger: function() {
    return this._logger;
  },

  getFrameworkDirectory: function() {
    return '';
  },

  getLock: function() {
    return false;
  }
};

function CSM_LOG(msg) {
  if (CubismFramework_Instance && CubismFramework_Instance.getLogger()) {
    CubismFramework_Instance.getLogger().print(msg);
  }
}

// ============================================================================
// CubismIdManager
// ============================================================================

var CubismIdManager = function() {
  this._ids = {};
  this._ids2 = [];
};

CubismIdManager.prototype.getId = function(id) {
  if (!this._ids[id]) {
    this._ids[id] = new CubismId(id);
    this._ids2.push(this._ids[id]);
  }
  return this._ids[id];
};

CubismIdManager.prototype.getIds = function() {
  return this._ids2;
};

// ============================================================================
// CubismId
// ============================================================================

var CubismId = function(id) {
  this._id = id;
};

CubismId.prototype.getString = function() {
  return this._id;
};

CubismId.prototype.equals = function(other) {
  if (other instanceof CubismId) {
    return this._id === other._id;
  }
  return false;
};

// ============================================================================
// CubismDefaultParameterId
// ============================================================================

var CubismDefaultParameterId = {
  ParamAngleX: 'ParamAngleX',
  ParamAngleY: 'ParamAngleY',
  ParamAngleZ: 'ParamAngleZ',
  ParamEyeBallX: 'ParamEyeBallX',
  ParamEyeBallY: 'ParamEyeBallY',
  ParamBodyAngleX: 'ParamBodyAngleX',
  ParamBreath: 'ParamBreath',
  ParamEyeLOpen: 'ParamEyeLOpen',
  ParamEyeROpen: 'ParamEyeROpen',
  ParamMouthOpenY: 'ParamMouthOpenY'
};

// ============================================================================
// CubismModel
// ============================================================================

var CubismModel = function() {
  this._canvasinfowidth = 0;
  this._canvasinfOheight = 0;
  this._parameters = [];
  this._parametervalues = [];
  this._parameterMaximumvalues = [];
  this._parameterMinimumvalues = [];
  this._parameterDefaultvalues = [];
  this._parts = [];
  this._partopacities = [];
  this._drawables = [];
  this._drawabledraworders = [];
  this._drawableopacities = [];
  this._drawablemasks = [];
  this._drawablenumber = 0;
  this._parameternumber = 0;
  this._partnumber = 0;
  this._curvatures = [];
  this._model = null;
};

CubismModel.prototype.getCanvasWidth = function() {
  return this._canvasinfowidth;
};

CubismModel.prototype.getCanvasHeight = function() {
  return this._canvasinfOheight;
};

CubismModel.prototype.getParameterValue = function(id) {
  var index = this.getParameterIndex(id);
  if (index >= 0) {
    return this._parametervalues[index];
  }
  return 0;
};

CubismModel.prototype.setParameterValue = function(id, value) {
  var index = this.getParameterIndex(id);
  if (index >= 0) {
    this._parametervalues[index] = value;
  }
};

CubismModel.prototype.getParameterIndex = function(id) {
  var idstr = typeof id === 'string' ? id : id.getString();
  for (var i = 0; i < this._parameternumber; i++) {
    if (this._parameters[i] === idstr) {
      return i;
    }
  }
  return -1;
};

CubismModel.prototype.addParameterValue = function(id, value) {
  var index = this.getParameterIndex(id);
  if (index >= 0) {
    this._parametervalues[index] += value;
  }
};

CubismModel.prototype.update = function() {
  // Called each frame to update model state
};

// ============================================================================
// CubismMoc
// ============================================================================

var CubismMoc = {
  fromArrayBuffer: function(buffer) {
    // Create from .moc3 file buffer
    return { _buffer: buffer };
  }
};

// ============================================================================
// CubismUserModel - Base class for model management
// ============================================================================

var CubismUserModel = function() {
  this._model = null;
  this._moc = null;
  this._textureLoader = null;
  this._opacity = 1;
  this._anchorX = 0;
  this._anchorY = 0;
  this._modelMatrix = null;

  // Motion related
  this._motions = {};
  this._motionManager = null;
  this._expressions = {};
  this._expressionManager = null;

  // Effect related
  this._eyeBlink = null;
  this._breath = null;
  this._physics = null;
  this._pose = null;

  // Drag
  this._dragX = 0;
  this._dragY = 0;
  this._dragManager = null;

  this._initialized = false;
  this._updating = false;
};

CubismUserModel.prototype.loadModel = function(buffer, consistency) {
  // Load model from .moc3 buffer
  this._moc = window.Live2DCubismCore.Moc.fromArrayBuffer(buffer);
  if (!this._moc) {
    CSM_LOG('Failed to load Moc');
    return;
  }
  this._model = window.Live2DCubismCore.Model.fromMoc(this._moc);
  if (!this._model) {
    CSM_LOG('Failed to create Model');
    return;
  }
  this._initialize();
};

CubismUserModel.prototype._initialize = function() {
  if (!this._model) return;

  // Initialize parameter values
  var paramCount = this._model.parameters.count;
  this._parametervalues = [];
  this._parameterMaximumvalues = [];
  this._parameterMinimumvalues = [];
  this._parameterDefaultvalues = [];

  for (var i = 0; i < paramCount; i++) {
    this._parametervalues.push(0);
    this._parameterMaximumvalues.push(this._model.parameters.maximumValues[i]);
    this._parameterMinimumvalues.push(this._model.parameters.minimumValues[i]);
    this._parameterDefaultvalues.push(this._model.parameters.defaultValues[i]);
  }

  this._initialized = true;
};

CubismUserModel.prototype.createRenderer = function() {
  // Create WebGL renderer - override in subclass
};

CubismUserModel.prototype.getRenderer = function() {
  return this._renderer;
};

CubismUserModel.prototype.getModel = function() {
  return this._model;
};

CubismUserModel.prototype.update = function() {
  if (!this._model) return;
  this._model.update();
};

CubismUserModel.prototype.draw = function(matrix) {
  // Override in subclass
};

// ============================================================================
// CubismMotionManager
// ============================================================================

var CubismMotionManager = function() {
  this._motions = {};
  this._currentMotion = null;
  this._priority = 0;
  this._reservedPriority = 0;
};

CubismMotionManager.prototype.updateMotion = function(model, deltaTime) {
  if (!this._currentMotion) return false;
  // Update current motion
  return true;
};

CubismMotionManager.prototype.isFinished = function() {
  return true; // Override based on actual motion state
};

CubismMotionManager.prototype.startMotion = function(motion) {
  this._currentMotion = motion;
};

CubismMotionManager.prototype.stopAllMotions = function() {
  this._currentMotion = null;
};

// ============================================================================
// CubismExpressionManager
// ============================================================================

var CubismExpressionManager = function() {
  this._expressions = {};
  this._currentExpression = null;
};

CubismExpressionManager.prototype.updateMotion = function(model, deltaTime) {
  // Update expression
};

// ============================================================================
// CubismEyeBlink
// ============================================================================

var CubismEyeBlink = {
  create: function(setting) {
    return new CubismEyeBlinkInstance();
  }
};

var CubismEyeBlinkInstance = function() {
  this._opening = 1.0;
  this._targetOpening = 1.0;
};

CubismEyeBlinkInstance.prototype.updateParameters = function(model, deltaTime) {
  // Implement eye blink logic
};

// ============================================================================
// CubismBreath
// ============================================================================

var CubismBreath = {
  create: function() {
    return new CubismBreathInstance();
  }
};

var BreathParameterData = function(id, blend, min, max, speed) {
  this.id = id;
  this.blend = blend;
  this.min = min;
  this.max = max;
  this.speed = speed;
};

var CubismBreathInstance = function() {
  this._parameters = [];
  this._breathTime = 0;
};

CubismBreathInstance.prototype.setParameters = function(parameters) {
  this._parameters = parameters;
};

CubismBreathInstance.prototype.updateParameters = function(model, deltaTime) {
  this._breathTime += deltaTime;
  var t = this._breathTime;

  for (var i = 0; i < this._parameters.length; i++) {
    var p = this._parameters[i];
    var value = (Math.sin(t * p.speed) + 1) / 2 * (p.max - p.min) + p.min;
    model.addParameterValue(p.id, value);
  }
};

// ============================================================================
// CubismPhysics
// ============================================================================

var CubismPhysics = {
  create: function() {
    return new CubismPhysicsInstance();
  },
  evaluate: function(model, deltaTime) {
    // Evaluate physics
  }
};

var CubismPhysicsInstance = function() {
  this._physics = null;
};

CubismPhysicsInstance.prototype.load = function(buffer, size) {
  // Load physics from JSON
};

// ============================================================================
// LAppModel - Live2D Model for tsukuyomi-space
// ============================================================================

var LAppModel = function() {
  CubismUserModel.call(this);

  this._modelHomeDir = '';
  this._modelSetting = null;
  this._userTimeSeconds = 0;

  this._eyeBlinkIds = [];
  this._lipSyncIds = [];

  this._hitAreas = [];
  this._userAreas = [];

  this._state = 0;
  this._expressionCount = 0;
  this._textureCount = 0;
  this._motionCount = 0;
  this._allMotionCount = 0;

  this._gl = null;
  this._textures = [];
  this._frameBuffer = null;

  // Properly initialize arrays from parent
  this._motions = {};
  this._expressions = {};

  // IDs
  this._idParamAngleX = CubismFramework.getIdManager().getId(CubismDefaultParameterId.ParamAngleX);
  this._idParamAngleY = CubismFramework.getIdManager().getId(CubismDefaultParameterId.ParamAngleY);
  this._idParamAngleZ = CubismFramework.getIdManager().getId(CubismDefaultParameterId.ParamAngleZ);
  this._idParamEyeBallX = CubismFramework.getIdManager().getId(CubismDefaultParameterId.ParamEyeBallX);
  this._idParamEyeBallY = CubismFramework.getIdManager().getId(CubismDefaultParameterId.ParamEyeBallY);
  this._idParamBodyAngleX = CubismFramework.getIdManager().getId(CubismDefaultParameterId.ParamBodyAngleX);
  this._idParamBreath = CubismFramework.getIdManager().getId(CubismDefaultParameterId.ParamBreath);

  // Managers
  this._motionManager = new CubismMotionManager();
  this._expressionManager = new CubismExpressionManager();

  // Eye blink
  this._eyeBlink = CubismEyeBlink.create(this._modelSetting);

  // Breath
  this._breath = CubismBreath.create();
  this._setupBreath();

  // Model matrix
  this._modelMatrix = new CubismModelMatrix(0, 0, 1, 1);

  this._renderer = null;
};

LAppModel.prototype = Object.create(CubismUserModel.prototype);
LAppModel.prototype.constructor = LAppModel;

LAppModel.LoadStep = {
  LoadAssets: 0,
  LoadModel: 1,
  WaitLoadModel: 2,
  LoadExpression: 3,
  LoadPhysics: 4,
  LoadPose: 5,
  SetupEyeBlink: 6,
  SetupBreath: 7,
  LoadMotion: 8,
  CompleteInitialize: 9,
  CompleteSetup: 10
};

LAppModel.prototype._setupBreath = function() {
  var breathParameters = [];
  breathParameters.push(new BreathParameterData(this._idParamAngleX, 0, 15, 6.5345, 0.5));
  breathParameters.push(new BreathParameterData(this._idParamAngleY, 0, 8, 3.5345, 0.5));
  breathParameters.push(new BreathParameterData(this._idParamAngleZ, 0, 10, 5.5345, 0.5));
  breathParameters.push(new BreathParameterData(this._idParamBodyAngleX, 0, 4, 15.5345, 0.5));
  breathParameters.push(new BreathParameterData(this._idParamBreath, 0.5, 0.5, 3.2345, 1));
  this._breath.setParameters(breathParameters);
};

LAppModel.prototype.loadAssets = function(dir, fileName, callback) {
  var thisModel = this;
  this._modelHomeDir = dir;

  fetch(dir + fileName)
    .then(function(response) {
      return response.json();
    })
    .then(function(json) {
      thisModel._modelSetting = json;
      thisModel._state = LAppModel.LoadStep.LoadModel;
      thisModel._loadModel(callback);
    })
    .catch(function(error) {
      console.error('Failed to load model assets: ' + error);
    });
};

LAppModel.prototype._loadModel = function(callback) {
  var thisModel = this;
  var mocPath = this._modelHomeDir + this._modelSetting.FileReferences.Moc;

  fetch(mocPath)
    .then(function(response) {
      return response.arrayBuffer();
    })
    .then(function(arrayBuffer) {
      thisModel.loadModel(arrayBuffer, true);
      thisModel._state = LAppModel.LoadStep.LoadExpression;
      thisModel._loadExpressions(callback);
    })
    .catch(function(error) {
      console.error('Failed to load moc: ' + error);
    });
};

LAppModel.prototype._loadExpressions = function(callback) {
  var thisModel = this;
  var expressions = this._modelSetting.FileReferences.Expressions;

  if (!expressions || expressions.length === 0) {
    this._state = LAppModel.LoadStep.LoadPhysics;
    this._loadPhysics(callback);
    return;
  }

  var loadedCount = 0;
  var total = expressions.length;

  for (var i = 0; i < expressions.length; i++) {
    var expr = expressions[i];
    var exprPath = this._modelHomeDir + expr.File;

    fetch(exprPath)
      .then(function(response) {
        return response.json();
      })
      .then(function(json) {
        var name = expr.Name || json.Name || 'exp_' + loadedCount;
        thisModel._expressions[name] = json;
        loadedCount++;

        if (loadedCount >= total) {
          thisModel._state = LAppModel.LoadStep.LoadPhysics;
          thisModel._loadPhysics(callback);
        }
      })
      .catch(function(error) {
        console.error('Failed to load expression: ' + error);
        loadedCount++;
        if (loadedCount >= total) {
          thisModel._state = LAppModel.LoadStep.LoadPhysics;
          thisModel._loadPhysics(callback);
        }
      });
  }
};

LAppModel.prototype._loadPhysics = function(callback) {
  var thisModel = this;
  var physicsPath = this._modelSetting.FileReferences.Physics;

  if (!physicsPath) {
    this._state = LAppModel.LoadStep.LoadPose;
    this._loadPose(callback);
    return;
  }

  fetch(this._modelHomeDir + physicsPath)
    .then(function(response) {
      return response.json();
    })
    .then(function(json) {
      thisModel._physics = CubismPhysics.create();
      thisModel._physics.load(json);
      thisModel._state = LAppModel.LoadStep.LoadPose;
      thisModel._loadPose(callback);
    })
    .catch(function(error) {
      console.error('Failed to load physics: ' + error);
      thisModel._state = LAppModel.LoadStep.LoadPose;
      thisModel._loadPose(callback);
    });
};

LAppModel.prototype._loadPose = function(callback) {
  // Skip pose loading for now - can be added later
  this._state = LAppModel.LoadStep.SetupEyeBlink;
  this._setupEyeBlink(callback);
};

LAppModel.prototype._setupEyeBlink = function(callback) {
  var eyeBlinkParams = this._modelSetting.HitAreas || [];
  // Use default eye blink if model has eye parameters
  if (eyeBlinkParams.length > 0 || this._model && this._model.parameters) {
    this._eyeBlink = CubismEyeBlink.create(this._modelSetting);
  }
  this._state = LAppModel.LoadStep.SetupBreath;
  this._setupLayout(callback);
};

LAppModel.prototype._setupLayout = function(callback) {
  var layout = this._modelSetting.Layout || {};

  if (this._modelMatrix) {
    this._modelMatrix.setupFromLayout(layout);
  }

  this._state = LAppModel.LoadStep.LoadMotion;
  this._loadMotions(callback);
};

LAppModel.prototype._loadMotions = function(callback) {
  var thisModel = this;
  var motions = this._modelSetting.FileReferences.Motions || {};

  var groupNames = Object.keys(motions);
  if (groupNames.length === 0) {
    this._state = LAppModel.LoadStep.CompleteInitialize;
    this._initializeGraphics(callback);
    return;
  }

  var loadedCount = 0;
  var totalCount = 0;

  // Count total motions
  for (var g = 0; g < groupNames.length; g++) {
    var group = motions[groupNames[g]];
    totalCount += group.length;
  }

  // Load all motions
  for (var i = 0; i < groupNames.length; i++) {
    var groupName = groupNames[i];
    var group = motions[groupName];

    for (var j = 0; j < group.length; j++) {
      var motionPath = this._modelHomeDir + group[j].File;
      var motionName = groupName + '_' + j;

      fetch(motionPath)
        .then(function(response) {
          return response.arrayBuffer();
        })
        .then(function(buffer) {
          thisModel._motions[motionName] = {
            buffer: buffer,
            name: motionName
          };
          loadedCount++;

          if (loadedCount >= totalCount) {
            thisModel._state = LAppModel.LoadStep.CompleteInitialize;
            thisModel._initializeGraphics(callback);
          }
        })
        .catch(function(error) {
          console.error('Failed to load motion: ' + motionPath);
          loadedCount++;
          if (loadedCount >= totalCount) {
            thisModel._state = LAppModel.LoadStep.CompleteInitialize;
            thisModel._initializeGraphics(callback);
          }
        });
    }
  }
};

LAppModel.prototype._initializeGraphics = function(callback) {
  var thisModel = this;

  // Create WebGL renderer
  this.createRenderer();

  // Load textures
  var textures = this._modelSetting.FileReferences.Textures;
  var loadedTextures = 0;
  var totalTextures = textures.length;

  if (totalTextures === 0) {
    this._state = LAppModel.LoadStep.CompleteSetup;
    if (callback) callback(this);
    return;
  }

  for (var i = 0; i < textures.length; i++) {
    var texturePath = this._modelHomeDir + textures[i];

    this._loadTexture(texturePath, i, function(textureIndex, texture) {
      thisModel._textures[textureIndex] = texture;
      loadedTextures++;

      if (loadedTextures >= totalTextures) {
        thisModel._state = LAppModel.LoadStep.CompleteSetup;
        if (callback) callback(thisModel);
      }
    });
  }
};

LAppModel.prototype._loadTexture = function(path, index, callback) {
  var img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function() {
    callback(index, img);
  };
  img.onerror = function() {
    console.error('Failed to load texture: ' + path);
    callback(index, null);
  };
  img.src = path;
};

LAppModel.prototype.createRenderer = function() {
  this._renderer = new LAppRenderer(this);
};

LAppModel.prototype.getGl = function() {
  return this._gl;
};

LAppModel.prototype.setGl = function(gl) {
  this._gl = gl;
};

LAppModel.prototype.setFrameBuffer = function(fb) {
  this._frameBuffer = fb;
};

LAppModel.prototype.update = function(deltaTime) {
  if (this._state !== LAppModel.LoadStep.CompleteSetup) return;

  this._userTimeSeconds += deltaTime;

  var deltaTimeSeconds = deltaTime / 1000;

  // Update drag
  this._dragX = this._dragManager ? this._dragManager.getX() : 0;
  this._dragY = this._dragManager ? this._dragManager.getY() : 0;

  // Update motion
  if (this._motionManager.isFinished()) {
    this.startRandomMotion('Idle', 1);
  } else {
    this._motionManager.updateMotion(this._model, deltaTimeSeconds);
  }

  // Update expression
  if (this._expressionManager) {
    this._expressionManager.updateMotion(this._model, deltaTimeSeconds);
  }

  // Update eye blink
  if (this._eyeBlink) {
    this._eyeBlink.updateParameters(this._model, deltaTimeSeconds);
  }

  // Apply drag
  this._model.addParameterValue(this._idParamAngleX, this._dragX * 30);
  this._model.addParameterValue(this._idParamAngleY, this._dragY * 30);
  this._model.addParameterValue(this._idParamAngleZ, this._dragX * this._dragY * -30);
  this._model.addParameterValue(this._idParamBodyAngleX, this._dragX * 10);
  this._model.addParameterValue(this._idParamEyeBallX, this._dragX);
  this._model.addParameterValue(this._idParamEyeBallY, this._dragY);

  // Update breath
  if (this._breath) {
    this._breath.updateParameters(this._model, deltaTimeSeconds);
  }

  // Update physics
  if (this._physics) {
    CubismPhysics.evaluate(this._model, deltaTimeSeconds);
  }

  // Update model
  if (this._model) {
    this._model.update();
  }
};

LAppModel.prototype.draw = function(matrix) {
  if (this._state !== LAppModel.LoadStep.CompleteSetup) return;
  if (!this._renderer) return;

  matrix.multiplyByMatrix(this._modelMatrix);
  this._renderer.setMvpMatrix(matrix);
  this._renderer.drawModel();
};

LAppModel.prototype.startMotion = function(group, no, priority) {
  var motionKey = group + '_' + no;
  var motion = this._motions[motionKey];

  if (!motion) {
    console.warn('Motion not found: ' + motionKey);
    return;
  }

  this._motionManager.startMotion(motion);
};

LAppModel.prototype.startRandomMotion = function(group, priority) {
  if (!this._modelSetting || !this._modelSetting.FileReferences.Motions) return;

  var motions = this._modelSetting.FileReferences.Motions[group];
  if (!motions || motions.length === 0) return;

  var no = Math.floor(Math.random() * motions.length);
  this.startMotion(group, no, priority);
};

LAppModel.prototype.setExpression = function(expressionId) {
  var expr = this._expressions[expressionId];
  if (!expr) return;

  // Apply expression parameters
  if (expr.Parameters) {
    for (var i = 0; i < expr.Parameters.length; i++) {
      var param = expr.Parameters[i];
      var id = CubismFramework.getIdManager().getId(param.Id);
      this._model.addParameterValue(id, param.Value);
    }
  }
};

LAppModel.prototype.setRandomExpression = function() {
  var names = Object.keys(this._expressions);
  if (names.length === 0) return;

  var no = Math.floor(Math.random() * names.length);
  this.setExpression(names[no]);
};

LAppModel.prototype.hitTest = function(hitAreaName, x, y) {
  var hitAreas = this._modelSetting.HitAreas || [];

  for (var i = 0; i < hitAreas.length; i++) {
    if (hitAreas[i].Name === hitAreaName) {
      // Simple bounding box hit test
      // In a full implementation, this would use actual vertex data
      return true;
    }
  }
  return false;
};

LAppModel.prototype.getModelMatrix = function() {
  return this._modelMatrix;
};

// ============================================================================
// LAppRenderer - WebGL Renderer
// ============================================================================

var LAppRenderer = function(model) {
  this._model = model;
  this._gl = null;
  this._shaderProgram = null;
  this._mvpMatrix = null;
  this._textures = [];
  this._drawables = null;
};

LAppRenderer.prototype.initialize = function(gl) {
  this._gl = gl;
  this._createShader();
};

LAppRenderer.prototype._createShader = function() {
  var gl = this._gl;

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

  var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, fragmentShaderSource);
  gl.compileShader(fragmentShader);

  this._shaderProgram = gl.createProgram();
  gl.attachShader(this._shaderProgram, vertexShader);
  gl.attachShader(this._shaderProgram, fragmentShader);
  gl.linkProgram(this._shaderProgram);

  this._shaderProgram.aVertexPosition = gl.getAttribLocation(this._shaderProgram, 'aVertexPosition');
  this._shaderProgram.aTextureCoord = gl.getAttribLocation(this._shaderProgram, 'aTextureCoord');
  this._shaderProgram.uMvpMatrix = gl.getUniformLocation(this._shaderProgram, 'uMvpMatrix');
  this._shaderProgram.uTexture = gl.getUniformLocation(this._shaderProgram, 'uTexture');
  this._shaderProgram.uOpacity = gl.getUniformLocation(this._shaderProgram, 'uOpacity');
};

LAppRenderer.prototype.setMvpMatrix = function(matrix) {
  this._mvpMatrix = matrix;
};

LAppRenderer.prototype.setTextures = function(textures) {
  this._textures = textures;
};

LAppRenderer.prototype.drawModel = function() {
  var model = this._model.getModel();
  if (!model || !this._gl) return;

  var gl = this._gl;
  var drawables = model.drawables;

  gl.useProgram(this._shaderProgram);

  for (var i = 0; i < drawables.count; i++) {
    var textureIndex = drawables.textureIndices[i];
    if (textureIndex < 0 || textureIndex >= this._textures.length) continue;

    var opacity = drawables.opacities[i];
    if (opacity <= 0) continue;

    var vertexPositions = drawables.vertexPositions[i];
    var uvs = drawables.vertexUvs[i];
    var indices = drawables.indices[i];

    if (!vertexPositions || !uvs || !indices) continue;

    // Create buffers if needed
    if (!this._buffers) this._buffers = {};

    // Bind texture
    gl.activeTexture(gl.TEXTURE0 + textureIndex);
    gl.bindTexture(gl.TEXTURE_2D, this._textures[textureIndex]);
    gl.uniform1i(this._shaderProgram.uTexture, textureIndex);
    gl.uniform1f(this._shaderProgram.uOpacity, opacity);

    // Set vertex data
    var vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexPositions), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this._shaderProgram.aVertexPosition);
    gl.vertexAttribPointer(this._shaderProgram.aVertexPosition, 2, gl.FLOAT, false, 0, 0);

    var uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this._shaderProgram.aTextureCoord);
    gl.vertexAttribPointer(this._shaderProgram.aTextureCoord, 2, gl.FLOAT, false, 0, 0);

    // Set MVP matrix
    if (this._mvpMatrix) {
      gl.uniformMatrix4fv(this._shaderProgram.uMvpMatrix, false, this._mvpMatrix.getArray());
    }

    // Draw
    var indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);

    // Cleanup
    gl.deleteBuffer(vertexBuffer);
    gl.deleteBuffer(uvBuffer);
    gl.deleteBuffer(indexBuffer);
  }
};

// ============================================================================
// CubismModelMatrix
// ============================================================================

var CubismModelMatrix = function(w, h, maxScale, minScale) {
  this._width = w || 1;
  this._height = h || 1;
  this._maxScale = maxScale || 1;
  this._minScale = minScale || 1;
  this._matrix = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
};

CubismModelMatrix.prototype.setupFromLayout = function(layout) {
  var contentScale = layout.Width || 1;
  var modelX = layout.X || 0;
  var modelY = layout.Y || 0;
  var modelWidth = layout.Width || this._width;
  var modelHeight = layout.Height || this._height;

  var scaleX = contentScale / modelWidth;
  var scaleY = contentScale / modelHeight;
  var scale = Math.min(scaleX, scaleY);

  scale = Math.min(scale, this._maxScale);
  scale = Math.max(scale, this._minScale);

  var translateX = modelX - (contentScale / 2);
  var translateY = modelY + (contentScale / 2);

  this._matrix[0] = scale;
  this._matrix[5] = -scale;
  this._matrix[12] = translateX;
  this._matrix[13] = translateY;
};

CubismModelMatrix.prototype.multiplyByMatrix = function(matrix) {
  var result = new Float32Array(16);
  for (var i = 0; i < 4; i++) {
    for (var j = 0; j < 4; j++) {
      result[i * 4 + j] =
        this._matrix[i * 4 + 0] * matrix._matrix[0 * 4 + j] +
        this._matrix[i * 4 + 1] * matrix._matrix[1 * 4 + j] +
        this._matrix[i * 4 + 2] * matrix._matrix[2 * 4 + j] +
        this._matrix[i * 4 + 3] * matrix._matrix[3 * 4 + j];
    }
  }
  this._matrix = result;
};

CubismModelMatrix.prototype.getArray = function() {
  return this._matrix;
};

CubismModelMatrix.prototype.getScale = function() {
  return { x: this._matrix[0], y: this._matrix[5] };
};

// ============================================================================
// CubismMatrix44
// ============================================================================

var CubismMatrix44 = function() {
  this._matrix = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
};

CubismMatrix44.prototype.getArray = function() {
  return this._matrix;
};

CubismMatrix44.prototype multiplyByMatrix = function(matrix) {
  var result = new Float32Array(16);
  for (var i = 0; i < 4; i++) {
    for (var j = 0; j < 4; j++) {
      result[i * 4 + j] =
        this._matrix[i * 4 + 0] * matrix._matrix[0 * 4 + j] +
        this._matrix[i * 4 + 1] * matrix._matrix[1 * 4 + j] +
        this._matrix[i * 4 + 2] * matrix._matrix[2 * 4 + j] +
        this._matrix[i * 4 + 3] * matrix._matrix[3 * 4 + j];
    }
  }
  this._matrix = result;
};

CubismMatrix44.prototype.translate = function(x, y) {
  var translateMatrix = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,0,1]);
  this.multiplyByMatrix({ _matrix: translateMatrix });
};

CubismMatrix44.prototype.scale = function(x, y) {
  var scaleMatrix = new Float32Array([x,0,0,0, 0,y,0,0, 0,0,1,0, 0,0,0,1]);
  this.multiplyByMatrix({ _matrix: scaleMatrix });
};

CubismMatrix44.prototype.setMatrix = function(matrix) {
  this._matrix = new Float32Array(matrix);
};

// ============================================================================
// CubismViewMatrix
// ============================================================================

var CubismViewMatrix = function() {
  CubismMatrix44.call(this);
  this._screenLeft = 0;
  this._screenRight = 0;
  this._screenTop = 0;
  this._screenBottom = 0;
  this._deviceToScreen = new CubismMatrix44();
};

CubismViewMatrix.prototype.setupForViewport = function(width, height) {
  var aspectRatio = width / height;
  this._screenLeft = -aspectRatio;
  this._screenRight = aspectRatio;
  this._screenTop = 1;
  this._screenBottom = -1;

  var scaleX = 2 / (this._screenRight - this._screenLeft);
  var scaleY = 2 / (this._screenTop - this._screenBottom);
  var translateX = -(this._screenRight + this._screenLeft) / 2;
  var translateY = -(this._screenTop + this._screenBottom) / 2;

  this._matrix[0] = scaleX;
  this._matrix[5] = scaleY;
  this._matrix[12] = translateX * scaleX;
  this._matrix[13] = translateY * scaleY;
};

CubismViewMatrix.prototype.getMatrix = function() {
  return this._matrix;
};

CubismViewMatrix.prototype.multiplyByMatrix = function(matrix) {
  CubismMatrix44.prototype.multiplyByMatrix.call(this, matrix);
};

// ============================================================================
// LAppPal - Platform Abstraction Layer
// ============================================================================

var LAppPal = {
  _deltaTime: 0,
  _currentTime: 0,
  _startTime: 0,

  initialize: function() {
    this._startTime = Date.now();
    this._currentTime = this._startTime;
  },

  getDeltaTime: function() {
    return this._deltaTime;
  },

  updateTime: function() {
    var newTime = Date.now();
    this._deltaTime = (newTime - this._currentTime) / 1000;
    this._currentTime = newTime;
  },

  printMessage: function(msg) {
    console.log('[LAppPal] ' + msg);
  }
};

// ============================================================================
// LAppLive2DManager
// ============================================================================

var LAppLive2DManager = {
  _instance: null,
  _models: [],
  _currentModel: null,
  _gl: null,

  getInstance: function() {
    if (!LAppLive2DManager._instance) {
      LAppLive2DManager._instance = new LAppLive2DManager();
    }
    return LAppLive2DManager._instance;
  },

  createModel: function(gl) {
    var model = new LAppModel();
    model.setGl(gl);
    this._models.push(model);
    this._currentModel = model;
    return model;
  },

  getModel: function(index) {
    if (index >= 0 && index < this._models.length) {
      return this._models[index];
    }
    return null;
  },

  getCurrentModel: function() {
    return this._currentModel;
  },

  releaseModel: function(index) {
    if (index >= 0 && index < this._models.length) {
      this._models.splice(index, 1);
    }
  },

  setGl: function(gl) {
    this._gl = gl;
  },

  getGl: function() {
    return this._gl;
  }
};

// ============================================================================
// Drag Manager
// ============================================================================

var LAppDragManager = function() {
  this._x = 0;
  this._y = 0;
  this._isDragging = false;
};

LAppDragManager.prototype.update = function(deltaTime) {
  // Smoothly move toward target
};

LAppDragManager.prototype.getX = function() {
  return this._x;
};

LAppDragManager.prototype.getY = function() {
  return this._y;
};

LAppDragManager.prototype.setPoint = function(x, y) {
  this._x = x;
  this._y = y;
};

// ============================================================================
// Exports
// ============================================================================

window.Live2DCubismFramework = {
  CubismFramework: CubismFramework,
  CubismIdManager: CubismIdManager,
  CubismId: CubismId,
  CubismModel: CubismModel,
  CubismUserModel: CubismUserModel,
  CubismMotionManager: CubismMotionManager,
  CubismExpressionManager: CubismExpressionManager,
  CubismEyeBlink: CubismEyeBlink,
  CubismBreath: CubismBreath,
  CubismPhysics: CubismPhysics,
  CubismModelMatrix: CubismModelMatrix,
  CubismMatrix44: CubismMatrix44,
  CubismViewMatrix: CubismViewMatrix,
  LAppModel: LAppModel,
  LAppRenderer: LAppRenderer,
  LAppPal: LAppPal,
  LAppLive2DManager: LAppLive2DManager,
  LAppDragManager: LAppDragManager,
  CubismDefaultParameterId: CubismDefaultParameterId
};
