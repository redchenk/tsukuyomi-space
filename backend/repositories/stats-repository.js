const db = require('../db');

const VIEW_VISITOR_KEY_SQL = `
    COALESCE(
        NULLIF(visitor_key, ''),
        NULLIF(CASE WHEN json_valid(event_data) THEN json_extract(event_data, '$.ip') END, ''),
        NULLIF(event_data, ''),
        CAST(id AS TEXT)
    )
`;

function articleCounters() {
    return db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(view_count), 0) AS views FROM articles').get();
}

function userCount() {
    return db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
}

function messageCount() {
    return db.prepare(`
        SELECT COUNT(*) AS count
        FROM messages
        WHERE COALESCE(status, 'approved') = 'approved'
          AND article_id IS NULL
          AND parent_id IS NULL
    `).get().count;
}

function allMessageCount() {
    return db.prepare('SELECT COUNT(*) AS count FROM messages').get().count;
}

function publicViewCounters() {
    return db.prepare(`
        WITH view_events AS (
            SELECT
                created_at,
                ${VIEW_VISITOR_KEY_SQL} AS visitor_key
            FROM stats
            WHERE event_type = 'view'
        )
        SELECT
            COUNT(DISTINCT CASE WHEN date(created_at, '+8 hours') = date('now', '+8 hours') THEN visitor_key END) AS today,
            COUNT(DISTINCT CASE WHEN created_at >= datetime('now', '-7 days') THEN visitor_key END) AS week,
            COUNT(DISTINCT visitor_key) AS total
        FROM view_events
    `).get();
}

function adminViewCounters() {
    return db.prepare(`
        WITH view_events AS (
            SELECT
                created_at,
                ${VIEW_VISITOR_KEY_SQL} AS visitor_key
            FROM stats
            WHERE event_type = 'view'
        )
        SELECT
            COUNT(DISTINCT CASE WHEN date(created_at, '+8 hours') = date('now', '+8 hours') THEN visitor_key END) AS today,
            COUNT(DISTINCT visitor_key) AS total
        FROM view_events
    `).get();
}

function analyticsViewCounters() {
    return db.prepare(`
        WITH view_events AS (
            SELECT
                created_at,
                ${VIEW_VISITOR_KEY_SQL} AS visitor_key
            FROM stats
            WHERE event_type = 'view'
        )
        SELECT
            COUNT(DISTINCT CASE WHEN date(created_at, '+8 hours') = date('now', '+8 hours') THEN visitor_key END) AS today,
            COUNT(DISTINCT CASE WHEN created_at >= datetime('now', '-7 days') THEN visitor_key END) AS week,
            COUNT(DISTINCT CASE WHEN created_at >= datetime('now', '-30 days') THEN visitor_key END) AS month,
            COUNT(DISTINCT visitor_key) AS total
        FROM view_events
    `).get();
}

function pendingMessageCount() {
    return db.prepare("SELECT COUNT(*) AS count FROM messages WHERE COALESCE(status, 'approved') = 'pending'").get().count;
}

function findRecentView(eventData, seconds = 5) {
    return db.prepare(`
        SELECT id
        FROM stats
        WHERE event_type = 'view'
          AND event_data = ?
          AND created_at >= datetime('now', ?)
        ORDER BY id DESC
        LIMIT 1
    `).get(eventData, `-${seconds} seconds`);
}

function findViewByIp(ip) {
    return db.prepare(`
        SELECT id
        FROM stats
        WHERE event_type = 'view'
          AND visitor_key = ?
        ORDER BY id DESC
        LIMIT 1
    `).get(String(ip || 'unknown'));
}

function recordView({ eventData, visitorKey, path, userAgent }) {
    return db.prepare(`
        INSERT INTO stats (event_type, event_data, visitor_key, page_path, user_agent)
        VALUES (?, ?, ?, ?, ?)
    `).run(
        'view',
        eventData,
        String(visitorKey || 'unknown'),
        String(path || '').slice(0, 500),
        String(userAgent || '').slice(0, 500)
    );
}

module.exports = {
    articleCounters,
    userCount,
    messageCount,
    allMessageCount,
    publicViewCounters,
    adminViewCounters,
    analyticsViewCounters,
    pendingMessageCount,
    findRecentView,
    findViewByIp,
    recordView
};
