import { authFetch, authHeaders, getSession, noStoreUrl, parseResponse } from '../api/client';

export const GROWTH_UPDATED_EVENT = 'tsukuyomi:growth-updated';
export const PENDING_REFERRAL_KEY = 'tsukuyomi:pending-referral';

let cachedState = null;
let cachedUserId = '';
let cachedAt = 0;
let inFlight = null;

function currentUserId() {
  return String(getSession()?.user?.id || '').trim();
}

function publish(state, award = null) {
  if (!state) return null;
  cachedState = state;
  cachedUserId = currentUserId();
  cachedAt = Date.now();
  window.dispatchEvent(new CustomEvent(GROWTH_UPDATED_EVENT, { detail: { state, award } }));
  return state;
}

async function requestGrowth(path, options = {}) {
  const response = await authFetch(path, options);
  const result = await parseResponse(response);
  if (!response.ok || !result.success) {
    const error = new Error(result.message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return result.data;
}

export function applyGrowthResult(payload) {
  const state = payload?.state || payload;
  return publish(state, payload?.award || null);
}

export function getCachedGrowth() {
  return cachedUserId === currentUserId() ? cachedState : null;
}

export async function loadGrowth({ force = false } = {}) {
  const userId = currentUserId();
  if (!userId) return null;
  if (!force && cachedState && cachedUserId === userId && Date.now() - cachedAt < 60000) return cachedState;
  if (inFlight && cachedUserId === userId) return inFlight;

  cachedUserId = userId;
  inFlight = requestGrowth(noStoreUrl('/api/growth/me'), {
    headers: authHeaders({ Accept: 'application/json' }),
    cache: 'no-store'
  }).then((state) => publish(state)).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export async function checkInGrowth() {
  const result = await requestGrowth('/api/growth/check-in', {
    method: 'POST',
    headers: authHeaders({ Accept: 'application/json' })
  });
  publish(result.state, result.award);
  return result;
}

export async function recordShareGrowth(platform = 'native') {
  if (!currentUserId()) return null;
  const result = await requestGrowth('/api/growth/actions/share', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify({ platform })
  });
  publish(result.state, result.award);
  return result;
}

export function captureReferralCode(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!/^[A-F0-9]{10}$/.test(code)) return '';
  localStorage.setItem(PENDING_REFERRAL_KEY, code);
  return code;
}

export function pendingReferralCode() {
  return captureReferralCode(localStorage.getItem(PENDING_REFERRAL_KEY));
}

export async function claimPendingReferral(rawCode = '') {
  const code = captureReferralCode(rawCode) || pendingReferralCode();
  if (!code || !currentUserId()) return null;
  try {
    const result = await requestGrowth('/api/growth/referrals/claim', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
      body: JSON.stringify({ code })
    });
    localStorage.removeItem(PENDING_REFERRAL_KEY);
    publish(result.state);
    return result;
  } catch (error) {
    if (Number(error.status) >= 400 && Number(error.status) < 500) {
      localStorage.removeItem(PENDING_REFERRAL_KEY);
    }
    throw error;
  }
}

export function growthContext(state) {
  if (!state?.level) return '';
  const pendingTasks = (state.today?.tasks || []).filter((task) => !task.completed).map((task) => task.label);
  return [
    '当前用户的月契成长状态（仅在相关话题中自然使用，不要每次主动播报数值）：',
    `Lv.${state.level.level}「${state.level.title}」，总经验 ${state.level.totalXp}，连续相伴 ${state.streak?.current || 0} 天。`,
    pendingTasks.length ? `今日尚未完成：${pendingTasks.join('、')}。` : '今日成长任务已经全部完成。',
    '当本轮完成每日聊天任务时，可以用一句简短、符合八千代性格的话认可用户，不要使用客服式任务播报。'
  ].join('\n');
}
