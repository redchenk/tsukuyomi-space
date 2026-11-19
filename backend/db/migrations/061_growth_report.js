module.exports = {
  version: '061',
  name: 'growth_report',
  up(db) {
    db.exec(`
            CREATE TABLE growth_sessions (
                id INTEGER PRIMARY KEY, browser TEXT NOT NULL, actor TEXT NOT NULL,
                started INTEGER NOT NULL, last_seen INTEGER NOT NULL,
                source TEXT NOT NULL, medium TEXT NOT NULL, campaign TEXT NOT NULL, content TEXT NOT NULL,
                landing TEXT NOT NULL, device TEXT NOT NULL
            );
            CREATE INDEX growth_browser_recent ON growth_sessions(browser, id DESC);
            CREATE INDEX growth_actor_sessions ON growth_sessions(actor, started);
            CREATE INDEX growth_session_start ON growth_sessions(started);
            CREATE TABLE growth_visit_days (
                day TEXT NOT NULL, session_id INTEGER NOT NULL REFERENCES growth_sessions(id), PRIMARY KEY(day,session_id)
            );
            CREATE TABLE growth_actions (
                id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES growth_sessions(id),
                kind TEXT NOT NULL, object_key TEXT NOT NULL, at INTEGER NOT NULL,
                UNIQUE(session_id, kind, object_key)
            );
            CREATE INDEX growth_fushi_reply_message ON fushi_reply_submissions(message_id) WHERE message_id IS NOT NULL;
            CREATE INDEX growth_actions_time ON growth_actions(at, kind);
            CREATE TABLE article_read_windows (
                article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
                reader TEXT NOT NULL, owner TEXT NOT NULL, last_seen INTEGER NOT NULL, PRIMARY KEY(article_id, reader)
            );
            CREATE INDEX article_window_time ON article_read_windows(last_seen);
            CREATE TABLE article_read_daily (
                day TEXT NOT NULL, article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
                opens INTEGER NOT NULL DEFAULT 0, reads INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day, article_id)
            );
            CREATE TABLE article_read_tickets (
                ticket TEXT PRIMARY KEY, expires INTEGER NOT NULL
            );
            CREATE INDEX article_ticket_expiry ON article_read_tickets(expires);
        `);
  }
};
