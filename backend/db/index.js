const Database = require('better-sqlite3');
const config = require('../config');

let db;

function getDb() {
    if (!db) {
        db = new Database(config.dbPath);
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.pragma('busy_timeout = 5000');
        db.pragma('foreign_keys = ON');
    }
    return db;
}

module.exports = getDb();
module.exports.getDb = getDb;
