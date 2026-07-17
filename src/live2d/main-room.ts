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
  pointerFrameId: number;
  visible: boolean;
  actionTimers: number[];
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onTouchStart: (event: TouchEvent) => void;
  onTouchMove: (event: TouchEvent) => void;
  onTouchEnd: (event: TouchEvent) => void;
  onVisibilityChange: () => void;
  onRoomAct: (event: Event) => void;
  onMouth: (event: Event) => void;
  onFaceFrame: (event: Event) => void;
};

let roomState: RoomLive2DState | null = null;

const ROOM_RENDER_FRAME_INTERVAL_MS = 1000 / 60;
const ROOM_RENDER_BALANCED_MAX_FRAME_INTERVAL_MS = 1000 / 45;
const ROOM_RENDER_REDUCED_MAX_FRAME_INTERVAL_MS = 1000 / 30;
const ROOM_RENDER_FRAME_TOLERANCE_MS = 1;
const ROOM_RENDER_HEADROOM_RATIO = 1.35;

function roomRenderMaxFrameInterval(): number {
  return (window as any).TSUKUYOMI_PERFORMANCE_PROFILE === 'reduced'
    ? ROOM_RENDER_REDUCED_MAX_FRAME_INTERVAL_MS
    : ROOM_RENDER_BALANCED_MAX_FRAME_INTERVAL_MS;
}

const allowedExpressions = new Set(['neutral', 'smile', 'bsmile', 'namida', 'tears']);
const allowedTapBodyMotions = new Set(['tap_body', 'body_tap', 'tapbody']);
const allowedBodyPoses = new Set([
  'nod',
  'shake_head',
  'lean_in',
  'lean_left',
  'lean_right',
  'sway',
  'bounce',
  'emphasis'
]);

function isPointerControlDisabled(): boolean {
  return Boolean((window as any).TSUKUYOMI_LIVE2D_DISABLE_POINTER);
}

function isEventInsideNode(event: PointerEvent, node: HTMLElement): boolean {
  const target = event.target;
  return target instanceof Node && node.contains(target);
}

function normalizeExpression(value: unknown): string {
  const expression = String(value || '').trim().toLowerCase();
  return allowedExpressions.has(expression) ? expression : '';
}

function primaryExpressionFromMix(value: unknown): string {
  if (!Array.isArray(value)) return '';
  const sorted = value
    .map((layer) => ({
      expression: normalizeExpression(layer?.expression || layer?.key || layer?.id),
      weight: Number(layer?.weight)
    }))
    .filter((layer) => layer.expression && Number.isFinite(layer.weight) && layer.weight > 0.02)
    .sort((left, right) => right.weight - left.weight);
  return sorted[0]?.expression || '';
}

function normalizeDuration(value: unknown): number {
  const duration = Number(value);
  if (!Number.isFinite(duration)) return 5000;
  return Math.min(Math.max(Math.round(duration), 800), 12000);
}

function normalizeBodyPose(value: unknown): string {
  const pose = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!pose || pose === 'none') return '';
  if (allowedTapBodyMotions.has(pose)) return 'emphasis';
  return allowedBodyPoses.has(pose) ? pose : '';
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
}

function normalizeDelay(value: unknown): number {
  return Math.round(clampNumber(value, 0, 12000, 0));
}

function normalizeParameterDuration(value: unknown): number {
  return Math.round(clampNumber(value, 260, 12000, 900));
}

function normalizeParameterTargets(value: unknown): Array<{ id: string; value: number; weight: number; durationMs: number; delayMs: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const id = String(item?.id || '').trim();
      if (!/^[A-Za-z][A-Za-z0-9_]{1,63}$/.test(id)) return null;
      return {
        id,
        value: clampNumber(item?.value, -60, 60, 0),
        weight: clampNumber(item?.weight, 0, 1, 0.7),
        durationMs: normalizeParameterDuration(item?.durationMs),
        delayMs: normalizeDelay(item?.delayMs)
      };
    })
    .filter((item): item is { id: string; value: number; weight: number; durationMs: number; delayMs: number } => Boolean(item))
    .slice(0, 32);
}

function normalizeBehaviorFrameTargets(value: unknown): Array<{ id: string; value: number; weight: number }> {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value).map(([id, target]) => (
        target && typeof target === 'object'
          ? { id, ...(target as Record<string, unknown>) }
          : { id, value: target }
      ))
      : [];

  return source
    .map((item) => {
      const id = String(
        item?.id ||
        item?.parameterId ||
        item?.param ||
        item?.key ||
        item?.name ||
        ''
      ).trim();
      const value = Number(item?.value ?? item?.target ?? item?.amount ?? item?.to);
      if (!/^[A-Za-z][A-Za-z0-9_]{1,63}$/.test(id) || !Number.isFinite(value)) return null;
      return {
        id,
        value: clampNumber(value, -90, 90, 0),
        weight: clampNumber(item?.weight ?? item?.blend, 0.01, 1, 0.72)
      };
    })
    .filter((item): item is { id: string; value: number; weight: number } => Boolean(item))
    .slice(0, 220);
}

function normalizeBehaviorActions(value: unknown): Array<{ bodyPose: string; intensity: number; durationMs: number; delayMs: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const bodyPose = normalizeBodyPose(item?.bodyPose || item?.pose || item?.motion);
      if (!bodyPose) return null;
      return {
        bodyPose,
        intensity: clampNumber(item?.intensity, 0, 1, 0.65),
        durationMs: normalizeDuration(item?.durationMs),
        delayMs: normalizeDelay(item?.delayMs)
      };
    })
    .filter((item): item is { bodyPose: string; intensity: number; durationMs: number; delayMs: number } => Boolean(item))
    .slice(0, 8);
}

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

function destroyRoomLive2D(): void {
  if (!roomState) return;

  cancelAnimationFrame(roomState.frameId);
  if (roomState.pointerFrameId) cancelAnimationFrame(roomState.pointerFrameId);
  roomState.actionTimers.forEach((timer) => window.clearTimeout(timer));
  document.removeEventListener('visibilitychange', roomState.onVisibilityChange);
  document.removeEventListener('pointerdown', roomState.onPointerDown);
  document.removeEventListener('pointermove', roomState.onPointerMove);
  document.removeEventListener('pointerup', roomState.onPointerUp);
  document.removeEventListener('pointercancel', roomState.onPointerUp);
  document.removeEventListener('touchstart', roomState.onTouchStart);
  document.removeEventListener('touchmove', roomState.onTouchMove);
  document.removeEventListener('touchend', roomState.onTouchEnd);
  document.removeEventListener('touchcancel', roomState.onTouchEnd);
  window.removeEventListener('tsukuyomi:room-act', roomState.onRoomAct);
  window.removeEventListener('tsukuyomi:live2d-mouth', roomState.onMouth);
  window.removeEventListener('tsukuyomi:live2d-face', roomState.onFaceFrame);

  roomState.subdelegate.release();
  roomState.canvas.remove();
  roomState = null;

  if ((window as any).setLive2DModelSettings) {
    delete (window as any).setLive2DModelSettings;
  }
  if ((window as any).TSUKUYOMI_LOCAL_CUBISM_BRIDGE) {
    delete (window as any).TSUKUYOMI_LOCAL_CUBISM_BRIDGE;
  }
  if ((window as any).TSUKUYOMI_LIVE2D_FRAME_PACING) {
    delete (window as any).TSUKUYOMI_LIVE2D_FRAME_PACING;
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

  let pointerActive = false;
  let pendingPointer: { pageX: number; pageY: number } | null = null;
  let lastRenderAt = 0;
  let targetFrameInterval = ROOM_RENDER_FRAME_INTERVAL_MS;
  let averageRenderCost = 0;
  let framePacingUpdatedAt = 0;

  const trackPointer = (pageX: number, pageY: number): void => {
    subdelegate.onPointMoved(pageX, pageY);
  };

  const flushPointer = (): void => {
    if (roomState) roomState.pointerFrameId = 0;
    if (!pointerActive || !pendingPointer) return;
    const point = pendingPointer;
    pendingPointer = null;
    trackPointer(point.pageX, point.pageY);
  };

  const queuePointer = (pageX: number, pageY: number): void => {
    if (!pointerActive) return;
    pendingPointer = { pageX, pageY };
    if (!roomState || roomState.pointerFrameId) return;
    roomState.pointerFrameId = requestAnimationFrame(flushPointer);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (isPointerControlDisabled()) return;
    pointerActive = isEventInsideNode(event, container);
    if (pointerActive) {
      subdelegate.onPointBegan(event.pageX, event.pageY);
      queuePointer(event.pageX, event.pageY);
    }
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (isPointerControlDisabled() || !pointerActive) return;
    queuePointer(event.pageX, event.pageY);
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (isPointerControlDisabled()) {
      pointerActive = false;
      return;
    }
    if (pointerActive) {
      pendingPointer = { pageX: event.pageX, pageY: event.pageY };
      flushPointer();
      subdelegate.onPointEnded(event.pageX, event.pageY);
    }
    pendingPointer = null;
    pointerActive = false;
  };
  const firstChangedTouch = (event: TouchEvent): Touch | null => event.changedTouches.item(0);
  const onTouchStart = (event: TouchEvent): void => {
    if ('PointerEvent' in window || isPointerControlDisabled()) return;
    const touch = firstChangedTouch(event);
    if (!touch) return;
    pointerActive = isEventInsideNode(event as unknown as PointerEvent, container);
    if (pointerActive) {
      subdelegate.onPointBegan(touch.pageX, touch.pageY);
      queuePointer(touch.pageX, touch.pageY);
    }
  };
  const onTouchMove = (event: TouchEvent): void => {
    if ('PointerEvent' in window || isPointerControlDisabled()) return;
    const touch = firstChangedTouch(event);
    if (touch && pointerActive) queuePointer(touch.pageX, touch.pageY);
  };
  const onTouchEnd = (event: TouchEvent): void => {
    if ('PointerEvent' in window || isPointerControlDisabled()) {
      pointerActive = false;
      return;
    }
    const touch = firstChangedTouch(event);
    if (pointerActive && touch) {
      pendingPointer = { pageX: touch.pageX, pageY: touch.pageY };
      flushPointer();
      subdelegate.onPointEnded(touch.pageX, touch.pageY);
    }
    pendingPointer = null;
    pointerActive = false;
  };
  const onRoomAct = (event: Event): void => {
    const detail = ((event as CustomEvent).detail || {}) as {
      expression?: string;
      expressionMix?: Array<{ expression?: string; key?: string; id?: string; weight?: number }>;
      motion?: string;
      bodyPose?: string;
      durationMs?: number;
      intensity?: number;
      parameters?: Array<{ id?: string; value?: number; weight?: number; durationMs?: number; delayMs?: number }>;
      parameterTargets?: Array<{ id?: string; value?: number; weight?: number; durationMs?: number; delayMs?: number }>;
      behaviorActions?: Array<{ bodyPose?: string; pose?: string; motion?: string; intensity?: number; durationMs?: number; delayMs?: number }>;
    };
    const manager = subdelegate.getLive2DManager();
    if (!manager) return;
    if (roomState) {
      roomState.actionTimers.forEach((timer) => window.clearTimeout(timer));
      roomState.actionTimers = [];
    }

    const expression = primaryExpressionFromMix(detail.expressionMix) || normalizeExpression(detail.expression);
    if (expression) {
      manager.setExpression(expression, normalizeDuration(detail.durationMs));
    }
    if (allowedTapBodyMotions.has(String(detail.motion || '').toLowerCase())) {
      manager.startTapBodyMotion();
    }
    const bodyPose = normalizeBodyPose(detail.bodyPose || detail.motion);
    if (bodyPose) {
      manager.startProceduralBodyPose(bodyPose, Number(detail.intensity), normalizeDuration(detail.durationMs));
    }
    const parameters = normalizeParameterTargets(detail.parameters || detail.parameterTargets);
    if (parameters.length) {
      manager.startParameterMotions(parameters);
    }
    for (const action of normalizeBehaviorActions(detail.behaviorActions)) {
      const runAction = (): void => {
        manager.startProceduralBodyPose(action.bodyPose, action.intensity, action.durationMs);
      };
      if (action.delayMs > 0 && roomState) {
        const timer = window.setTimeout(runAction, action.delayMs);
        roomState.actionTimers.push(timer);
      } else {
        runAction();
      }
    }
  };
  const onMouth = (event: Event): void => {
    const detail = ((event as CustomEvent).detail || {}) as { value?: number };
    const manager = subdelegate.getLive2DManager();
    if (!manager) return;
    const value = Math.min(Math.max(Number(detail.value) || 0, 0), 1);
    manager.setMouthOpen(value);
  };
  const setBehaviorFrame = (parameters: unknown): void => {
    const manager = subdelegate.getLive2DManager();
    if (!manager) return;
    const frame = normalizeBehaviorFrameTargets(parameters);
    if (frame.length) {
      manager.setBehaviorParameterFrame(frame);
    }
  };
  const onFaceFrame = (event: Event): void => {
    const detail = ((event as CustomEvent).detail || {}) as { parameters?: unknown; frame?: unknown };
    setBehaviorFrame(detail.parameters || detail.frame);
  };
  const onVisibilityChange = (): void => {
    if (!roomState) return;
    roomState.visible = document.visibilityState !== 'hidden';
  };

  document.addEventListener('pointerdown', onPointerDown, { passive: true });
  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerup', onPointerUp, { passive: true });
  document.addEventListener('pointercancel', onPointerUp, { passive: true });
  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: true });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', onTouchEnd, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange, { passive: true });
  window.addEventListener('tsukuyomi:room-act', onRoomAct);
  window.addEventListener('tsukuyomi:live2d-mouth', onMouth);
  window.addEventListener('tsukuyomi:live2d-face', onFaceFrame);

  (window as any).TSUKUYOMI_LOCAL_CUBISM_BRIDGE = {
    setFrame: setBehaviorFrame
  };

  const run = (now: number): void => {
    if (!roomState) return;
    if (roomState.visible) {
      const elapsed = lastRenderAt ? now - lastRenderAt : targetFrameInterval;
      if (elapsed >= targetFrameInterval - ROOM_RENDER_FRAME_TOLERANCE_MS) {
        lastRenderAt = elapsed >= targetFrameInterval
          ? now - (elapsed % targetFrameInterval)
          : now;
        const renderStartedAt = performance.now();
        LAppPal.updateTime();
        subdelegate.update();
        const renderCost = performance.now() - renderStartedAt;
        averageRenderCost = averageRenderCost
          ? averageRenderCost * 0.9 + renderCost * 0.1
          : renderCost;
        const desiredInterval = clampNumber(
          averageRenderCost * ROOM_RENDER_HEADROOM_RATIO,
          ROOM_RENDER_FRAME_INTERVAL_MS,
          roomRenderMaxFrameInterval(),
          ROOM_RENDER_FRAME_INTERVAL_MS
        );
        targetFrameInterval = targetFrameInterval * 0.86 + desiredInterval * 0.14;
        if (now - framePacingUpdatedAt >= 1000) {
          framePacingUpdatedAt = now;
          (window as any).TSUKUYOMI_LIVE2D_FRAME_PACING = {
            targetFps: Math.round(1000 / targetFrameInterval),
            averageRenderCostMs: Math.round(averageRenderCost * 100) / 100,
            profile: (window as any).TSUKUYOMI_PERFORMANCE_PROFILE || 'balanced'
          };
        }
      }
    } else {
      lastRenderAt = 0;
    }
    roomState.frameId = requestAnimationFrame(run);
  };

  roomState = {
    canvas,
    subdelegate,
    visible: document.visibilityState !== 'hidden',
    actionTimers: [],
    frameId: requestAnimationFrame(run),
    pointerFrameId: 0,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onVisibilityChange,
    onRoomAct,
    onMouth,
    onFaceFrame
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
