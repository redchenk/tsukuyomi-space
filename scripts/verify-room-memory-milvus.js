const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temporaryDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsukuyomi-memory-verify-'));
const suffix = crypto.randomBytes(8).toString('hex');
const firstUserId = `memory-verify-a-${suffix}`;
const secondUserId = `memory-verify-b-${suffix}`;

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = temporaryDataDir;
process.env.DB_PATH = path.join(temporaryDataDir, 'verify.db');
process.env.ROOM_MEMORY_VECTOR_BACKEND = process.env.ROOM_MEMORY_VECTOR_BACKEND || 'milvus';
process.env.MILVUS_ADDRESS = process.env.MILVUS_ADDRESS || '127.0.0.1:19530';

const db = require('../backend/db');
const { initDatabase } = require('../backend/db/migrations/init');
const {
    clearMemories,
    getMemory,
    memoryStats,
    recordMemory,
    searchMemories,
    updateMemory
} = require('../backend/services/room-memory');

function insertUser(id, label) {
    db.prepare(`
        INSERT INTO users (id, username, email, password_hash, role)
        VALUES (?, ?, ?, ?, 'user')
    `).run(id, `verify-${label}-${suffix}`, `verify-${label}-${suffix}@example.invalid`, 'integration-test-only');
}

async function main() {
    initDatabase();
    insertUser(firstUserId, 'a');
    insertUser(secondUserId, 'b');

    let createdId = '';
    try {
        const result = await recordMemory(firstUserId, {
            summary: `Milvus UTF-8 ${'月'.repeat(500)}`,
            content: `Milvus account isolation marker ${suffix}: the preferred observatory is Selene Ridge.`,
            type: 'preference',
            importance: 0.92,
            source: 'milvus-integration-verification',
            force: true
        });
        createdId = result.memory.id;
        assert.equal(result.memory.vectorPending, false, 'new memory must be synchronized to Milvus');
        assert.ok(result.memory.vectorSyncedAt, 'new memory must expose a vector sync timestamp');

        const ownerResults = await searchMemories(firstUserId, `Which observatory is preferred? ${suffix}`, 5);
        assert.ok(ownerResults.some(item => item.id === createdId), 'owner must retrieve the synchronized memory');

        const otherResults = await searchMemories(secondUserId, `Which observatory is preferred? ${suffix}`, 5);
        assert.equal(otherResults.some(item => item.id === createdId), false, 'another account must not retrieve the memory');
        assert.equal(getMemory(secondUserId, createdId), null, 'another account must not read the memory by id');
        assert.equal(await updateMemory(secondUserId, createdId, { content: 'cross-account overwrite' }), null,
            'another account must not update the memory');

        const stats = memoryStats(firstUserId);
        assert.equal(stats.vectorStore.enabled, true, 'Milvus backend must be enabled');
        assert.equal(stats.vectorSync.pending, 0, 'owner must have no pending vectors after synchronization');
        assert.equal(stats.vectorSync.failed, 0, 'owner must have no failed vectors after synchronization');

        await clearMemories(firstUserId);
        const afterClear = await searchMemories(firstUserId, suffix, 5);
        assert.equal(afterClear.some(item => item.id === createdId), false, 'cleared vectors must not remain searchable');

        process.stdout.write(`${JSON.stringify({
            ok: true,
            backend: stats.vectorStore.backend,
            embedding: stats.embedding.activeProvider,
            ownerRetrieved: true,
            crossAccountIsolated: true,
            vectorDeletionVerified: true
        })}\n`);
    } finally {
        await clearMemories(firstUserId).catch(() => {});
        await clearMemories(secondUserId).catch(() => {});
        db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(firstUserId, secondUserId);
        if (typeof db.close === 'function') db.close();
        fs.rmSync(temporaryDataDir, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
