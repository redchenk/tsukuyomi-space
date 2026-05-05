/**
 * Vue room initialization for TsukimiYachiyo Live2D.
 */

import { CubismFramework, Option } from '@framework/live2dcubismframework';
import * as LAppDefine from './lappdefine';
import { LAppPal } from './lapppal';
import { LAppSubdelegate } from './lappsubdelegate';

type RoomLive2DState = {
  canvas: HTMLCanvasElement;
  subdelegate: LAppSubdelegate;
  frameId: number;
  lastFrameAt: number;
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
};

let roomState: RoomLive2DState | null = null;

function ensureCubismStarted(): void {
  if ((window as any).TSUKUYOMI_CUBISM_STARTED) return;

  LAppPal.updateTime();
  const option = new Option();
  option.logFunction = LAppPal.printMessage;
  option.loggingLevel = LAppDefine.CubismLoggingLevel;
  CubismFramework.startUp(option);
  CubismFramework.initialize();
  (window as any).TSUKUYOMI_CUBISM_STARTED = true;
}

function getTargetFrameInterval(): number {
  const forcedFps = Number((window as any).TSUKUYOMI_LIVE2D_MAX_FPS || 0);
  if (Number.isFinite(forcedFps) && forcedFps >= 24) {
    return 1000 / Math.min(forcedFps, 60);
  }

  return (window as any).TSUKUYOMI_ROOM_MOBILE_LIVE2D ? 1000 / 45 : 1000 / 60;
}

function destroyRoomLive2D(): void {
  if (!roomState) return;

  cancelAnimationFrame(roomState.frameId);
  document.removeEventListener('pointerdown', roomState.onPointerDown);
  document.removeEventListener('pointermove', roomState.onPointerMove);
  document.removeEventListener('pointerup', roomState.onPointerUp);
  document.removeEventListener('pointercancel', roomState.onPointerUp);

  roomState.subdelegate.release();
  roomState.canvas.remove();
  roomState = null;

  if ((window as any).setLive2DModelSettings) {
    delete (window as any).setLive2DModelSettings;
  }
}

function initRoomLive2D(): void {
  destroyRoomLive2D();
  (window as any).TSUKUYOMI_LIVE2D_READY = false;

  const container = document.getElementById('live2d-container');
  if (!container) {
    console.error('#live2d-container not found');
    return;
  }

  ensureCubismStarted();

  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);

  canvas.width = container.clientWidth || 600;
  canvas.height = container.clientHeight || 700;

  const subdelegate = new LAppSubdelegate();
  if (!subdelegate.initialize(canvas)) {
    console.error('Failed to initialize LAppSubdelegate');
    canvas.remove();
    return;
  }

  const onPointerDown = (event: PointerEvent): void => {
    subdelegate.onPointBegan(event.pageX, event.pageY);
  };
  const onPointerMove = (event: PointerEvent): void => {
    subdelegate.onPointMoved(event.pageX, event.pageY);
  };
  const onPointerUp = (event: PointerEvent): void => {
    subdelegate.onPointEnded(event.pageX, event.pageY);
  };

  document.addEventListener('pointerdown', onPointerDown, { passive: true });
  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerup', onPointerUp, { passive: true });
  document.addEventListener('pointercancel', onPointerUp, { passive: true });

  const run = (now: number): void => {
    if (!roomState) return;

    if (!document.hidden && now - roomState.lastFrameAt >= getTargetFrameInterval()) {
      roomState.lastFrameAt = now;
      LAppPal.updateTime();
      subdelegate.update();
    }

    roomState.frameId = requestAnimationFrame(run);
  };

  roomState = {
    canvas,
    subdelegate,
    frameId: requestAnimationFrame(run),
    lastFrameAt: 0,
    onPointerDown,
    onPointerMove,
    onPointerUp
  };

  (window as any).setLive2DModelSettings = function(
    scale: number,
    xOffset: number,
    yOffset: number
  ): void {
    const view = (subdelegate as any)._view;
    if (view && view._viewMatrix) {
      const baseScale = 1.0;
      view._viewMatrix.scale(baseScale * scale, baseScale * scale);
      view._viewMatrix.translateX(xOffset * 0.002);
      view._viewMatrix.translateY(-yOffset * 0.002);
    }
  };
}

(window as any).initTsukuyomiLive2DRoom = initRoomLive2D;
(window as any).destroyTsukuyomiLive2DRoom = destroyRoomLive2D;

if (!(window as any).TSUKUYOMI_EXTERNAL_LIVE2D) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRoomLive2D, { once: true });
  } else {
    initRoomLive2D();
  }
}
