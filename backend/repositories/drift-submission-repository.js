const db = require('../db');

function findSubmission(userId, requestId, fingerprint) {
    if (!requestId) return null;
    const row = db.prepare('SELECT fingerprint,result_json FROM drift_submissions WHERE user_id=? AND request_id=?').get(userId,requestId);
    if (!row) return null;
    if (row.fingerprint !== fingerprint) {
        throw Object.assign(new Error('提交标识已用于其他内容，请先核对我的瓶子。'), { status:409, code:'DRIFT_SUBMISSION_CONFLICT' });
    }
    return JSON.parse(row.result_json);
}

function saveSubmission(userId, requestId, fingerprint, create) {
    // The receipt, content and notification commit together, including across
    // processes. A retry only returns the receipt and never notifies twice.
    return db.transaction(() => {
        const previous = findSubmission(userId,requestId,fingerprint);
        if (previous) return previous;
        const result = create();
        if (requestId) db.prepare('INSERT INTO drift_submissions(user_id,request_id,fingerprint,result_json) VALUES(?,?,?,?)')
            .run(userId,requestId,fingerprint,JSON.stringify(result));
        return result;
    }).immediate();
}

module.exports = { findSubmission, saveSubmission };
