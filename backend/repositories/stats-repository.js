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
        SELECT
            SUM(CASE WHEN date(created_at) = date('now', 'localtime') THEN 1 ELSE 0 END) AS today,
            SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS week,
            COUNT(*) AS total
        FROM stats
        WHERE event_type = 'view'
    `).get();
}

function adminViewCounters() {
    return db.prepare(`
        SELECT
            SUM(CASE WHEN date(created_at) = date('now', 'localtime') THEN 1 ELSE 0 END) AS today,
            COUNT(*) AS total
        FROM stats
        WHERE event_type = 'view'
    `).get();
}

function analyticsViewCounters() {
    return db.prepare(`
        SELECT
            SUM(CASE WHEN date(created_at) = date('now', 'localtime') THEN 1 ELSE 0 END) AS today,
            SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS week,
            SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS month,
            COUNT(*) AS total
        FROM stats
        WHERE event_type = 'view'
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
    recordView
};
