const fs = require('node:fs');
const db = require('../db');
const local = require('../services/room-local-client');
const mem0 = require('../services/room-local-mem0');
const analysis = require('../services/room-local-analysis');
let stopping = false;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function resourceGate() {
    if (process.platform !== 'linux') return { allowed: true };
    const available = Number(fs.readFileSync('/proc/meminfo', 'utf8').match(/^MemAvailable:\s+(\d+)/m)?.[1] || 0) * 1024;
    const load = Number(fs.readFileSync('/proc/loadavg', 'utf8').split(' ')[0]);
    return { allowed: available >= 768 * 1024 * 1024 && load < 1.5, reason: available < 768 * 1024 * 1024 ? 'memory_reserve' : 'cpu_load' };
}

function backfill() {
    const cursor = Number(db.prepare("SELECT value FROM room_local_state WHERE key='backfill-rowid'").get()?.value || 0);
    const rows = db.prepare('SELECT rowid AS cursor,* FROM room_memories WHERE rowid>? ORDER BY rowid LIMIT 12').all(cursor);
    db.transaction(() => {
        for (const row of rows) {
            db.prepare("INSERT OR IGNORE INTO room_memory_jobs(id,kind,user_id,memory_id) VALUES(?,'index',?,?)").run('index:' + row.id, row.user_id, row.id);
            const meta = JSON.parse(row.metadata || '{}');
            if (meta.sourceKind !== 'chat-turn-auto' || !meta.sourceTurnId || !meta.sourceRevision) continue;
            const existing = db.prepare('SELECT 1 FROM room_turn_analysis WHERE user_id=? AND turn_id=?').get(row.user_id, meta.sourceTurnId);
            if (existing) continue;
            const group = db.prepare("SELECT * FROM room_memories WHERE user_id=? AND json_extract(metadata,'$.sourceTurnId')=? AND json_extract(metadata,'$.sourceRevision')=? ORDER BY json_extract(metadata,'$.fragmentIndex') LIMIT 32")
                .all(row.user_id, meta.sourceTurnId, meta.sourceRevision);
            const content = group.map(item => item.content).join('');
            const text = content.match(/^用户：[\s\S]*?(?=八千代：)/)?.[0]?.slice(3).trim();
            if (text) db.prepare("INSERT OR IGNORE INTO room_turn_analysis(user_id,turn_id,revision,user_text,source_ids,origin,created_at) VALUES(?,?,?,?,?,'archive',?)")
                .run(row.user_id, meta.sourceTurnId, meta.sourceRevision, text, JSON.stringify(group.map(item => item.id)), row.created_at);
        }
        if (rows.length) db.prepare("INSERT INTO room_local_state(key,value) VALUES('backfill-rowid',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(rows.at(-1).cursor));
    })();
    return rows.length;
}

function claim(table, includeArchive = true) {
    if (!['room_memory_jobs', 'room_turn_analysis'].includes(table)) throw new Error('Invalid queue');
    const now = Date.now();
    return db.transaction(() => {
        const archiveFilter = table === 'room_turn_analysis' && !includeArchive ? " AND origin='chat'" : '';
        const priority = table === 'room_turn_analysis' ? "CASE WHEN origin='chat' THEN 0 ELSE 1 END," : '';
        const row = db.prepare(`SELECT rowid AS job_rowid,* FROM ${table} WHERE state IN ('pending','running') AND available_at<=? AND lease_until<? ${archiveFilter} ORDER BY ${priority} rowid DESC LIMIT 1`).get(now, now);
        if (row) db.prepare(`UPDATE ${table} SET state='running',lease_until=? WHERE rowid=?`).run(now + 120000, row.job_rowid);
        return row;
    })();
}

async function processIndex(job) {
    const row = db.prepare('SELECT * FROM room_memories WHERE id=? AND user_id=?').get(job.memory_id, job.user_id);
    if (!row || job.kind === 'delete') await local.request('/retire', { userId: job.user_id, sourceId: job.memory_id }, 10000);
    else {
        const hash = await mem0.index(row);
        const current = db.prepare('SELECT * FROM room_memories WHERE id=? AND user_id=?').get(row.id, job.user_id);
        if (current && local.sourceHash(current) === hash) db.prepare(`INSERT INTO room_memory_local_index(memory_id,user_id,source_hash,model)
            VALUES(?,?,?,?) ON CONFLICT(memory_id) DO UPDATE SET source_hash=excluded.source_hash,model=excluded.model,indexed_at=CURRENT_TIMESTAMP`).run(row.id, row.user_id, hash, local.MODEL);
        else await local.request('/retire', { userId: job.user_id, sourceId: job.memory_id, removeHash: hash }, 10000);
    }
    db.prepare('DELETE FROM room_memory_jobs WHERE id=? AND generation=?').run(job.id, job.generation);
    // A newer edit may have replaced the job while this worker awaited inference.
    db.prepare('UPDATE room_memory_jobs SET lease_until=0 WHERE id=? AND generation<>?').run(job.id, job.generation);
}

async function processAnalysis(job) {
    const ids = JSON.parse(job.source_ids);
    const stillOwned = ids.some(id => db.prepare('SELECT 1 FROM room_memories WHERE id=? AND user_id=?').get(id, job.user_id));
    if (!stillOwned) { db.prepare("UPDATE room_turn_analysis SET state='cancelled',user_text='',evidence='[]' WHERE user_id=? AND turn_id=? AND revision=?").run(job.user_id, job.turn_id, job.revision); return; }
    const start = job.window_cursor;
    const text = job.user_text.slice(start, start + 600);
    const evidence = await analysis.analyze(text);
    if (start + 600 < job.user_text.length) {
        const accumulated = [...JSON.parse(job.evidence), evidence];
        db.prepare("UPDATE room_turn_analysis SET window_cursor=?,evidence=?,lease_until=0,state='pending',attempts=0 WHERE user_id=? AND turn_id=? AND revision=?")
            .run(start + 500, JSON.stringify(accumulated), job.user_id, job.turn_id, job.revision);
    } else analysis.apply(job, evidence);
}

function failure(table, job, error) {
    const attempts = job.attempts + 1;
    const code = /^[A-Z0-9_]{1,48}$/.test(error.code || '') ? error.code : 'LOCAL_JOB_FAILED';
    const next = Date.now() + Math.min(3600000, 30000 * 2 ** attempts);
    if (table === 'room_memory_jobs') db.prepare('UPDATE room_memory_jobs SET state=?,attempts=?,available_at=?,lease_until=0,error_code=? WHERE id=? AND generation=?')
        .run(attempts >= 6 ? 'failed' : 'pending', attempts, next, code, job.id, job.generation);
    else db.prepare('UPDATE room_turn_analysis SET state=?,attempts=?,available_at=?,lease_until=0,error_code=? WHERE user_id=? AND turn_id=? AND revision=?')
        .run(attempts >= 6 ? 'failed' : 'pending', attempts, next, code, job.user_id, job.turn_id, job.revision);
    console.warn(JSON.stringify({ component: 'room-local-worker', code, attempts, retryAt: new Date(next).toISOString() }));
}

async function tick() {
    // Bounded housekeeping, once daily, never a full history scan in requests.
    const cleaned = Number(db.prepare("SELECT value FROM room_local_state WHERE key='cleanup-at'").get()?.value || 0);
    if (Date.now() - cleaned > 86400000) db.transaction(() => {
        db.prepare("DELETE FROM room_turn_analysis WHERE rowid IN (SELECT rowid FROM room_turn_analysis WHERE state IN ('cancelled','complete') AND updated_at<datetime('now','-180 days') LIMIT 100)").run();
        db.prepare("INSERT INTO room_local_state(key,value) VALUES('cleanup-at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(Date.now()));
    })();
    db.prepare("INSERT INTO room_local_state(key,value) VALUES('worker-heartbeat',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({ time: Date.now(), ...resourceGate() }));
    if (!resourceGate().allowed) return;
    for (let i = 0; i < 4 && !stopping && resourceGate().allowed; i++) {
        const job = claim('room_memory_jobs');
        if (!job) { backfill(); break; }
        try { await processIndex(job); } catch (error) { failure('room_memory_jobs', job, error); }
    }
    if (!resourceGate().allowed || stopping) return;
    const indexing = db.prepare("SELECT 1 FROM room_memory_jobs WHERE state IN ('pending','running') LIMIT 1").get();
    const job = claim('room_turn_analysis', !indexing);
    if (job) try { await processAnalysis(job); } catch (error) { failure('room_turn_analysis', job, error); }
}

async function main() {
    if (!local.enabled) throw new Error('ROOM_LOCAL_INTELLIGENCE must be true');
    db.pragma('cache_size = -4096');
    db.pragma('busy_timeout = 1000');
    process.on('SIGTERM', () => { stopping = true; });
    while (!stopping) {
        await tick().catch(error => console.warn(JSON.stringify({ component: 'room-local-worker', code: error.code === 'SQLITE_BUSY' ? 'SQLITE_BUSY' : 'WORKER_TICK_FAILED' })));
        const queued = db.prepare("SELECT 1 FROM room_memory_jobs WHERE state='pending' AND available_at<? LIMIT 1").get(Date.now());
        await sleep(queued && resourceGate().allowed ? 500 : 15000);
    }
}
if (require.main === module) main().catch(() => { console.error('LOCAL_WORKER_START_FAILED'); process.exitCode = 1; });
module.exports = { resourceGate, backfill, claim, processIndex, processAnalysis, tick };
