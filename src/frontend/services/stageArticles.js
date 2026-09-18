import { apiFetch, parseResponse } from '../api/client';

const STAGE_PAGE_SIZE = 6;
const STAGE_CACHE_MAX_AGE_MS = 30 * 1000;
const STAGE_CACHE_MAX_ENTRIES = 12;
const stagePageCache = new Map();
const stagePageRequests = new Map();

function normalizedOptions(options = {}) {
  return {
    page: Math.max(1, Number.parseInt(options.page, 10) || 1),
    limit: Math.max(1, Math.min(Number.parseInt(options.limit, 10) || STAGE_PAGE_SIZE, 24)),
    sort: options.sort === 'featured' ? 'featured' : 'latest',
    category: String(options.category || '').trim().slice(0, 48),
    search: String(options.search || '').trim().slice(0, 120)
  };
}

function requestPath(options) {
  const params = new URLSearchParams({
    limit: String(options.limit),
    page: String(options.page),
    sort: options.sort
  });
  if (options.category && options.category !== 'all') params.set('category', options.category);
  if (options.search) params.set('q', options.search);
  return `/api/articles?${params.toString()}`;
}

function rememberPage(key, payload) {
  stagePageCache.delete(key);
  stagePageCache.set(key, { payload, cachedAt: Date.now() });
  while (stagePageCache.size > STAGE_CACHE_MAX_ENTRIES) {
    stagePageCache.delete(stagePageCache.keys().next().value);
  }
  return payload;
}

export async function loadStageArticles(options = {}, { force = false } = {}) {
  const normalized = normalizedOptions(options);
  const key = requestPath(normalized);
  const cached = stagePageCache.get(key);
  if (!force && cached && Date.now() - cached.cachedAt < STAGE_CACHE_MAX_AGE_MS) return cached.payload;

  let request = stagePageRequests.get(key);
  if (!request) {
    request = apiFetch(key, { headers: { Accept: 'application/json' } })
      .then(parseResponse)
      .then((result) => {
        if (!result.success) throw new Error(result.message || 'Unable to load articles');
        return rememberPage(key, {
          articles: Array.isArray(result.data) ? result.data : [],
          pagination: {
            page: Math.max(1, Number.parseInt(result.pagination?.page, 10) || normalized.page),
            limit: Math.max(1, Number.parseInt(result.pagination?.limit, 10) || normalized.limit),
            total: Math.max(0, Number.parseInt(result.pagination?.total, 10) || 0),
            totalPages: Math.max(1, Number.parseInt(result.pagination?.totalPages, 10) || 1)
          }
        });
      })
      .finally(() => stagePageRequests.delete(key));
    stagePageRequests.set(key, request);
  }
  return request;
}

export function prefetchStageArticles(options = {}) {
  return loadStageArticles(options).catch(() => null);
}

export function clearStageArticleCache() {
  stagePageCache.clear();
}

export { STAGE_PAGE_SIZE };
