module.exports = {
    version: '041', name: 'local_room_intelligence',
    up(db) {
        db.exec(`
            CREATE TABLE room_memory_jobs (
                id TEXT PRIMARY KEY, kind TEXT NOT NULL, user_id TEXT NOT NULL, memory_id TEXT NOT NULL,
                generation INTEGER NOT NULL DEFAULT 1, attempts INTEGER NOT NULL DEFAULT 0,
                available_at INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
                state TEXT NOT NULL DEFAULT 'pending', error_code TEXT NOT NULL DEFAULT '',
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX room_memory_jobs_due ON room_memory_jobs(state, available_at, lease_until);
            CREATE TABLE room_memory_local_index (
                memory_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, source_hash TEXT NOT NULL,
                model TEXT NOT NULL, indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX room_memory_local_index_user ON room_memory_local_index(user_id);
            CREATE TABLE room_turn_analysis (
                user_id TEXT NOT NULL, turn_id TEXT NOT NULL, revision TEXT NOT NULL,
                user_text TEXT NOT NULL, source_ids TEXT NOT NULL, origin TEXT NOT NULL DEFAULT 'chat', window_cursor INTEGER NOT NULL DEFAULT 0,
                state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
                available_at INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
                evidence TEXT NOT NULL DEFAULT '[]', error_code TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(user_id, turn_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX room_turn_analysis_due ON room_turn_analysis(state, available_at, lease_until);
            CREATE TABLE room_local_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE room_memory_facts (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL, memory_id TEXT NOT NULL, turn_id TEXT NOT NULL,
                attribute TEXT NOT NULL, value TEXT NOT NULL, quote TEXT NOT NULL,
                confidence REAL NOT NULL, importance REAL NOT NULL, source_order INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(memory_id) REFERENCES room_memories(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX room_memory_facts_owner ON room_memory_facts(user_id, attribute, active);
            CREATE TABLE room_relationship_events (
                user_id TEXT NOT NULL, turn_id TEXT NOT NULL, revision TEXT NOT NULL, delta INTEGER NOT NULL,
                reason TEXT NOT NULL, evidence TEXT NOT NULL, fingerprint TEXT NOT NULL,
                day TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(user_id, turn_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX room_relationship_events_day ON room_relationship_events(user_id, day);
            CREATE TRIGGER room_memory_local_insert AFTER INSERT ON room_memories BEGIN
                INSERT INTO room_memory_jobs(id, kind, user_id, memory_id) VALUES('index:' || NEW.id, 'index', NEW.user_id, NEW.id)
                ON CONFLICT(id) DO UPDATE SET kind='index', generation=generation+1, state='pending', attempts=0, available_at=0;
            END;
            CREATE TRIGGER room_memory_local_update AFTER UPDATE OF content, summary, metadata ON room_memories
            WHEN OLD.content <> NEW.content OR OLD.summary <> NEW.summary
                OR COALESCE(json_extract(OLD.metadata,'$.analysis.evidence'),'[]') <> COALESCE(json_extract(NEW.metadata,'$.analysis.evidence'),'[]') BEGIN
                INSERT INTO room_memory_jobs(id, kind, user_id, memory_id) VALUES('index:' || NEW.id, 'index', NEW.user_id, NEW.id)
                ON CONFLICT(id) DO UPDATE SET kind='index', generation=generation+1, state='pending', attempts=0, available_at=0;
            END;
            CREATE TRIGGER room_memory_local_delete AFTER DELETE ON room_memories BEGIN
                INSERT INTO room_memory_jobs(id, kind, user_id, memory_id) VALUES('index:' || OLD.id, 'delete', OLD.user_id, OLD.id)
                ON CONFLICT(id) DO UPDATE SET kind='delete', generation=generation+1, state='pending', attempts=0, available_at=0;
                DELETE FROM room_memory_local_index WHERE memory_id=OLD.id;
                UPDATE room_turn_analysis SET state='cancelled',user_text='',evidence='[]'
                    WHERE user_id=OLD.user_id AND turn_id=json_extract(OLD.metadata,'$.sourceTurnId');
                UPDATE room_relationship_events SET evidence=''
                    WHERE user_id=OLD.user_id AND turn_id=json_extract(OLD.metadata,'$.sourceTurnId');
            END;
        `);
    }
};
