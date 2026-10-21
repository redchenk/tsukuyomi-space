module.exports = {
    version: '047',
    name: 'payment_app_channel',
    up(db) {
        db.exec("ALTER TABLE payment_orders ADD COLUMN payment_channel TEXT NOT NULL DEFAULT 'web' CHECK (payment_channel IN ('web', 'mobile', 'app'))");
    }
};
