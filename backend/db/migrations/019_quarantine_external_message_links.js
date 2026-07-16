const { inspectMessageLinks } = require('../../services/message-link-security');

module.exports = {
    version: '019',
    name: 'quarantine_external_message_links',
    up(db) {
        const approved = db.prepare(`
            SELECT id, content
            FROM messages
            WHERE COALESCE(status, 'approved') = 'approved'
        `).all();
        const quarantine = db.prepare(`
            UPDATE messages
            SET status = 'pending', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);

        for (const message of approved) {
            const inspection = inspectMessageLinks(message.content);
            if (inspection.dangerousScheme || inspection.externalLinks.length) {
                quarantine.run(message.id);
            }
        }
    }
};
