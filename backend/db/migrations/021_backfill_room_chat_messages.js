function parseLegacyConversations(content) {
    const source = String(content || '').trim();
    const conversations = [];
    const userMarker = '用户：';
    const assistantMarker = '\n八千代：';
    let cursor = 0;

    while (cursor < source.length) {
        const userStart = source.indexOf(userMarker, cursor);
        if (userStart < 0) break;
        const assistantStart = source.indexOf(assistantMarker, userStart + userMarker.length);
        if (assistantStart < 0) break;
        const nextUser = source.indexOf(`\n\n${userMarker}`, assistantStart + assistantMarker.length);
        const userMessage = source.slice(userStart + userMarker.length, assistantStart).trim();
        const assistantMessage = source.slice(
            assistantStart + assistantMarker.length,
            nextUser < 0 ? source.length : nextUser
        ).trim();
        if (userMessage && assistantMessage) conversations.push({ userMessage, assistantMessage });
        if (nextUser < 0) break;
        cursor = nextUser + 2;
    }

    return conversations;
}

module.exports = {
    version: '021',
    name: 'backfill_room_chat_messages',
    parseLegacyConversations,
    up(db) {
        const memories = db.prepare(`
            SELECT id, user_id, content, created_at
            FROM room_memories
            WHERE content LIKE '%用户：%'
              AND content LIKE '%八千代：%'
            ORDER BY created_at ASC, rowid ASC
        `).all();
        const exactTurn = db.prepare(`
            SELECT 1
            FROM room_chat_messages AS user_message
            JOIN room_chat_messages AS assistant_message
              ON assistant_message.user_id = user_message.user_id
             AND assistant_message.turn_id = user_message.turn_id
             AND assistant_message.role = 'assistant'
            WHERE user_message.user_id = ?
              AND user_message.role = 'user'
              AND user_message.content = ?
              AND assistant_message.content = ?
            LIMIT 1
        `);
        const insert = db.prepare(`
            INSERT OR IGNORE INTO room_chat_messages (id, user_id, turn_id, role, content, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const touchedUsers = new Set();

        for (const memory of memories) {
            const conversations = parseLegacyConversations(memory.content);
            conversations.forEach((conversation, index) => {
                if (exactTurn.get(memory.user_id, conversation.userMessage, conversation.assistantMessage)) return;
                const turnId = `legacy-memory-${memory.id}-${index}`;
                insert.run(`${turnId}-user`, memory.user_id, turnId, 'user', conversation.userMessage, memory.created_at);
                insert.run(`${turnId}-assistant`, memory.user_id, turnId, 'assistant', conversation.assistantMessage, memory.created_at);
                touchedUsers.add(memory.user_id);
            });
        }

        const prune = db.prepare(`
            DELETE FROM room_chat_messages
            WHERE user_id = ?
              AND rowid NOT IN (
                  SELECT rowid
                  FROM room_chat_messages
                  WHERE user_id = ?
                  ORDER BY rowid DESC
                  LIMIT 100
              )
        `);
        for (const userId of touchedUsers) prune.run(userId, userId);
    }
};
