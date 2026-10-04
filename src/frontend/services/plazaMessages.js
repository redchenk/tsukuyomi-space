import { apiFetch, apiUrl, getSession, parseResponse } from '../api/client';

export const PLAZA_PAGE_SIZE = 8;
const MAX_AGE_MS = 30 * 1000;
const MAX_ENTRIES = 12;
const pages = new Map();
const requests = new Map();
let revision = 0;

function copy(payload) {
  return { ...payload, messages: payload.messages?.map(item => ({ ...item })),
    activity: payload.activity?.map(item => ({ ...item })), replies: payload.replies?.map(item => ({ ...item })),
    pagination: payload.pagination ? { ...payload.pagination } : undefined };
}

async function read(path, privateRead = false, force = false) {
  const owner = getSession()?.user?.id || 'guest';
  const key = `${owner}:${path}`;
  const cached = pages.get(key);
  if (!force && cached && Date.now() - cached.at < MAX_AGE_MS) return copy(cached.data);
  const startedRevision = revision;
  const requestKey = `${startedRevision}:${key}`;
  let request = requests.get(requestKey);
  if (!request) {
    // The overseas translation cache is public and never receives a session.
    // A personal filter must stay on the authenticated same-origin API.
    request = (privateRead
      ? fetch(apiUrl(path), { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } })
      : apiFetch(path, { headers: { Accept: 'application/json' } }))
      .then(parseResponse).then(result => {
        if (!result.success) throw new Error(result.message || 'Unable to load messages');
        if (startedRevision === revision) {
          pages.delete(key);
          pages.set(key, { at: Date.now(), data: result.data });
          while (pages.size > MAX_ENTRIES) pages.delete(pages.keys().next().value);
        }
        return result.data;
      }).finally(() => requests.delete(requestKey));
    requests.set(requestKey, request);
  }
  return copy(await request);
}

export function loadPlazaPage(options = {}, { force = false } = {}) {
  const sort = ['hot', 'replied', 'mine'].includes(options.sort) ? options.sort : 'latest';
  const params = new URLSearchParams({ view: 'plaza', limit: String(PLAZA_PAGE_SIZE),
    page: String(Math.max(1, Number.parseInt(options.page, 10) || 1)), sort });
  const search = String(options.search || '').trim().slice(0, 120);
  if (search) params.set('q', search);
  if (/^[1-9]\d*$/.test(String(options.anchorId || ''))) params.set('anchor_id', String(options.anchorId));
  return read(`/api/messages?${params}`, sort === 'mine', force);
}

export function loadPlazaReplies(rootId, beforeId = null) {
  const params = new URLSearchParams({ view: 'thread', thread_id: String(rootId), limit: '20' });
  if (beforeId) params.set('before_id', String(beforeId));
  return read(`/api/messages?${params}`);
}

export function prefetchPlazaMessages(options = {}) {
  return loadPlazaPage(options).catch(() => null);
}

export function clearPlazaMessageCache() {
  ++revision;
  pages.clear();
}
