const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsukuyomi-growth-test-'));

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = dataDir;
process.env.DB_PATH = path.join(dataDir, 'growth.db');
process.env.JWT_SECRET = 'growth-test-jwt-secret-with-more-than-32-characters';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_EMAIL = 'admin@growth.test';
process.env.ADMIN_PASSWORD = 'admin-growth-test-password';

const db = require('../backend/db');
const { initDatabase } = require('../backend/db/migrations/init');
const growth = require('../backend/services/user-growth');

function addUser(id) {
    db.prepare(`
        INSERT INTO users (id, username, email, password_hash, role)
        VALUES (?, ?, ?, 'test-password-hash', 'user')
    `).run(id, id, `${id}@example.test`);
}

before(() => {
    initDatabase();
    [
        'daily-user',
        'isolated-user',
        'rotation-user',
        'inviter-user',
        'invitee-user',
        'bulk-inviter',
        'backfill-inviter',
        'backfill-invitee',
        ...Array.from({ length: 12 }, (_, index) => `bulk-invitee-${index + 1}`)
    ].forEach(addUser);
});

after(() => {
    db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('user growth service', () => {
    it('reserves the Yachiyo covenant level for exactly 8000 XP', () => {
        const before = growth.levelForXp(7999);
        const reached = growth.levelForXp(8000);

        assert.equal(before.level, 8);
        assert.equal(before.nextLevel.level, 9);
        assert.equal(before.nextLevel.minXp, 8000);
        assert.equal(reached.level, 9);
        assert.equal(reached.title, '八千代之约');
        assert.equal(reached.nextLevel, null);
        assert.equal(reached.progressPercent, 100);
    });

    it('awards each daily action once and keeps users isolated', () => {
        const now = new Date('2026-07-22T04:00:00.000Z');
        const firstCheckin = growth.checkIn('daily-user', now);
        const secondCheckin = growth.checkIn('daily-user', now);
        const firstChat = growth.recordRoomChat('daily-user', now);
        const secondChat = growth.recordRoomChat('daily-user', now);
        const firstShare = growth.recordShare('daily-user', 'qq', now);
        const secondShare = growth.recordShare('daily-user', 'weibo', now);
        const rotatingTask = growth.getState('daily-user', now).today.tasks.find((task) => task.type === 'rotating');
        const activityByTask = {
            daily_article_publish: 'article_publish',
            daily_plaza_engage: 'plaza_like',
            daily_pixel_engage: 'pixel_publish',
            daily_gallery_upload: 'gallery_upload',
            daily_kaguya_run: 'kaguya_score'
        };
        const firstRotating = growth.recordDailyActivity('daily-user', activityByTask[rotatingTask.key], 'source-1', now);
        const secondRotating = growth.recordDailyActivity('daily-user', activityByTask[rotatingTask.key], 'source-2', now);

        assert.equal(firstCheckin.award.xp, 10);
        assert.equal(secondCheckin.award.xp, 0);
        assert.equal(firstChat.award.xp, 0);
        assert.equal(firstChat.award.roomFirstTurn, true);
        assert.equal(secondChat.award.xp, 0);
        assert.equal(secondChat.award.roomFirstTurn, false);
        assert.equal(firstShare.award.xp, 15);
        assert.equal(secondShare.award.xp, 0);
        assert.equal(firstRotating.award.xp, 20);
        assert.equal(secondRotating.award.xp, 0);
        assert.equal(growth.getState('daily-user', now).level.totalXp, 45);
        assert.equal(growth.getState('daily-user', now).today.completed, 3);
        assert.equal(growth.getState('daily-user', now).today.roomChatCompleted, true);
        assert.equal(growth.getState('isolated-user', now).level.totalXp, 0);
    });

    it('keeps the rotating task stable for the day and cycles all task types across five days', () => {
        const taskKeys = [];
        for (let day = 20; day <= 24; day += 1) {
            const now = new Date(`2026-07-${day}T04:00:00.000Z`);
            const first = growth.getState('rotation-user', now).today.tasks;
            const second = growth.getState('rotation-user', now).today.tasks;
            assert.deepEqual(first.slice(0, 2).map((task) => task.key), ['checkin', 'daily_share']);
            assert.equal(first[2].type, 'rotating');
            assert.equal(first[2].key, second[2].key);
            taskKeys.push(first[2].key);
        }
        assert.equal(new Set(taskKeys).size, growth.RANDOM_DAILY_TASKS.length);

        const now = new Date('2026-07-20T04:00:00.000Z');
        const assigned = growth.getState('rotation-user', now).today.tasks[2];
        const wrongActivity = growth.RANDOM_DAILY_TASKS
            .find((task) => task.key !== assigned.key).activities[0];
        assert.equal(growth.recordDailyActivity('rotation-user', wrongActivity, 'not-assigned', now), null);
        assert.equal(growth.getState('rotation-user', now).level.totalXp, 0);
    });

    it('adds the seven-day streak bonus without trusting the client clock', () => {
        let lastResult;
        for (let day = 1; day <= 7; day += 1) {
            lastResult = growth.checkIn('isolated-user', new Date(`2026-07-${String(day).padStart(2, '0')}T04:00:00.000Z`));
        }
        assert.equal(lastResult.award.streak, 7);
        assert.equal(lastResult.award.bonusXp, 20);
        assert.equal(lastResult.award.xp, 30);
        assert.equal(lastResult.state.streak.current, 7);
        assert.equal(lastResult.state.level.totalXp, 90);
        const afterBreak = growth.getState('isolated-user', new Date('2026-07-10T04:00:00.000Z'));
        assert.equal(afterBreak.streak.current, 0);
        assert.equal(afterBreak.streak.longest, 7);
    });

    it('qualifies referrals only after the invitee completes a room turn', () => {
        const inviterState = growth.getState('inviter-user');
        assert.match(inviterState.referral.inviteCode, /^[A-F0-9]{10}$/);

        const claim = growth.claimReferral('invitee-user', inviterState.referral.inviteCode);
        assert.equal(claim.claimed, true);
        assert.equal(claim.qualified, false);
        assert.equal(growth.getState('inviter-user').level.totalXp, 0);

        const chat = growth.recordRoomChat('invitee-user');
        assert.equal(chat.award.referralQualified, true);
        assert.equal(chat.award.referralXp, 30);
        assert.equal(growth.getState('invitee-user').level.totalXp, 30);
        assert.equal(growth.getState('inviter-user').level.totalXp, 60);
        assert.equal(growth.getState('inviter-user').referral.qualifiedCount, 1);

        growth.recordRoomChat('invitee-user');
        assert.equal(growth.getState('invitee-user').level.totalXp, 30);
        assert.equal(growth.getState('inviter-user').level.totalXp, 60);
    });

    it('awards every qualified referral instead of silently dropping rewards after ten', () => {
        const now = new Date('2026-07-22T04:00:00.000Z');
        const inviterState = growth.getState('bulk-inviter', now);

        for (let index = 1; index <= 12; index += 1) {
            const inviteeId = `bulk-invitee-${index}`;
            growth.claimReferral(inviteeId, inviterState.referral.inviteCode, now);
            growth.recordRoomChat(inviteeId, now);
        }

        const state = growth.getState('bulk-inviter', now);
        assert.equal(state.referral.qualifiedCount, 12);
        assert.equal(state.referral.rewardedCount, 12);
        assert.equal(state.referral.rewardedXp, 720);
        assert.equal(state.level.totalXp, 12 * state.referral.inviterRewardXp);
    });

    it('backfills previously qualified referrals exactly once', () => {
        const inviter = growth.getState('backfill-inviter');
        growth.getState('backfill-invitee');
        db.prepare(`
            UPDATE user_growth_profiles
            SET referred_by_user_id = ?, referral_claimed_at = CURRENT_TIMESTAMP,
                referral_qualified_at = CURRENT_TIMESTAMP
            WHERE user_id = 'backfill-invitee'
        `).run('backfill-inviter');

        const migration = require('../backend/db/migrations/028_backfill_referral_rewards');
        migration.up(db);
        migration.up(db);

        const reward = db.prepare(`
            SELECT xp FROM user_growth_events
            WHERE user_id = 'backfill-inviter'
              AND event_key = 'referral_invite'
              AND source_id = 'backfill-invitee'
        `).get();
        const state = growth.getState('backfill-inviter');
        assert.equal(reward.xp, 60);
        assert.equal(state.level.totalXp, 60);
        assert.equal(state.referral.qualifiedCount, 1);
        assert.equal(state.referral.rewardedCount, 1);
        assert.equal(state.referral.rewardedXp, 60);
        assert.match(inviter.referral.inviteCode, /^[A-F0-9]{10}$/);
    });

    it('rejects self-referrals and malformed invite codes', () => {
        const code = growth.getState('inviter-user').referral.inviteCode;
        assert.throws(() => growth.claimReferral('inviter-user', code), /自己的邀请码/);
        assert.throws(() => growth.claimReferral('daily-user', 'DROP TABLE'), /格式无效/);
    });
});
