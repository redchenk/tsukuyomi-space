const db = require('../db');

const VIEW_VISITOR_KEY_SQL = `
    COALESCE(
        NULLIF(visitor_key, ''),
        NULLIF(CASE WHEN json_valid(event_data) THEN json_extract(event_data, '$.ip') END, ''),
        NULLIF(event_data, ''),
        CAST(id AS TEXT)
    )
`;

const VIEW_DAY_SQL = `
    COALESCE(
        NULLIF(visit_day, ''),
        date(created_at, '+8 hours')
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
                ${VIEW_DAY_SQL} AS visit_day,
                ${VIEW_VISITOR_KEY_SQL} AS visitor_key
            FROM stats
            WHERE event_type = 'view'
        )
        SELECT
            COUNT(DISTINCT CASE WHEN visit_day = date('now', '+8 hours') THEN visit_day || char(31) || visitor_key END) AS today,
            COUNT(DISTINCT CASE WHEN visit_day BETWEEN date('now', '+8 hours', '-6 days') AND date('now', '+8 hours') THEN visit_day || char(31) || visitor_key END) AS week,
            COUNT(DISTINCT visit_day || char(31) || visitor_key) AS total
        FROM view_events
    `).get();
}

function adminViewCounters() {
    return db.prepare(`
        WITH view_events AS (
            SELECT
                ${VIEW_DAY_SQL} AS visit_day,
                ${VIEW_VISITOR_KEY_SQL} AS visitor_key
            FROM stats
            WHERE event_type = 'view'
        )
        SELECT
            COUNT(DISTINCT CASE WHEN visit_day = date('now', '+8 hours') THEN visit_day || char(31) || visitor_key END) AS today,
            COUNT(DISTINCT visit_day || char(31) || visitor_key) AS total
        FROM view_events
    `).get();
}

function analyticsViewCounters() {
    return db.prepare(`
        WITH view_events AS (
            SELECT
                ${VIEW_DAY_SQL} AS visit_day,
                ${VIEW_VISITOR_KEY_SQL} AS visitor_key
            FROM stats
            WHERE event_type = 'view'
        )
        SELECT
            COUNT(DISTINCT CASE WHEN visit_day = date('now', '+8 hours') THEN visit_day || char(31) || visitor_key END) AS today,
            COUNT(DISTINCT CASE WHEN visit_day BETWEEN date('now', '+8 hours', '-6 days') AND date('now', '+8 hours') THEN visit_day || char(31) || visitor_key END) AS week,
            COUNT(DISTINCT CASE WHEN visit_day BETWEEN date('now', '+8 hours', '-29 days') AND date('now', '+8 hours') THEN visit_day || char(31) || visitor_key END) AS month,
            COUNT(DISTINCT visit_day || char(31) || visitor_key) AS total
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

function findDailyViewByVisitorKey(visitorKey) {
    return db.prepare(`
        SELECT id, visitor_key, browser_key
        FROM stats
        WHERE event_type = 'view'
          AND visitor_key = ?
          AND ${VIEW_DAY_SQL} = date('now', '+8 hours')
        LIMIT 1
    `).get(String(visitorKey || ''));
}

function findDailyViewByBrowserKey(browserKey, anonymousOnly = false) {
    if (!browserKey) return null;
    const anonymousFilter = anonymousOnly
        ? "AND (visitor_key LIKE 'visitor:%' OR visitor_key LIKE 'fallback:%')"
        : '';
    return db.prepare(`
        SELECT id, visitor_key, browser_key
        FROM stats
        WHERE event_type = 'view'
          AND browser_key = ?
          AND ${VIEW_DAY_SQL} = date('now', '+8 hours')
          ${anonymousFilter}
        ORDER BY id ASC
        LIMIT 1
    `).get(String(browserKey));
}

const recordDailyView = db.transaction(({ eventData, visitorKey, browserKey, path, userAgent, authenticated }) => {
    const normalizedVisitorKey = String(visitorKey || '');
    const normalizedBrowserKey = String(browserKey || '');
    const existing = findDailyViewByVisitorKey(normalizedVisitorKey);
    if (existing) return { recorded: false, deduped: true, id: existing.id };

    const browserMatch = findDailyViewByBrowserKey(normalizedBrowserKey, Boolean(authenticated));
    if (browserMatch) {
        if (browserMatch.visitor_key !== normalizedVisitorKey && authenticated) {
            db.prepare(`
                UPDATE stats
                SET event_data = ?, visitor_key = ?, browser_key = ?, page_path = ?, user_agent = ?
                WHERE id = ?
            `).run(
                eventData,
                normalizedVisitorKey,
                normalizedBrowserKey,
                String(path || '').slice(0, 500),
                String(userAgent || '').slice(0, 500),
                browserMatch.id
            );
        }
        return { recorded: false, deduped: true, migrated: authenticated, id: browserMatch.id };
    }

    try {
        const result = db.prepare(`
            INSERT INTO stats (event_type, event_data, visitor_key, browser_key, visit_day, page_path, user_agent)
            VALUES ('view', ?, ?, ?, date('now', '+8 hours'), ?, ?)
        `).run(
            eventData,
            normalizedVisitorKey,
            normalizedBrowserKey,
            String(path || '').slice(0, 500),
            String(userAgent || '').slice(0, 500)
        );
        return { recorded: true, deduped: false, id: result.lastInsertRowid };
    } catch (error) {
        if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            const duplicate = findDailyViewByVisitorKey(normalizedVisitorKey);
            return { recorded: false, deduped: true, id: duplicate?.id || null };
        }
        throw error;
    }
});

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
    findDailyViewByVisitorKey,
    recordDailyView
};
