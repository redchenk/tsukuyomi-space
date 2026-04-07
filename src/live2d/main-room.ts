/**
 * Custom room.html initialization for TsukimiYachiyo Live2D
 * Modified to work with room.html's #live2d-container
 */

import { LAppDelegate } from './lappdelegate';
import { CubismFramework, Option } from '@framework/live2dcubismframework';
import * as LAppDefine from './lappdefine';
import { LAppPal } from './lapppal';
import { LAppSubdelegate } from './lappsubdelegate';
import { csmVector } from '@framework/type/csmvector';
import { CubismLogError } from '@framework/utils/cubismdebug';

function initRoomLive2D() {
  console.log('Initializing TsukimiYachiyo Live2D for room.html...');

  // Get canvas container
  const container = document.getElementById('live2d-container');
  if (!container) {
    console.error('#live2d-container not found');
    return;
  }

  // Initialize Cubism
  LAppPal.updateTime();
  const option = new Option();
  option.logFunction = LAppPal.printMessage;
  option.loggingLevel = LAppDefine.CubismLoggingLevel;
  CubismFramework.startUp(option);
  CubismFramework.initialize();

  // Create canvas inside container (like TsukimiYachiyo does internally)
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);

  // Set canvas size
  const width = container.clientWidth || 600;
  const height = container.clientHeight || 700;
  canvas.width = width;
  canvas.height = height;

  // Create subdelegate and initialize (matching TsukimiYachiyo's internal pattern)
  const subdelegate = new LAppSubdelegate();
  if (!subdelegate.initialize(canvas)) {
    console.error('Failed to initialize LAppSubdelegate');
    return;
  }

  // Create delegate instance and store subdelegate
  const delegate = LAppDelegate.getInstance() as any;
  delegate._subdelegates = new csmVector<LAppSubdelegate>();
  delegate._subdelegates.pushBack(subdelegate);

  // Setup event listeners on delegate
  delegate.onPointerBegan = function(e: PointerEvent) {
    for (let i = 0; i < this._subdelegates.getSize(); i++) {
      this._subdelegates.at(i).onPointBegan(e.pageX, e.pageY);
    }
  };
  delegate.onPointerMoved = function(e: PointerEvent) {
    for (let i = 0; i < this._subdelegates.getSize(); i++) {
      this._subdelegates.at(i).onPointMoved(e.pageX, e.pageY);
    }
  };
  delegate.onPointerEnded = function(e: PointerEvent) {
    for (let i = 0; i < this._subdelegates.getSize(); i++) {
      this._subdelegates.at(i).onPointEnded(e.pageX, e.pageY);
    }
  };

  // Add event listeners
  document.addEventListener('pointerdown', delegate.onPointerBinded?.bind(delegate) || delegate.onPointerBegan.bind(delegate), { passive: true });
  document.addEventListener('pointermove', delegate.onPointerMoved.bind(delegate), { passive: true });
  document.addEventListener('pointerup', delegate.onPointerEnded.bind(delegate), { passive: true });

  // Start render loop
  delegate.run();

  // Expose global function to control model scale and position
  (window as any).setLive2DModelSettings = function(scale: number, xOffset: number, yOffset: number) {
    const view = subdelegate._view;
    if (view && view._viewMatrix) {
      // Reset to base scale
      const baseScale = 1.0;
      view._viewMatrix.scale(baseScale * scale, baseScale * scale);
      // Apply offset (xOffset and yOffset are in pixels, convert to normalized coords)
      view._viewMatrix.translateX(xOffset * 0.002); // scale factor to convert pixels to view coords
      view._viewMatrix.translateY(-yOffset * 0.002); // negative because Y is flipped
      console.log('Live2D model settings applied: scale=' + scale + ', x=' + xOffset + ', y=' + yOffset);
    }
  };

  // Hide loading overlay after model starts loading
  setTimeout(() => {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.style.display = 'none';
      console.log('TsukimiYachiyo Live2D ready');
    }
  }, 2000);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRoomLive2D);
} else {
  initRoomLive2D();
}