const { staticDocuments, articleDocument } = require('../services/site-knowledge-corpus');

function createIndexer({ db, request, now = Date.now, loadStatic = staticDocuments }) {
    let nextScan = 0, scanning = false, cursor = 0, catalog = new Map(), seen = new Set();
    let fixed = [], page = [], pending = null, deleting = [], embeddingPending = false;
    const enabled = () => process.env.SITE_KNOWLEDGE_ENABLED === 'true';
    async function start() {
        catalog = new Map(); let after = '';
        for (let n = 0; n < 100; n++) {
            const result = await request('/knowledge/catalog', { after });
            if (!Array.isArray(result.documents)) throw new Error('KNOWLEDGE_DISABLED');
            result.documents.forEach(item => catalog.set(item.id, item));
            if (result.documents.length < 200) break;
            after = result.documents.at(-1).id;
        }
        fixed = loadStatic(); seen = new Set(); cursor = 0; page = []; scanning = true;
    }
    async function tick() {
        if (!enabled()) return false;
        if (!scanning && !pending && !deleting.length && now() >= nextScan) await start();
        if (pending) {
            const { chunks, sections, ...document } = pending.doc;
            const batch = chunks.slice(pending.offset, pending.offset + 32);
            const result = await request('/knowledge/put', { document: { ...document, chunkCount: chunks.length }, chunks: batch }, 1500);
            if (!Number.isInteger(result.saved)) throw new Error('KNOWLEDGE_WRITE_FAILED');
            pending.offset += batch.length;
            if (pending.offset >= chunks.length) { pending = null; embeddingPending = true; }
            return true;
        }
        if (scanning) {
            // Bounded pagination keeps article bodies out of the API and caps worker memory.
            for (let n = 0; n < 4; n++) {
                let doc = fixed.shift();
                if (!doc) {
                    if (!page.length) {
                        page = db.prepare(`SELECT id,title,slug,content_format,content,updated_at FROM articles
                            WHERE COALESCE(status,'published')='published' AND id>? AND length(content)<=2000000 ORDER BY id LIMIT 2`).all(cursor);
                    }
                    const row = page.shift();
                    if (row) { cursor = row.id; doc = articleDocument(row); }
                }
                if (!doc) {
                    scanning = false; nextScan = now() + 60_000;
                    deleting = [...catalog.keys()].filter(id => !seen.has(id));
                    break;
                }
                if (!doc.chunks.length) continue;
                seen.add(doc.id);
                const old = catalog.get(doc.id);
                if (!old || old.revision !== doc.revision || !old.ready) {
                    pending = { doc, offset: 0 }; return true;
                }
            }
            if (scanning) return true;
        }
        if (deleting.length) {
            const batch = deleting.slice(0, 32);
            await request('/knowledge/delete', { ids: batch }); deleting.splice(0, batch.length); return true;
        }
        const result = await request('/knowledge/index-next', {}, 1500);
        embeddingPending = result.pending === true;
        return embeddingPending;
    }
    return { tick, busy: () => enabled() && (scanning || Boolean(pending) || deleting.length > 0 || embeddingPending),
        defer: () => { nextScan = now() + 60_000; scanning = false; pending = null; deleting = []; embeddingPending = false; } };
}
module.exports = { createIndexer };
