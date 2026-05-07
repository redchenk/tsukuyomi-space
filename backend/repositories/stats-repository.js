const db = require('../db');

function articleCounters() {
    return db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(view_count), 0) AS views FROM articles').get();
}

function userCount() {
    return db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
}

function messageCount() {
    return db.prepare('SELECT COUNT(*) AS count FROM messages').get().count;
}

function publicViewCounters() {
    return db.prepare(`
        WITH view_events AS (
            SELECT
                created_at,
                COALESCE(NULLIF(CASE WHEN json_valid(event_data) THEN json_extract(event_data, '$.ip') END, ''), event_data, CAST(id AS TEXT)) AS visitor_key
            FROM stats
            WHERE event_type = 'view'
        )
        SELECT
            COUNT(DISTINCT CASE WHEN date(created_at) = date('now', 'localtime') THEN visitor_key END) AS today,
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
                COALESCE(NULLIF(CASE WHEN json_valid(event_data) THEN json_extract(event_data, '$.ip') END, ''), event_data, CAST(id AS TEXT)) AS visitor_key
            FROM stats
            WHERE event_type = 'view'
        )
        SELECT
            COUNT(DISTINCT CASE WHEN date(created_at) = date('now', 'localtime') THEN visitor_key END) AS today,
            COUNT(DISTINCT visitor_key) AS total
        FROM view_events
    `).get();
}

function analyticsViewCounters() {
    return db.prepare(`
        WITH view_events AS (
            SELECT
                created_at,
                COALESCE(NULLIF(CASE WHEN json_valid(event_data) THEN json_extract(event_data, '$.ip') END, ''), event_data, CAST(id AS TEXT)) AS visitor_key
            FROM stats
            WHERE event_type = 'view'
        )
        SELECT
            COUNT(DISTINCT CASE WHEN date(created_at) = date('now', 'localtime') THEN visitor_key END) AS today,
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
          AND COALESCE(NULLIF(CASE WHEN json_valid(event_data) THEN json_extract(event_data, '$.ip') END, ''), event_data) = ?
        ORDER BY id DESC
        LIMIT 1
    `).get(String(ip || 'unknown'));
}

function recordView(eventData) {
    return db.prepare('INSERT INTO stats (event_type, event_data) VALUES (?, ?)').run('view', eventData);
}

module.exports = {
    articleCounters,
    userCount,
    messageCount,
    publicViewCounters,
    adminViewCounters,
    analyticsViewCounters,
    pendingMessageCount,
    findRecentView,
    findViewByIp,
    recordView
};
