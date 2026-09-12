const db = require('../db');

const PUBLIC_FIELDS = `
    id,
    name,
    url,
    COALESCE(description, '') AS description,
    COALESCE(avatar_url, '') AS avatar_url,
    COALESCE(monitor_status, 'unchecked') AS monitor_status,
    COALESCE(response_time_ms, 0) AS response_time_ms,
    COALESCE(http_status, 0) AS http_status,
    COALESCE(fail_count, 0) AS fail_count,
    COALESCE(has_backlink, 0) AS has_backlink,
    last_checked_at,
    COALESCE(screenshot_url, '') AS screenshot_url,
    screenshot_updated_at,
    created_at
`;

function listActiveLinks() {
    return db.prepare(`
        SELECT ${PUBLIC_FIELDS}
        FROM friend_links
        WHERE status = 'active'
        ORDER BY created_at DESC, id DESC
    `).all();
}

function listAdminLinks() {
    return db.prepare(`
        SELECT f.*,
               u.username AS applicant_username,
               u.email AS applicant_email
        FROM friend_links f
        LEFT JOIN users u ON u.id = f.user_id
        ORDER BY
            CASE f.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
            f.created_at DESC,
            f.id DESC
    `).all();
}

function listUserApplications(userId) {
    return db.prepare(`
        SELECT ${PUBLIC_FIELDS},
               status,
               COALESCE(backlink_url, '') AS backlink_url,
               COALESCE(note, '') AS note,
               reviewed_at,
               updated_at
        FROM friend_links
        WHERE user_id = ?
        ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
        LIMIT 20
    `).all(userId);
}

function findById(id) {
    return db.prepare('SELECT * FROM friend_links WHERE id = ?').get(id);
}

function findByUrl(url) {
    return db.prepare('SELECT * FROM friend_links WHERE lower(url) = lower(?) ORDER BY id DESC LIMIT 1').get(url);
}

function listMonitorSource() {
    return db.prepare(`
        SELECT ${PUBLIC_FIELDS},
               COALESCE(backlink_url, '') AS backlink_url
        FROM friend_links
        WHERE status = 'active'
        ORDER BY created_at DESC, id DESC
    `).all();
}

function createApplication({ name, url, description, avatarUrl, backlinkUrl, note, userId }) {
    const result = db.prepare(`
        INSERT INTO friend_links (name, url, description, avatar_url, backlink_url, note, user_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(name, url, description, avatarUrl, backlinkUrl, note, userId);
    return findById(result.lastInsertRowid);
}

function resubmitApplication(id, { name, url, description, avatarUrl, backlinkUrl, note, userId }) {
    const changes = db.prepare(`
        UPDATE friend_links
        SET name = ?,
            url = ?,
            description = ?,
            avatar_url = ?,
            backlink_url = ?,
            note = ?,
            status = 'pending',
            reviewed_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND status = 'rejected'
    `).run(name, url, description, avatarUrl, backlinkUrl, note, id, userId).changes;
    return changes ? findById(id) : null;
}

function createActiveLink({ name, url, description = '', avatarUrl = '', backlinkUrl = '' }) {
    const result = db.prepare(`
        INSERT INTO friend_links (name, url, description, avatar_url, backlink_url, status, reviewed_at)
        VALUES (?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
    `).run(name, url, description, avatarUrl, backlinkUrl);
    return findById(result.lastInsertRowid);
}

function updateAvatar(id, avatarUrl) {
    const changes = db.prepare(`
        UPDATE friend_links
        SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(avatarUrl, id).changes;
    return changes ? findById(id) : null;
}

function updateStatus(id, status) {
    const changes = db.prepare(`
        UPDATE friend_links
        SET status = ?,
            reviewed_at = CASE WHEN ? = 'pending' THEN NULL ELSE CURRENT_TIMESTAMP END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(status, status, id).changes;
    return changes ? findById(id) : null;
}

function updateMonitorResult(id, {
    status,
    responseTimeMs = 0,
    httpStatus = 0,
    failCount = 0,
    hasBacklink = false,
    error = '',
    checkedAt = new Date().toISOString()
}) {
    const changes = db.prepare(`
        UPDATE friend_links
        SET monitor_status = ?,
            response_time_ms = ?,
            http_status = ?,
            fail_count = ?,
            has_backlink = ?,
            monitor_error = ?,
            last_checked_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'active'
    `).run(
        status,
        Math.max(0, Number.parseInt(responseTimeMs, 10) || 0),
        Math.max(0, Number.parseInt(httpStatus, 10) || 0),
        Math.max(0, Number.parseInt(failCount, 10) || 0),
        hasBacklink === true || hasBacklink === 1 ? 1 : 0,
        String(error || '').slice(0, 300),
        checkedAt,
        id
    ).changes;
    return changes ? findById(id) : null;
}

function updateScreenshot(id, screenshotUrl, capturedAt = new Date().toISOString(), storageKey = '') {
    const changes = db.prepare(`
        UPDATE friend_links
        SET screenshot_url = ?,
            screenshot_storage_key = ?,
            screenshot_updated_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'active'
    `).run(screenshotUrl, storageKey, capturedAt, id).changes;
    return changes ? findById(id) : null;
}

function deleteLink(id) {
    return db.prepare('DELETE FROM friend_links WHERE id = ?').run(id).changes;
}

module.exports = {
    listActiveLinks,
    listAdminLinks,
    listUserApplications,
    listMonitorSource,
    findById,
    findByUrl,
    createApplication,
    resubmitApplication,
    createActiveLink,
    updateAvatar,
    updateStatus,
    updateMonitorResult,
    updateScreenshot,
    deleteLink
};
