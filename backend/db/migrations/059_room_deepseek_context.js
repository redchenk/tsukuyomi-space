module.exports = { version: '059', name: 'room_deepseek_context', up(db) {
    const columns = db.prepare('PRAGMA table_info(room_chat_messages)').all();
    if (!columns.some(c => c.name === 'provider_context')) db.exec("ALTER TABLE room_chat_messages ADD COLUMN provider_context TEXT NOT NULL DEFAULT ''");
} };
