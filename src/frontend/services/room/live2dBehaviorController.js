import {
  behaviorActionBodyPose,
  behaviorActionDefaultDurationMs,
  behaviorActionDefaultSide,
  behaviorActionParameterTargets,
  fallbackBehaviorActionsForText,
  isKnownBehaviorActionType,
  normalizeBehaviorActionType,
  normalizeBehaviorToken,
  semanticActionPromptCatalog
} from '../../constants/room/behaviorActionRegistry';
import {
  normalizeSemanticExpressionId,
  semanticExpressionBehaviorActions,
  semanticExpressionFromEmotion
} from '../../constants/room/yachiyoExpressionPresetRegistry';
import {
  behaviorPlanPriority,
  normalizeLive2DInterruptPolicy
} from './live2dBehaviorOrchestrator';

function clamp(value, min, max, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
}

function normalizeToken(value) {
  return normalizeBehaviorToken(value);
}

function normalizeSide(value, fallback = '') {
  const side = normalizeToken(value);
  if (['left', 'l'].includes(side)) return 'left';
  if (['right', 'r'].includes(side)) return 'right';
  if (['up', 'u'].includes(side)) return 'up';
  if (['down', 'd'].includes(side)) return 'down';
  return fallback;
}

function normalizeActionInput(action) {
  if (typeof action === 'string') return { type: action };
  if (!action || typeof action !== 'object') return null;
  return {
    ...action,
    type: action.type || action.action || action.name || action.motion
  };
}

export function normalizeBehaviorActions(actions = [], options = {}) {
  const source = Array.isArray(actions) ? actions : [];
  const baseIntensity = clamp(options.intensity, 0, 1, 0.72);
  const normalized = [];
  let runningOffsetMs = 0;

  for (const rawAction of source) {
    const action = normalizeActionInput(rawAction);
    const type = normalizeBehaviorActionType(action?.type);
    if (!type || !isKnownBehaviorActionType(type)) continue;

    const durationSeconds = Number(action.duration ?? action.seconds);
    const durationMs = clamp(
      action.durationMs ?? (Number.isFinite(durationSeconds) ? durationSeconds * 1000 : undefined),
      260,
      5200,
      behaviorActionDefaultDurationMs(type)
    );
    const delaySeconds = Number(action.delay ?? action.offset);
    const delayMs = clamp(
      action.delayMs ?? action.offsetMs ?? (Number.isFinite(delaySeconds) ? delaySeconds * 1000 : undefined),
      0,
      12000,
      runningOffsetMs
    );

    normalized.push({
      type,
      side: normalizeSide(action.side || action.direction, behaviorActionDefaultSide(type)),
      target: String(action.target || action.to || '').trim(),
      intensity: clamp(action.intensity ?? action.strength ?? baseIntensity, 0.05, 1, baseIntensity),
      durationMs,
      delayMs,
      style: normalizeToken(action.style || options.style || ''),
      source: action
    });

    if (action.delayMs === undefined && action.offsetMs === undefined && action.delay === undefined && action.offset === undefined) {
      runningOffsetMs += Math.round(durationMs * 0.72);
    }
  }

  return normalized.slice(0, 8);
}

export function behaviorExpressionFromEmotion(emotion) {
  return semanticExpressionFromEmotion(emotion);
}

function pickNestedControl(payload = {}) {
  return payload.live2d || payload.act || payload.pose || payload.motion || {};
}

function payloadText(payload = {}, nested = {}) {
  return [
    payload.reply,
    payload.text,
    payload.message,
    payload.emotion,
    payload.mood,
    nested.reply,
    nested.text,
    nested.message,
    nested.emotion,
    nested.mood,
    nested.bodyPose,
    nested.pose,
    nested.action,
    nested.motion
  ].filter(Boolean).join('\n');
}

function mergeParameterTargets(primary = [], fallback = []) {
  const merged = Array.isArray(primary) ? [...primary] : [];
  const seen = new Set(merged.map((item) => String(item?.id || '').toLowerCase()).filter(Boolean));
  for (const target of Array.isArray(fallback) ? fallback : []) {
    const key = String(target?.id || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    merged.push(target);
    seen.add(key);
  }
  return merged;
}

function fallbackActionsForPayload(payload = {}, nested = {}) {
  const directAction = normalizeBehaviorActionType(
    payload.bodyPose ||
    payload.pose ||
    payload.action ||
    payload.motion ||
    nested.bodyPose ||
    nested.pose ||
    nested.action ||
    nested.motion
  );
  if (isKnownBehaviorActionType(directAction)) {
    return [{ type: directAction, duration: directAction === 'blink' ? 0.36 : 1.6 }];
  }
  return fallbackBehaviorActionsForText(payloadText(payload, nested));
}

export function compileBehaviorIntent(payload = {}) {
  const nested = pickNestedControl(payload);
  const emotion = payload.emotion || payload.mood || nested.emotion || nested.mood;
  const rawExpression = payload.expression || payload.expressionId || payload.face || nested.expression || nested.expressionId || nested.face;
  const expression = normalizeSemanticExpressionId(rawExpression) || behaviorExpressionFromEmotion(emotion) || undefined;
  let actions = normalizeBehaviorActions(
    payload.actions || payload.behaviorActions || nested.actions || nested.behaviorActions || [],
    {
      intensity: payload.intensity ?? nested.intensity,
      style: payload.speech_style?.pause || payload.speechStyle?.pause || nested.speech_style?.pause || nested.speechStyle?.pause
    }
  );
  if (!actions.length) {
    actions = normalizeBehaviorActions(fallbackActionsForPayload(payload, nested), {
      intensity: payload.intensity ?? nested.intensity ?? 0.68
    });
  }
  const presetActions = semanticExpressionBehaviorActions(expression || emotion, {
    existingActions: actions,
    intensity: payload.intensity ?? nested.intensity ?? 0.72,
    limit: Math.max(0, 5 - actions.length)
  });
  if (presetActions.length) {
    actions = normalizeBehaviorActions([...actions, ...presetActions], {
      intensity: payload.intensity ?? nested.intensity ?? 0.72,
      style: payload.speech_style?.pause || payload.speechStyle?.pause || nested.speech_style?.pause || nested.speechStyle?.pause
    });
  }

  const speechStyle = payload.speech_style || payload.speechStyle || nested.speech_style || nested.speechStyle || null;
  const parameters = actions.flatMap((action) => behaviorActionParameterTargets(action));
  const bodyAction = actions.find((action) => behaviorActionBodyPose(action.type));
  const intensity = clamp(payload.intensity ?? nested.intensity, 0.05, 1, 0.72);
  const priority = behaviorPlanPriority(actions, {
    expression,
    intensity,
    priority: payload.priority ?? nested.priority
  });
  const interruptPolicy = normalizeLive2DInterruptPolicy(
    payload.interruptPolicy || payload.interrupt || nested.interruptPolicy || nested.interrupt,
    { priority }
  );
  const durationMs = Math.max(
    1200,
    ...actions.map((action) => action.delayMs + action.durationMs),
    Number(payload.durationMs ?? nested.durationMs) || 0
  );

  if (!actions.length && !expression) return null;

  return {
    emotion: emotion || null,
    expression: expression || null,
    expressionMix: expression ? [{ expression, weight: 1 }] : [],
    bodyPose: bodyAction ? behaviorActionBodyPose(bodyAction.type) : null,
    intensity,
    durationMs,
    priority,
    interruptPolicy,
    parameters,
    behaviorActions: actions,
    speechStyle
  };
}

export { semanticActionPromptCatalog };
