const db = require('../db');

const PUBLIC_FIELDS = `
    id,
    name,
    url,
    COALESCE(description, '') AS description,
    COALESCE(avatar_url, '') AS avatar_url,
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

function createActiveLink({ name, url, description = '', avatarUrl = '' }) {
    const result = db.prepare(`
        INSERT INTO friend_links (name, url, description, avatar_url, status, reviewed_at)
        VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
    `).run(name, url, description, avatarUrl);
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

function deleteLink(id) {
    return db.prepare('DELETE FROM friend_links WHERE id = ?').run(id).changes;
}

module.exports = {
    listActiveLinks,
    listAdminLinks,
    listUserApplications,
    findById,
    findByUrl,
    createApplication,
    resubmitApplication,
    createActiveLink,
    updateAvatar,
    updateStatus,
    deleteLink
};
