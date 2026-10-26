// Operator-only helper for the isolated manual acceptance stack.
const crypto = require('node:crypto');
if (process.env.TSUKUYOMI_STAGING !== 'drift') {
    throw new Error('Run only inside docker-compose.drift-test.yml (TSUKUYOMI_STAGING=drift).');
}
const password = process.env.DRIFT_TEST_PASSWORD || '';
if (password.length < 12) throw new Error('Set DRIFT_TEST_PASSWORD to at least 12 characters.');
const bcrypt = require('bcryptjs');
const db = require('../backend/db');
try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='drift_bottles'").get()) {
        throw new Error('Start the staging app and wait for migration 055 before creating accounts.');
    }
    const create = db.transaction(() => {
        for (const username of ['drift-a','drift-b']) {
            if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) {
                console.log(`${username} already exists; its password was not changed.`);
                continue;
            }
            db.prepare('INSERT INTO users(id,username,nickname,email,password_hash,role) VALUES(?,?,?,?,?,?)')
                .run(crypto.randomUUID(),username,username,`${username}@example.test`,bcrypt.hashSync(password,10),'user');
            console.log(`Created ${username}`);
        }
    });
    create();
} finally { db.close(); }
