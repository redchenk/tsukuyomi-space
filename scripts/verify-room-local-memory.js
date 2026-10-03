// Real ONNX + sqlite-vec + Mem0 acceptance with synthetic, isolated accounts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'room-semantic-verify-'));
Object.assign(process.env, { NODE_ENV: 'test', DATA_DIR: directory, DB_PATH: path.join(directory, 'site.db'),
    ROOM_LOCAL_INTELLIGENCE: 'true', ROOM_MEMORY_BACKEND: 'mem0', ROOM_MEMORY_EMBEDDING_API_URL: '', MEM0_TELEMETRY: 'false' });
const db = require('../backend/db');
const memory = require('../backend/services/room-memory');
const worker = require('../backend/workers/room-memory-worker');
const analysis = require('../backend/services/room-local-analysis');
const local = require('../backend/services/room-local-client');
const userId = 'verify-' + crypto.randomUUID();
const otherId = 'verify-' + crypto.randomUUID();
const sourceIds = [];

async function main() {
    require('../backend/db/migrations/init').runMigrations();
    for (const id of [userId, otherId]) db.prepare("INSERT INTO users(id,username,email,password_hash,role) VALUES(?,?,?,'synthetic','user')").run(id, id, id + '@example.test');
    const turns = ['花生会让我起红疹。', '我的猫叫雪糕。', '我的网站使用Vue开发。', '我喜欢安静的房间。', '谢谢你一直陪我听我说这些。'];
    for (let i = 0; i < turns.length; i++) {
        const ids = memory.captureChatTurn(userId, { turnId: 'verify-' + i, userMessage: turns[i], assistantMessage: '收到。' });
        sourceIds.push(...ids);
        const job = db.prepare('SELECT * FROM room_turn_analysis WHERE user_id=? AND turn_id=?').get(userId, 'verify-' + i);
        await worker.processAnalysis(job);
        for (const id of ids) await worker.processIndex(db.prepare('SELECT * FROM room_memory_jobs WHERE memory_id=? AND user_id=?').get(id, userId));
    }
    // Push the oldest source outside the bounded recent-source fallback.
    for (let i = 0; i < 160; i++) sourceIds.push(...memory.captureChatTurn(userId, {
        turnId: 'padding-' + i, userMessage: `散步记录第${i}次。`, assistantMessage: '收到。'
    }));
    const start = Date.now();
    const found = await memory.retrieveChatMemories(userId, '零食里哪些食材不能吃');
    assert.equal(found.retrieval.backend, 'mem0-local-semantic');
    assert.ok(found.memories.some(item => item.context.includes('花生')), 'semantic paraphrase must recall the oldest allergy source');
    assert.equal((await memory.retrieveChatMemories(otherId, '零食里哪些食材不能吃')).memories.length, 0);
    const health = memory.getMemory(userId, sourceIds[0]);
    assert.ok(health.importance >= 0.8 && health.confidence >= 0.8, 'health evidence is important and directly asserted');
    assert.ok(analysis.relationship(userId).score > 0, 'real local classifier must record a positive interaction');
    const hypothetical = await analysis.analyze('小说里的角色说：我叫大卫。');
    assert.ok(hypothetical.facts.every(fact => fact.confidence < 0.5));
    const sad = await analysis.analyze('我今天很难过，不想聊天。');
    assert.equal(sad.relationship, 'none');
    await memory.updateMemory(userId, sourceIds[0], { content: '我现在需要避免腰果。', summary: '腰果', confidence: 0.93, importance: 0.96 });
    const edited = await memory.retrieveChatMemories(userId, '花生');
    assert.ok(edited.memories.every(item => !item.context.includes('花生')), 'old vectors must be rejected after an edit');
    process.stdout.write(JSON.stringify({ passed: true, semanticBackend: found.retrieval.backend, recall: 'oldest-source-paraphrase',
        retrievalMs: Date.now() - start, importance: health.importance, confidence: health.confidence,
        relationship: analysis.relationship(userId).score, isolation: true, manualEdit: true }) + '\n');
}
main().catch(error => { console.error('LOCAL_MEMORY_ACCEPTANCE_FAILED', error.code || error.message); process.exitCode = 1; })
    .finally(async () => {
        for (const id of sourceIds.slice(0, 5)) await local.request('/retire', { userId, sourceId: id }, 10000).catch(() => {});
        db.close(); fs.rmSync(directory, { recursive: true, force: true });
    });
