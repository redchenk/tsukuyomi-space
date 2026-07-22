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
        assert.match(page, /state\.referral\.inviteCode/);
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
        assert.match(roomPanel, /task\.key === 'daily_chat'/);
        assert.match(roomPanel, /!chatTask\.completed/);
        assert.match(roomPanel, /emit\('growth'\)/);
    });
});
