const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const config = require('../config');
const { musicError } = require('./netease-music');

const LOGIN_TTL = 30 * 24 * 60 * 60 * 1000;
const QR_TTL = 3 * 60 * 1000;
const hash = token => crypto.createHash('sha256').update(token).digest('hex');

// Separate small, private state store; the website database and its migrations
// are untouched. Only hashed browser IDs and encrypted provider state persist.
function createMusicSessions({ directory = path.join(config.dataDir, 'music-private'), secret = config.mailCredentialSecret, now = Date.now } = {}) {
    const key = crypto.createHash('sha256').update('tsukuyomi-space/netease-session/v1\0').update(secret).digest();
    let db; let cleaned = 0;
    function database() {
        if (!db) {
            fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
            if (fs.lstatSync(directory).isSymbolicLink()) throw musicError('MUSIC_STORE_UNAVAILABLE', '音乐账号存储不可用', 503);
            fs.chmodSync(directory, 0o700);
            const file = path.join(directory, 'sessions.sqlite');
            if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw musicError('MUSIC_STORE_UNAVAILABLE', '音乐账号存储不可用', 503);
            db = new Database(file);
            fs.chmodSync(file, 0o600);
            db.pragma('journal_mode = DELETE');
            db.pragma('busy_timeout = 1500');
            db.pragma('cache_size = -512');
            db.exec('CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, owner TEXT NOT NULL, state TEXT NOT NULL, expires INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);');
        }
        if (now() - cleaned > 60 * 60 * 1000) {
            db.prepare('DELETE FROM sessions WHERE expires <= ?').run(now());
            cleaned = now();
        }
        return db;
    }
    function encode(value, id, owner) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        cipher.setAAD(Buffer.from(`v1\0${id}\0${owner}`));
        const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
        return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
    }
    function read(token, owner) {
        if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
        const id = hash(token);
        const row = database().prepare('SELECT * FROM sessions WHERE id = ? AND owner = ? AND expires > ?').get(id, owner, now());
        if (!row) return null;
        try {
            const [version, iv, tag, body] = row.state.split('.');
            if (version !== 'v1') throw new Error();
            const cipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
            cipher.setAAD(Buffer.from(`v1\0${id}\0${owner}`)); cipher.setAuthTag(Buffer.from(tag, 'base64url'));
            return { ...JSON.parse(Buffer.concat([cipher.update(Buffer.from(body, 'base64url')), cipher.final()]).toString()), expiresAt: row.expires };
        } catch (_) {
            database().prepare('DELETE FROM sessions WHERE id = ?').run(id);
            return null;
        }
    }
    function save(token, owner, state, expiresAt) {
        const id = hash(token);
        database().prepare('INSERT INTO sessions(id,owner,state,expires) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,expires=excluded.expires WHERE sessions.owner=excluded.owner')
            .run(id, owner, encode(state, id, owner), expiresAt);
    }
    function remove(token) {
        if (/^[a-f0-9]{64}$/.test(token || '')) database().prepare('DELETE FROM sessions WHERE id = ?').run(hash(token));
    }
    return { now, read, save, remove, newToken: () => crypto.randomBytes(32).toString('hex'),
        capacity() { return database().prepare('SELECT COUNT(*) AS count FROM sessions WHERE expires > ?').get(now()).count < 2000; },
        close() { db?.close(); db = null; } };
}
module.exports = { createMusicSessions, LOGIN_TTL, QR_TTL };
