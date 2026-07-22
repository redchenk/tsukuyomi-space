const crypto = require('crypto');
const db = require('../db');

const HONG_KONG_TIME_ZONE = 'Asia/Hong_Kong';
const REFERRAL_ACCOUNT_MAX_AGE_DAYS = 7;
const REFERRAL_WEEKLY_REWARD_LIMIT = 10;

const LEVELS = Object.freeze([
    { level: 1, title: '初次连接', minXp: 0 },
    { level: 2, title: '微光相识', minXp: 60 },
    { level: 3, title: '月下同行', minXp: 180 },
    { level: 4, title: '心声共鸣', minXp: 420 },
    { level: 5, title: '记忆同调', minXp: 800 },
    { level: 6, title: '星海相伴', minXp: 1400 },
    { level: 7, title: '月之眷属', minXp: 2200 },
    { level: 8, title: '永恒月契', minXp: 3200 }
]);

const DAILY_ACTIONS = Object.freeze({
    checkin: { xp: 10, label: '每日签到' },
    daily_chat: { xp: 20, label: '与八千代聊天' },
    daily_share: { xp: 15, label: '分享月读空间' }
});

const EVENT_LABELS = Object.freeze({
    checkin: '每日签到',
    daily_chat: '与八千代聊天',
    daily_share: '分享月读空间',
    referral_joined: '接受好友邀请',
    referral_invite: '好友完成首次聊天'
});

const SHARE_PLATFORMS = new Set(['native', 'qq', 'qzone', 'weibo', 'x', 'telegram', 'copy', 'room-card']);

function httpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function hongKongDate(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en', {
        timeZone: HONG_KONG_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(now).reduce((result, part) => {
        if (part.type !== 'literal') result[part.type] = part.value;
        return result;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateDistance(left, right) {
    const leftTime = Date.parse(`${left}T00:00:00Z`);
    const rightTime = Date.parse(`${right}T00:00:00Z`);
    if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return null;
    return Math.round((rightTime - leftTime) / 86400000);
}

function inviteCode() {
    return crypto.randomBytes(6).toString('hex').slice(0, 10).toUpperCase();
}

function normalizeInviteCode(value) {
    const code = String(value || '').trim().toUpperCase();
    if (!/^[A-F0-9]{10}$/.test(code)) throw httpError(400, '邀请码格式无效');
    return code;
}

function ensureProfile(userId) {
    const existing = db.prepare('SELECT * FROM user_growth_profiles WHERE user_id = ?').get(userId);
    if (existing) return existing;

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const result = db.prepare(`
            INSERT OR IGNORE INTO user_growth_profiles (user_id, invite_code)
            SELECT ?, ?
            WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)
        `).run(userId, inviteCode(), userId);
        if (result.changes) return db.prepare('SELECT * FROM user_growth_profiles WHERE user_id = ?').get(userId);
        const concurrent = db.prepare('SELECT * FROM user_growth_profiles WHERE user_id = ?').get(userId);
        if (concurrent) return concurrent;
    }
    throw httpError(404, '用户不存在');
}

function levelForXp(totalXp) {
    const xp = Math.max(0, Number(totalXp) || 0);
    let current = LEVELS[0];
    for (const item of LEVELS) {
        if (xp < item.minXp) break;
        current = item;
    }
    const next = LEVELS.find((item) => item.level === current.level + 1) || null;
    const range = next ? Math.max(1, next.minXp - current.minXp) : 1;
    const progressXp = next ? Math.max(0, xp - current.minXp) : range;
    return {
        level: current.level,
        title: current.title,
        totalXp: xp,
        currentMinXp: current.minXp,
        nextLevel: next,
        progressXp,
        requiredXp: range,
        progressPercent: next ? Math.min(100, Math.round((progressXp / range) * 100)) : 100
    };
}

function safeMetadata(value) {
    const json = JSON.stringify(value && typeof value === 'object' ? value : {});
    return json.length <= 1000 ? json : '{}';
}

function parseMetadata(value) {
    try {
        const parsed = JSON.parse(value || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

function insertEvent({ userId, eventKey, eventDate, xp, sourceId = '', metadata = {} }) {
    const result = db.prepare(`
        INSERT OR IGNORE INTO user_growth_events
            (user_id, event_key, event_date, source_id, xp, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, eventKey, eventDate, sourceId, xp, safeMetadata(metadata));
    if (!result.changes) return { awarded: false, xp: 0, eventKey };
    db.prepare(`
        UPDATE user_growth_profiles
        SET total_xp = total_xp + ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
    `).run(xp, userId);
    return { awarded: true, xp, eventKey };
}

function publicEvent(row) {
    return {
        id: row.id,
        key: row.event_key,
        label: EVENT_LABELS[row.event_key] || '成长记录',
        xp: row.xp,
        date: row.event_date,
        metadata: parseMetadata(row.metadata_json),
        createdAt: row.created_at
    };
}

function buildState(userId, now = new Date()) {
    const profile = ensureProfile(userId);
    const today = hongKongDate(now);
    const todayRows = db.prepare(`
        SELECT event_key, SUM(xp) AS xp
        FROM user_growth_events
        WHERE user_id = ? AND event_date = ?
        GROUP BY event_key
    `).all(userId, today);
    const todayEvents = new Map(todayRows.map((row) => [row.event_key, Number(row.xp) || 0]));
    const referralCounts = db.prepare(`
        SELECT
            SUM(CASE WHEN referral_qualified_at IS NULL THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN referral_qualified_at IS NOT NULL THEN 1 ELSE 0 END) AS qualified
        FROM user_growth_profiles
        WHERE referred_by_user_id = ?
    `).get(userId) || {};
    const recentEvents = db.prepare(`
        SELECT id, event_key, event_date, xp, metadata_json, created_at
        FROM user_growth_events
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 8
    `).all(userId).map(publicEvent);
    const level = levelForXp(profile.total_xp);
    const streakDistance = profile.last_checkin_date ? dateDistance(profile.last_checkin_date, today) : null;
    const activeStreak = streakDistance !== null && streakDistance >= 0 && streakDistance <= 1
        ? Number(profile.current_streak) || 0
        : 0;

    return {
        serverDate: today,
        level,
        streak: {
            current: activeStreak,
            longest: Number(profile.longest_streak) || 0,
            lastCheckinDate: profile.last_checkin_date || ''
        },
        today: {
            earnedXp: todayRows.reduce((sum, row) => sum + (Number(row.xp) || 0), 0),
            completed: todayRows.filter((row) => Object.hasOwn(DAILY_ACTIONS, row.event_key)).length,
            total: Object.keys(DAILY_ACTIONS).length,
            tasks: Object.entries(DAILY_ACTIONS).map(([key, task]) => ({
                key,
                label: task.label,
                xp: task.xp,
                completed: todayEvents.has(key),
                earnedXp: todayEvents.get(key) || 0
            }))
        },
        referral: {
            inviteCode: profile.invite_code,
            claimed: Boolean(profile.referred_by_user_id),
            qualified: Boolean(profile.referral_qualified_at),
            pendingCount: Number(referralCounts.pending) || 0,
            qualifiedCount: Number(referralCounts.qualified) || 0,
            inviterRewardXp: 60,
            inviteeRewardXp: 30,
            weeklyRewardLimit: REFERRAL_WEEKLY_REWARD_LIMIT
        },
        levels: LEVELS.map((item) => ({ ...item, reached: level.level >= item.level })),
        recentEvents
    };
}

function withLevelChange(userId, previousLevel, award, now) {
    const state = buildState(userId, now);
    return {
        award: {
            ...award,
            levelUp: state.level.level > previousLevel.level,
            previousLevel: previousLevel.level,
            currentLevel: state.level.level,
            title: state.level.title
        },
        state
    };
}

const checkInTransaction = db.transaction((userId, now) => {
    const profile = ensureProfile(userId);
    const previousLevel = levelForXp(profile.total_xp);
    const today = hongKongDate(now);
    const existing = db.prepare(`
        SELECT xp FROM user_growth_events
        WHERE user_id = ? AND event_key = 'checkin' AND event_date = ? AND source_id = ''
    `).get(userId, today);
    if (existing) return withLevelChange(userId, previousLevel, { awarded: false, xp: 0, eventKey: 'checkin' }, now);

    const distance = profile.last_checkin_date ? dateDistance(profile.last_checkin_date, today) : null;
    const streak = distance === 1 ? (Number(profile.current_streak) || 0) + 1 : 1;
    const bonusXp = streak % 7 === 0 ? 20 : 0;
    db.prepare(`
        UPDATE user_growth_profiles
        SET current_streak = ?, longest_streak = MAX(longest_streak, ?),
            last_checkin_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
    `).run(streak, streak, today, userId);
    const award = insertEvent({
        userId,
        eventKey: 'checkin',
        eventDate: today,
        xp: DAILY_ACTIONS.checkin.xp + bonusXp,
        metadata: { streak, bonusXp }
    });
    return withLevelChange(userId, previousLevel, { ...award, bonusXp, streak }, now);
});

function checkIn(userId, now = new Date()) {
    return checkInTransaction(userId, now);
}

const shareTransaction = db.transaction((userId, platform, now) => {
    const profile = ensureProfile(userId);
    const previousLevel = levelForXp(profile.total_xp);
    const award = insertEvent({
        userId,
        eventKey: 'daily_share',
        eventDate: hongKongDate(now),
        xp: DAILY_ACTIONS.daily_share.xp,
        metadata: { platform }
    });
    return withLevelChange(userId, previousLevel, award, now);
});

function recordShare(userId, rawPlatform, now = new Date()) {
    const platform = SHARE_PLATFORMS.has(rawPlatform) ? rawPlatform : 'native';
    return shareTransaction(userId, platform, now);
}

function hasCompleteRoomTurn(userId) {
    return Boolean(db.prepare(`
        SELECT turn_id
        FROM room_chat_messages
        WHERE user_id = ? AND role IN ('user', 'assistant')
        GROUP BY turn_id
        HAVING COUNT(DISTINCT role) = 2
        LIMIT 1
    `).get(userId));
}

function qualifyReferral(userId, now) {
    const profile = ensureProfile(userId);
    const inviterId = profile.referred_by_user_id;
    if (!inviterId || profile.referral_qualified_at) return { inviteeXp: 0, inviterXp: 0, qualified: false };

    const today = hongKongDate(now);
    const inviteeAward = insertEvent({
        userId,
        eventKey: 'referral_joined',
        eventDate: today,
        sourceId: inviterId,
        xp: 30,
        metadata: { inviterId }
    });
    ensureProfile(inviterId);
    const recentInviterRewards = db.prepare(`
        SELECT COUNT(*) AS count
        FROM user_growth_events
        WHERE user_id = ? AND event_key = 'referral_invite'
          AND created_at >= datetime('now', '-7 days')
    `).get(inviterId)?.count || 0;
    const inviterAward = recentInviterRewards < REFERRAL_WEEKLY_REWARD_LIMIT
        ? insertEvent({
            userId: inviterId,
            eventKey: 'referral_invite',
            eventDate: today,
            sourceId: userId,
            xp: 60,
            metadata: { invitedUserId: userId }
        })
        : { awarded: false, xp: 0, eventKey: 'referral_invite', capped: true };
    db.prepare(`
        UPDATE user_growth_profiles
        SET referral_qualified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND referral_qualified_at IS NULL
    `).run(userId);
    return {
        inviteeXp: inviteeAward.xp,
        inviterXp: inviterAward.xp,
        qualified: true,
        inviterCapped: Boolean(inviterAward.capped)
    };
}

const roomChatTransaction = db.transaction((userId, now) => {
    const profile = ensureProfile(userId);
    const previousLevel = levelForXp(profile.total_xp);
    const dailyAward = insertEvent({
        userId,
        eventKey: 'daily_chat',
        eventDate: hongKongDate(now),
        xp: DAILY_ACTIONS.daily_chat.xp
    });
    const referral = qualifyReferral(userId, now);
    const award = {
        ...dailyAward,
        xp: dailyAward.xp + referral.inviteeXp,
        referralXp: referral.inviteeXp,
        referralQualified: referral.qualified
    };
    return withLevelChange(userId, previousLevel, award, now);
});

function recordRoomChat(userId, now = new Date()) {
    return roomChatTransaction(userId, now);
}

const claimReferralTransaction = db.transaction((userId, rawCode, now) => {
    const code = normalizeInviteCode(rawCode);
    const profile = ensureProfile(userId);
    const inviter = db.prepare(`
        SELECT user_id FROM user_growth_profiles WHERE invite_code = ?
    `).get(code);
    if (!inviter) throw httpError(404, '邀请码不存在');
    if (inviter.user_id === userId) throw httpError(400, '不能使用自己的邀请码');
    if (profile.referred_by_user_id && profile.referred_by_user_id !== inviter.user_id) {
        throw httpError(409, '当前账号已经绑定过邀请关系');
    }

    const eligible = db.prepare(`
        SELECT 1 FROM users
        WHERE id = ? AND created_at >= datetime('now', ?)
    `).get(userId, `-${REFERRAL_ACCOUNT_MAX_AGE_DAYS} days`);
    if (!eligible) throw httpError(409, '邀请码仅限注册七天内的账号使用');

    if (!profile.referred_by_user_id) {
        db.prepare(`
            UPDATE user_growth_profiles
            SET referred_by_user_id = ?, referral_claimed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND referred_by_user_id IS NULL
        `).run(inviter.user_id, userId);
    }
    const qualification = hasCompleteRoomTurn(userId) ? qualifyReferral(userId, now) : null;
    return {
        claimed: true,
        qualified: Boolean(qualification?.qualified || profile.referral_qualified_at),
        state: buildState(userId, now)
    };
});

function claimReferral(userId, code, now = new Date()) {
    return claimReferralTransaction(userId, code, now);
}

function getState(userId, now = new Date()) {
    return buildState(userId, now);
}

function getPublicLevels(userIds = []) {
    const ids = [...new Set((Array.isArray(userIds) ? userIds : [])
        .map((value) => String(value || '').trim())
        .filter((value) => /^[A-Za-z0-9_-]{1,64}$/.test(value)))]
        .slice(0, 60);
    if (!ids.length) return [];

    const placeholders = ids.map(() => '?').join(', ');
    return db.prepare(`
        SELECT users.id AS user_id, COALESCE(user_growth_profiles.total_xp, 0) AS total_xp
        FROM users
        LEFT JOIN user_growth_profiles ON user_growth_profiles.user_id = users.id
        WHERE users.id IN (${placeholders})
    `).all(...ids).map((row) => {
        const level = levelForXp(row.total_xp);
        return {
            userId: row.user_id,
            level: level.level,
            title: level.title
        };
    });
}

module.exports = {
    DAILY_ACTIONS,
    LEVELS,
    checkIn,
    claimReferral,
    getPublicLevels,
    getState,
    hongKongDate,
    levelForXp,
    recordRoomChat,
    recordShare
};
