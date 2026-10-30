module.exports = {
    version: '057', name: 'official_usage_date_index',
    up(db) {
        db.exec('CREATE INDEX IF NOT EXISTS billing_requests_created_at ON billing_requests(created_at, request_id)');
    }
};
