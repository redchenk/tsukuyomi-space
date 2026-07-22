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
    ['daily-user', 'isolated-user', 'inviter-user', 'invitee-user'].forEach(addUser);
});

after(() => {
    db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('user growth service', () => {
    it('awards each daily action once and keeps users isolated', () => {
        const now = new Date('2026-07-22T04:00:00.000Z');
        const firstCheckin = growth.checkIn('daily-user', now);
        const secondCheckin = growth.checkIn('daily-user', now);
        const firstChat = growth.recordRoomChat('daily-user', now);
        const secondChat = growth.recordRoomChat('daily-user', now);
        const firstShare = growth.recordShare('daily-user', 'qq', now);
        const secondShare = growth.recordShare('daily-user', 'weibo', now);

        assert.equal(firstCheckin.award.xp, 10);
        assert.equal(secondCheckin.award.xp, 0);
        assert.equal(firstChat.award.xp, 20);
        assert.equal(secondChat.award.xp, 0);
        assert.equal(firstShare.award.xp, 15);
        assert.equal(secondShare.award.xp, 0);
        assert.equal(growth.getState('daily-user', now).level.totalXp, 45);
        assert.equal(growth.getState('daily-user', now).today.completed, 3);
        assert.equal(growth.getState('isolated-user', now).level.totalXp, 0);
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
        assert.equal(growth.getState('invitee-user').level.totalXp, 50);
        assert.equal(growth.getState('inviter-user').level.totalXp, 60);
        assert.equal(growth.getState('inviter-user').referral.qualifiedCount, 1);

        growth.recordRoomChat('invitee-user');
        assert.equal(growth.getState('invitee-user').level.totalXp, 50);
        assert.equal(growth.getState('inviter-user').level.totalXp, 60);
    });

    it('rejects self-referrals and malformed invite codes', () => {
        const code = growth.getState('inviter-user').referral.inviteCode;
        assert.throws(() => growth.claimReferral('inviter-user', code), /自己的邀请码/);
        assert.throws(() => growth.claimReferral('daily-user', 'DROP TABLE'), /格式无效/);
    });
});
