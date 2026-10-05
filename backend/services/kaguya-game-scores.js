const db = require('../db');
const { publicAvatarUrl } = require('../utils/avatar');
const userGrowth = require('./user-growth');

const DAILY_TASK_SCORE = 100;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

function httpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function normalizeScore(rawScore) {
    const score = Number(rawScore);
    if (!Number.isSafeInteger(score) || score < 0) {
        throw httpError(400, '积分格式无效');
    }
    return score;
}

function normalizePage(rawPage) {
    const page = Number(rawPage);
    return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function normalizeLimit(rawLimit) {
    const limit = Number(rawLimit);
    return Number.isInteger(limit) && limit > 0
        ? Math.min(limit, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;
}

function publicEntry(row) {
    if (!row) return null;
    return {
        rank: Number(row.rank) || 0,
        userId: row.user_id,
        username: row.username,
        nickname: row.nickname || row.username,
        avatar: publicAvatarUrl({
            avatar: row.avatar,
            username: row.username,
            updatedAt: row.user_updated_at
        }),
        score: Number(row.best_score) || 0,
        updatedAt: row.score_updated_at
    };
}

function rankedUser(userId) {
    if (!userId) return null;
    const row = db.prepare(`
        SELECT
            scores.user_id,
            scores.best_score,
            scores.updated_at AS score_updated_at,
            users.username,
            users.nickname,
            users.avatar,
            users.updated_at AS user_updated_at,
            (
                SELECT COUNT(*) + 1
                FROM kaguya_game_scores higher
                WHERE higher.best_score > scores.best_score
            ) AS rank
        FROM kaguya_game_scores scores
        JOIN users ON users.id = scores.user_id
        WHERE scores.user_id = ? AND scores.best_score > 0
    `).get(userId);
    return publicEntry(row);
}

function listLeaderboard({ page: rawPage, limit: rawLimit, userId = '' } = {}) {
    const limit = normalizeLimit(rawLimit);
    const total = Number(db.prepare(`
        SELECT COUNT(*) AS count FROM kaguya_game_scores WHERE best_score > 0
    `).get()?.count) || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(normalizePage(rawPage), totalPages);
    const offset = (page - 1) * limit;
    // Limit through the ranking index before joining users; do not window/sort the whole board per page.
    const rows = db.prepare(`
        SELECT scores.user_id, scores.best_score, scores.updated_at AS score_updated_at,
               users.username, users.nickname, users.avatar, users.updated_at AS user_updated_at
        FROM (SELECT user_id, best_score, updated_at FROM kaguya_game_scores
              WHERE best_score > 0 ORDER BY best_score DESC, updated_at ASC, user_id ASC
              LIMIT ? OFFSET ?) scores
        JOIN users ON users.id = scores.user_id
        ORDER BY scores.best_score DESC, scores.updated_at ASC, scores.user_id ASC
    `).all(limit, offset);
    const ranks = new Map();
    const rankQuery = db.prepare('SELECT COUNT(*) + 1 AS rank FROM kaguya_game_scores WHERE best_score > ?');
    const entries = rows.map((row) => {
        if (!ranks.has(row.best_score)) ranks.set(row.best_score, rankQuery.get(row.best_score).rank);
        return publicEntry({ ...row, rank: ranks.get(row.best_score) });
    });

    return {
        entries,
        current: rankedUser(userId),
        page,
        pageSize: limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
    };
}

const submitScoreTransaction = db.transaction((userId, rawScore) => {
    const score = normalizeScore(rawScore);
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) throw httpError(404, '用户不存在');

    db.prepare(`
        INSERT INTO kaguya_game_scores (user_id, best_score)
        VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            best_score = excluded.best_score,
            updated_at = CURRENT_TIMESTAMP
        WHERE excluded.best_score > kaguya_game_scores.best_score
    `).run(userId, score);

    const growth = score >= DAILY_TASK_SCORE
        ? userGrowth.recordDailyActivity(userId, 'kaguya_score', 'kaguya-run')
        : null;

    return {
        current: rankedUser(userId),
        growth
    };
});

function submitScore(userId, rawScore) {
    return submitScoreTransaction(userId, rawScore);
}

module.exports = {
    DAILY_TASK_SCORE,
    listLeaderboard,
    normalizeScore,
    submitScore
};
