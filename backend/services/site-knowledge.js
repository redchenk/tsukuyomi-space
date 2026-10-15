const crypto = require('node:crypto');
const local = require('./room-local-client');
const { articleRevision, staticDocuments } = require('./site-knowledge-corpus');

function createKnowledgeSearch({ db, request = local.request, enabled = () => process.env.SITE_KNOWLEDGE_ENABLED === 'true', now = Date.now, loadStatic = staticDocuments }) {
    const cache = new Map(); let inFlight = 0, staticRevisions;
    function validate(matches, allowSpoilers, scope) {
        if (!staticRevisions) staticRevisions = new Map(loadStatic().map(doc => [doc.id, doc.revision]));
        const revisions = new Map(), sources = [];
        for (const item of matches.slice(0, 12)) {
            if (!item || (!allowSpoilers && item.spoiler) || (scope === 'guide' && item.kind === 'wiki')) continue;
            const id = item.document_id;
            if (typeof id !== 'string' || !/^\/(?!\/)[^\s\\]{0,500}$/.test(item.url || '')) continue;
            if (!revisions.has(id)) {
                if (id.startsWith('article:')) {
                    const row = db.prepare(`SELECT id,title,slug,content_format,content,updated_at FROM articles
                        WHERE id=? AND COALESCE(status,'published')='published' AND length(content)<=2000000`).get(id.slice(8));
                    revisions.set(id, row ? articleRevision(row) : null);
                } else revisions.set(id, staticRevisions.get(id) || null);
            }
            if (revisions.get(id) !== item.revision) continue;
            sources.push({ id: item.id, documentId: id, revision: item.revision, title: String(item.title).slice(0, 180),
                url: item.url, kind: item.kind, section: String(item.section || '').slice(0, 120),
                content: String(item.text || '').slice(0, 600), updatedAt: item.updated_at || '', spoiler: Boolean(item.spoiler) });
            if (sources.length >= 5) break;
        }
        return sources;
    }
    async function search(query, { allowSpoilers = false, scope = 'all' } = {}) {
        if (!enabled()) return { sources: [], mode: 'disabled' };
        if (typeof query !== 'string' || !query.trim() || query.length > 400) return { sources: [], mode: 'invalid' };
        query = query.trim(); scope = scope === 'guide' ? 'guide' : 'all';
        const key = crypto.createHash('sha256').update(JSON.stringify([query, allowSpoilers, scope])).digest('hex');
        const cached = cache.get(key);
        // Every cache hit rechecks published state and full content revision.
        if (cached?.expires > now()) return { sources: validate(cached.matches, allowSpoilers, scope), mode: cached.mode };
        if (inFlight >= 2) return { sources: [], mode: 'busy' };
        inFlight++;
        try {
            const result = await request('/knowledge/search', { query, allowSpoilers, scope }, 650);
            const matches = Array.isArray(result.matches) ? result.matches : [];
            const mode = ['hybrid', 'keyword', 'empty', 'busy', 'disabled'].includes(result.mode) ? result.mode : 'unavailable';
            if (['hybrid', 'keyword', 'empty'].includes(mode)) {
                if (cache.size >= 128) cache.delete(cache.keys().next().value);
                cache.set(key, { matches, mode, expires: now() + 30_000 });
            }
            return { sources: validate(matches, allowSpoilers, scope), mode };
        } catch { return { sources: [], mode: 'unavailable' }; }
        finally { inFlight--; }
    }
    return { search };
}
let service;
module.exports = { createKnowledgeSearch, search: (...args) => {
    service ||= createKnowledgeSearch({ db: require('../db') });
    return service.search(...args);
} };
