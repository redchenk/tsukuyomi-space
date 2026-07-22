const REFERRAL_INVITER_XP = 60;

module.exports = {
    version: '028',
    name: 'backfill_referral_rewards',
    up(db) {
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_user_growth_events_referral_source
            ON user_growth_events(user_id, event_key, source_id)
        `);
        const missingRewards = db.prepare(`
            SELECT
                invitee.user_id AS invitee_user_id,
                invitee.referred_by_user_id AS inviter_user_id,
                COALESCE(
                    strftime('%Y-%m-%d', invitee.referral_qualified_at, '+8 hours'),
                    strftime('%Y-%m-%d', 'now', '+8 hours')
                ) AS event_date
            FROM user_growth_profiles invitee
            LEFT JOIN user_growth_events reward
              ON reward.user_id = invitee.referred_by_user_id
             AND reward.event_key = 'referral_invite'
             AND reward.source_id = invitee.user_id
            WHERE invitee.referral_qualified_at IS NOT NULL
              AND invitee.referred_by_user_id IS NOT NULL
              AND reward.id IS NULL
        `).all();
        const insertReward = db.prepare(`
            INSERT OR IGNORE INTO user_growth_events
                (user_id, event_key, event_date, source_id, xp, metadata_json)
            VALUES (?, 'referral_invite', ?, ?, ?, ?)
        `);
        const addXp = db.prepare(`
            UPDATE user_growth_profiles
            SET total_xp = total_xp + ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        `);

        for (const reward of missingRewards) {
            const inserted = insertReward.run(
                reward.inviter_user_id,
                reward.event_date,
                reward.invitee_user_id,
                REFERRAL_INVITER_XP,
                JSON.stringify({ invitedUserId: reward.invitee_user_id, backfilled: true })
            );
            if (inserted.changes) addXp.run(REFERRAL_INVITER_XP, reward.inviter_user_id);
        }
    }
};
