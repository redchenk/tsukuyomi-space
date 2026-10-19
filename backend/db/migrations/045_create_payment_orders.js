module.exports = {
    version: '045',
    name: 'create_payment_orders',
    up(db) {
        db.exec(`
            CREATE TABLE payment_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
                products_json TEXT NOT NULL DEFAULT '[]',
                updated_at INTEGER NOT NULL
            );
            INSERT INTO payment_settings (id, updated_at) VALUES (1, 0);
            CREATE TABLE payment_orders (
                id TEXT PRIMARY KEY,
                user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
                request_key TEXT NOT NULL,
                product_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
                app_id TEXT NOT NULL,
                seller_id TEXT NOT NULL,
                environment TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'closed')),
                trade_no TEXT UNIQUE,
                provider_status TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                paid_at INTEGER,
                closed_at INTEGER,
                last_query_at INTEGER NOT NULL DEFAULT 0,
                UNIQUE(user_id, request_key)
            );
            CREATE INDEX idx_payment_orders_user ON payment_orders(user_id, created_at DESC, id);
            CREATE INDEX idx_payment_orders_created ON payment_orders(created_at DESC, id);
        `);
    }
};
