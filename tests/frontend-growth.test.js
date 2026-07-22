const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function source(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('growth frontend integration', () => {
    it('provides a responsive authenticated growth route with accessible loading state', () => {
        const router = source('src/frontend/router/index.js');
        const page = source('src/frontend/pages/GrowthPage.vue');
        const styles = source('src/frontend/styles/routes/growth.css');

        assert.match(router, /path:\s*'\/growth'/);
        assert.match(page, /:aria-busy="page\.loading"/);
        assert.match(page, /state\.today\.tasks/);
        assert.match(page, /task\.type === 'rotating'/);
        assert.match(page, /task\.path \|\| '\/hub'/);
        assert.match(page, /streakReward/);
        assert.match(page, /state\.referral\.inviteCode/);
        assert.match(page, /state\.referral\.rewardedCount/);
        assert.match(page, /state\.referral\.rewardedXp/);
        assert.match(page, /八千代之约/);
        assert.match(page, /Yachiyo's Covenant/);
        assert.match(styles, /@media \(max-width: 760px\)/);
        assert.match(styles, /grid-template-columns:\s*1fr/);
    });

    it('records real share actions and connects room state to Yachiyo context', () => {
        const share = source('src/frontend/components/SocialShareActions.vue');
        const roomChat = source('src/frontend/composables/room/useRoomChat.js');
        const roomPanel = source('src/frontend/components/room/RoomChatPanel.vue');

        assert.match(share, /recordShareGrowth\(platform\)/);
        assert.match(share, /recordShareGrowth\('native'\)/);
        assert.match(roomChat, /growthContext\(growthState\)/);
        assert.match(roomChat, /GROWTH_UPDATED_EVENT/);
        assert.match(roomPanel, /room-growth-strip/);
        assert.match(roomPanel, /!growth\.today\?\.roomChatCompleted/);
        assert.match(roomPanel, /emit\('growth'\)/);
    });

    it('awards rotating tasks only from successful server-side content actions', () => {
        const growthService = source('backend/services/user-growth.js');
        const articles = source('backend/routes/articles.js');
        const messages = source('backend/routes/messages.js');
        const pixel = source('backend/routes/pixel-art.js');
        const assets = source('backend/routes/assets.js');

        assert.match(growthService, /function recordDailyActivity/);
        assert.match(growthService, /rotatingDailyTask\(userId, today\)/);
        assert.match(articles, /recordDailyActivity\(userId, 'article_publish'/);
        assert.match(messages, /recordDailyActivity\(userId, activityKey/);
        assert.match(messages, /review\.status === 'approved' && !article_id/);
        assert.match(pixel, /recordPixelGrowth\(req\.user\.id, 'pixel_publish'/);
        assert.match(pixel, /recordPixelGrowth\(req\.user\.id, 'pixel_like'/);
        assert.match(assets, /targetCollection === 'gallery' \? recordGalleryGrowth/);
    });
});
