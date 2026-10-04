const db = require('../db');
const { publicAvatarUrl } = require('../utils/avatar');

function compactMessageRow(row) {
    const { avatar_updated_at: avatarUpdatedAt, ...message } = row;
    return {
        ...message,
        avatar: publicAvatarUrl({
            avatar: message.avatar,
            username: message.author,
            updatedAt: avatarUpdatedAt
        })
    };
}

const MESSAGE_SELECT_FIELDS = `
    SELECT m.id,
           COALESCE(u.username, m.author) AS author,
           COALESCE(NULLIF(u.nickname, ''), u.username, m.author) AS author_nickname,
           m.content,
           m.user_id,
           m.parent_id,
           m.reply_to_id,
           COALESCE(target_user.username, target.author, m.reply_to_author) AS reply_to_author,
           COALESCE(NULLIF(target_user.nickname, ''), target_user.username, target.author, m.reply_to_author) AS reply_to_nickname,
           m.like_count,
           m.article_id,
           m.status,
           m.created_at,
           m.updated_at,
           u.avatar,
           COALESCE(u.updated_at, u.created_at) AS avatar_updated_at
    FROM messages m
    LEFT JOIN users u ON m.user_id = u.id
    LEFT JOIN messages target ON m.reply_to_id = target.id
    LEFT JOIN users target_user ON target.user_id = target_user.id
`;

function listMessages({ articleId, includePending = false } = {}) {
    const statusFilter = includePending ? '' : "AND COALESCE(m.status, 'approved') = 'approved'";
    const query = articleId
        ? `
            ${MESSAGE_SELECT_FIELDS}
            WHERE m.article_id = ?
              ${statusFilter}
            ORDER BY m.created_at ASC
        `
        : `
            ${MESSAGE_SELECT_FIELDS}
            WHERE m.article_id IS NULL
              ${statusFilter}
            ORDER BY m.created_at DESC
        `;
    const rows = articleId ? db.prepare(query).all(articleId) : db.prepare(query).all();
    return rows.map(compactMessageRow);
}

function listRecentPublicMessages(limit = 8) {
    const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 8, 30));
    return db.prepare(`
        ${MESSAGE_SELECT_FIELDS}
        WHERE m.article_id IS NULL
          AND m.parent_id IS NULL
          AND COALESCE(m.status, 'approved') = 'approved'
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT ?
    `).all(safeLimit).map(compactMessageRow);
}

// Traverse only the selected thread using the existing parent/status index.
// An approved child below an unapproved parent never enters the public tree.
function plazaReplyTree(root) {
    return `WITH RECURSIVE reply_tree(id, depth) AS (
        SELECT id, 1 FROM messages
        WHERE parent_id = ${root} AND article_id IS NULL AND COALESCE(status, 'approved') = 'approved'
        UNION ALL
        SELECT child.id, tree.depth + 1 FROM messages child
        JOIN reply_tree tree ON child.parent_id = tree.id
        WHERE child.article_id IS NULL AND COALESCE(child.status, 'approved') = 'approved' AND tree.depth < 100
    )`;
}

const PLAZA_REPLY_COUNT = `(${plazaReplyTree('m.id')} SELECT COUNT(*) FROM reply_tree)`;

function plazaFilter({ sort, search, userId }) {
    let where = "m.article_id IS NULL AND m.parent_id IS NULL AND COALESCE(m.status, 'approved') = 'approved'";
    const params = [];
    if (sort === 'mine') { where += ' AND m.user_id = ?'; params.push(userId); }
    // Every visible descendant has a visible immediate ancestor, so existence
    // needs only the parent index rather than a full recursive count per root.
    if (sort === 'replied') where += ` AND EXISTS (SELECT 1 FROM messages child
        WHERE child.parent_id = m.id AND child.article_id IS NULL AND COALESCE(child.status, 'approved') = 'approved')`;
    if (search) {
        const text = "LOWER(COALESCE(NULLIF(u.nickname, ''), u.username, m.author) || ' ' || m.content) LIKE ? ESCAPE '\\'";
        where += ` AND (${text} OR EXISTS (
            ${plazaReplyTree('m.id')}
            SELECT 1 FROM messages r LEFT JOIN users ru ON ru.id = r.user_id
            WHERE r.id IN (SELECT id FROM reply_tree)
              AND LOWER(COALESCE(NULLIF(ru.nickname, ''), ru.username, r.author) || ' ' || r.content) LIKE ? ESCAPE '\\'
        ))`;
        const term = `%${search.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;
        params.push(term, term);
    }
    return { where, params };
}

function listPlazaPage({ page = 1, limit = 8, sort = 'latest', search = '', userId = '', anchorId = null } = {}) {
    const { where, params } = plazaFilter({ sort, search, userId });
    const userJoin = search ? ' LEFT JOIN users u ON u.id = m.user_id' : '';
    const total = db.prepare(`SELECT COUNT(*) AS count FROM messages m${userJoin} WHERE ${where}`).get(...params).count;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    let currentPage = Math.min(page, totalPages);
    const primary = sort === 'hot' ? 'COALESCE(m.like_count, 0)' : sort === 'replied' ? PLAZA_REPLY_COUNT : null;
    let anchor = null;
    let root = null;
    if (anchorId) {
        anchor = findApprovedMessageById(anchorId);
        root = anchor && anchor.article_id == null ? findReplyThreadRoot(anchor) : null;
        if (!root || !db.prepare(`SELECT 1 FROM messages m${userJoin} WHERE ${where} AND m.id = ?`).get(...params, root.id)) return null;
        const rank = primary
            ? db.prepare(`SELECT ${primary} AS value FROM messages m WHERE m.id = ?`).get(root.id).value : null;
        const preceding = db.prepare(`SELECT COUNT(*) AS count FROM messages m${userJoin}
            WHERE ${where} AND ${primary ? `(${primary}, m.created_at, m.id) > (?, ?, ?)` : '(m.created_at, m.id) > (?, ?)'}`)
            .get(...params, ...(primary ? [rank] : []), root.created_at, root.id).count;
        currentPage = Math.floor(preceding / limit) + 1;
    }
    const order = `${primary ? primary + ' DESC,' : ''} m.created_at DESC, m.id DESC`;
    // Bound the candidate IDs before joining avatars or computing floor metadata.
    // Materialization prevents SQLite from evaluating these fields for every row
    // before a temporary ORDER BY/limit, especially on older message indexes.
    const selection = `WITH selected AS MATERIALIZED (
        SELECT m.id FROM messages m${userJoin}
        WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?
    )`;
    const rows = db.prepare(`${selection} ${MESSAGE_SELECT_FIELDS.replace('SELECT m.id,', `SELECT ${PLAZA_REPLY_COUNT} AS reply_count,
        (SELECT COUNT(*) FROM messages older WHERE older.article_id IS NULL AND older.parent_id IS NULL
            AND COALESCE(older.status, 'approved') = 'approved' AND (older.created_at, older.id) <= (m.created_at, m.id)) AS floor_number, m.id,`)}
        JOIN selected ON selected.id = m.id ORDER BY ${order}`)
        .all(...params, limit, (currentPage - 1) * limit).map(compactMessageRow);
    const messages = [...rows];
    for (const message of rows) {
        if (!message.reply_count) continue;
        const latest = db.prepare(`${plazaReplyTree('?')} ${MESSAGE_SELECT_FIELDS}
            WHERE m.id IN (SELECT id FROM reply_tree) ORDER BY m.created_at DESC, m.id DESC LIMIT 1`).get(message.id);
        if (latest) messages.push({ ...compactMessageRow(latest), parent_id: message.id });
    }
    if (anchor?.parent_id && !messages.some(item => item.id === anchor.id)) messages.push({ ...anchor, parent_id: root.id });
    const activity = db.prepare(`${MESSAGE_SELECT_FIELDS}
        WHERE m.article_id IS NULL AND COALESCE(m.status, 'approved') = 'approved'
        ORDER BY m.created_at DESC, m.id DESC LIMIT 4`).all().map(compactMessageRow)
        .filter(item => !item.parent_id || findReplyThreadRoot(item))
        .map(({ id, parent_id, author, author_nickname, created_at }) => ({ id, parent_id, author, author_nickname, created_at }));
    return { messages, activity, anchor_id: anchor?.id || null,
        pagination: { page: currentPage, limit, total, totalPages } };
}

function listPlazaReplies(rootId, { limit = 20, beforeId = null } = {}) {
    const root = findApprovedMessageById(rootId);
    if (!root || root.article_id != null || root.parent_id) return null;
    let cursor = '';
    const params = [rootId];
    if (beforeId) {
        const before = db.prepare(`${plazaReplyTree('?')} SELECT created_at, id FROM messages WHERE id = ? AND id IN (SELECT id FROM reply_tree)`).get(rootId, beforeId);
        if (!before) return null;
        cursor = ' AND (m.created_at, m.id) < (?, ?)';
        params.push(before.created_at, before.id);
    }
    const rows = db.prepare(`${plazaReplyTree('?')} ${MESSAGE_SELECT_FIELDS}
        WHERE m.id IN (SELECT id FROM reply_tree) ${cursor}
        ORDER BY m.created_at DESC, m.id DESC LIMIT ?`).all(...params, limit + 1);
    const hasMore = rows.length > limit;
    const replies = rows.slice(0, limit).map(row => ({ ...compactMessageRow(row), parent_id: root.id }));
    return { root_id: root.id, replies, has_more: hasMore, next_before_id: hasMore ? replies.at(-1).id : null };
}

function createMessage({ author, content, userId, articleId = null, parentId = null, replyToId = null, replyToAuthor = null, status = 'pending' }) {
    const normalizedStatus = status === 'approved' ? 'approved' : 'pending';
    const result = parentId
        ? db.prepare(`
            INSERT INTO messages (author, content, user_id, parent_id, article_id, reply_to_id, reply_to_author, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(author, content, userId, parentId, articleId, replyToId, replyToAuthor, normalizedStatus)
        : db.prepare(`
            INSERT INTO messages (author, content, user_id, article_id, status)
            VALUES (?, ?, ?, ?, ?)
        `).run(author, content, userId, articleId, normalizedStatus);
    return findMessageById(result.lastInsertRowid);
}

function findMessageById(id) {
    const row = db.prepare(`${MESSAGE_SELECT_FIELDS} WHERE m.id = ?`).get(id);
    return row ? compactMessageRow(row) : null;
}

function findApprovedMessageById(id) {
    const row = db.prepare(`${MESSAGE_SELECT_FIELDS} WHERE m.id = ? AND COALESCE(m.status, 'approved') = 'approved'`).get(id);
    return row ? compactMessageRow(row) : null;
}

function findReplyThreadRoot(target) {
    const seen = new Set();
    let current = target;
    while (current?.parent_id) {
        if (seen.has(current.id) || seen.size >= 100) return null;
        seen.add(current.id);
        current = findApprovedMessageById(current.parent_id);
        if (!current || current.article_id !== target.article_id) return null;
    }
    return current;
}

function listUserMessages(userId, { limit = 100, offset = 0 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 100));
    const safeOffset = Math.max(0, Number(offset) || 0);
    return db.prepare(`
        SELECT m.id,
               COALESCE(u.username, m.author) AS author,
               COALESCE(NULLIF(u.nickname, ''), u.username, m.author) AS author_nickname,
               m.content,
               m.user_id,
               m.parent_id,
               m.like_count,
               m.article_id,
               m.status,
               m.created_at,
               m.updated_at,
               u.avatar,
               COALESCE(u.updated_at, u.created_at) AS avatar_updated_at,
               a.title AS article_title,
               a.slug AS article_slug,
               (SELECT COUNT(*) FROM messages reply WHERE reply.parent_id = m.id) AS reply_count
        FROM messages m
        LEFT JOIN users u ON m.user_id = u.id
        LEFT JOIN articles a ON m.article_id = a.id
        WHERE m.user_id = ?
        ORDER BY COALESCE(m.updated_at, m.created_at) DESC
        LIMIT ? OFFSET ?
    `).all(userId, safeLimit, safeOffset).map(compactMessageRow);
}

function findUserMessageById(id, userId) {
    const row = db.prepare(`${MESSAGE_SELECT_FIELDS} WHERE m.id = ? AND m.user_id = ?`).get(id, userId);
    return row ? compactMessageRow(row) : null;
}

function updateUserMessage(id, userId, { content, status }) {
    const normalizedStatus = status === 'approved' ? 'approved' : 'pending';
    const changed = db.prepare(`
        UPDATE messages
        SET content = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
    `).run(content, normalizedStatus, id, userId).changes;
    return changed ? findUserMessageById(id, userId) : null;
}

function deleteUserMessage(id, userId) {
    return db.transaction(() => {
        const message = db.prepare(`
            SELECT id, parent_id, article_id
            FROM messages
            WHERE id = ? AND user_id = ?
        `).get(id, userId);
        if (!message) return null;

        db.prepare('UPDATE messages SET parent_id = ? WHERE parent_id = ?').run(message.parent_id || null, message.id);
        db.prepare('DELETE FROM notifications WHERE related_message_id = ?').run(message.id);
        db.prepare('DELETE FROM message_likes WHERE message_id = ?').run(message.id);
        db.prepare('DELETE FROM message_mentions WHERE message_id = ?').run(message.id);
        db.prepare('DELETE FROM messages WHERE id = ? AND user_id = ?').run(message.id, userId);
        return message;
    })();
}

function findMessageLike(messageId, userId) {
    return db.prepare('SELECT id FROM message_likes WHERE message_id = ? AND user_id = ?').get(messageId, userId);
}

function listMessageLikeIds(userId, ids = null) {
    return db.prepare(`
        SELECT message_id
        FROM message_likes
        WHERE user_id = ? ${ids ? `AND message_id IN (${ids.map(() => '?').join(',')})` : ''}
        ORDER BY id DESC
    `).all(userId, ...(ids || [])).map(row => row.message_id);
}

function likeMessage(messageId, userId) {
    const tx = db.transaction(() => {
        db.prepare('INSERT INTO message_likes (message_id, user_id) VALUES (?, ?)').run(messageId, userId);
        db.prepare('UPDATE messages SET like_count = like_count + 1 WHERE id = ?').run(messageId);
    });
    tx();
    return findMessageById(messageId);
}

module.exports = {
    listMessages,
    listRecentPublicMessages,
    listPlazaPage,
    listPlazaReplies,
    createMessage,
    findMessageById,
    findApprovedMessageById,
    findReplyThreadRoot,
    listUserMessages,
    findUserMessageById,
    updateUserMessage,
    deleteUserMessage,
    findMessageLike,
    listMessageLikeIds,
    likeMessage
};
