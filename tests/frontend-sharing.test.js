const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');

function source(relativePath) {
    return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function loadShareLinks() {
    const context = {
        URL,
        URLSearchParams,
        String,
        TextEncoder,
        btoa: value => Buffer.from(value, 'binary').toString('base64')
    };
    const code = source('src/frontend/services/socialShare.js')
        .replace(/export function /g, 'function ')
        .concat('\nglobalThis.__sharing = { buildSocialShareLinks, normalizedSharePayload };\n');
    vm.runInNewContext(code, context, { filename: 'src/frontend/services/socialShare.js' });
    return context.__sharing;
}

describe('public sharing UI', () => {
    it('builds real social-media composer links with encoded content', () => {
        const { buildSocialShareLinks } = loadShareLinks();
        const links = buildSocialShareLinks({
            title: '月下对话 & pixel',
            text: '八千代说：晚安',
            url: 'https://yachiyo.hk/pixel?art=42',
            imageUrl: 'https://yachiyo.hk/api/pixel-art/42/image.png'
        });

        assert.match(links.qq, /^https:\/\/connect\.qq\.com\/widget\/shareqq\/index\.html\?/);
        const qq = new URL(links.qq);
        assert.equal(qq.searchParams.get('url'), 'https://yachiyo.hk/pixel?art=42');
        assert.equal(qq.searchParams.get('title'), '月下对话 & pixel');
        assert.equal(qq.searchParams.get('summary'), '八千代说：晚安');
        assert.equal(qq.searchParams.get('pics'), 'https://yachiyo.hk/api/pixel-art/42/image.png');
        assert.match(links.qzone, /^https:\/\/sns\.qzone\.qq\.com\/cgi-bin\/qzshare\/cgi_qzshare_onekey\?/);
        assert.match(links.weibo, /^https:\/\/service\.weibo\.com\/share\/share\.php\?/);
        assert.match(links.x, /^https:\/\/twitter\.com\/intent\/tweet\?/);
        assert.match(links.telegram, /^https:\/\/t\.me\/share\/url\?/);
        assert.doesNotMatch(links.qq, /mqqapi|share_id|callback_type/i);
    });

    it('wires sharing into every article and pixel artwork', () => {
        const article = source('src/frontend/pages/ArticlePage.vue');
        const pixel = source('src/frontend/pages/ArenaPage.vue');
        const dialog = source('src/frontend/components/SocialShareDialog.vue');
        const actions = source('src/frontend/components/SocialShareActions.vue');

        assert.match(article, /openArticleShare/);
        assert.match(article, /SocialShareDialog/);
        assert.match(pixel, /openArtworkShare/);
        assert.match(pixel, /\/api\/pixel-art\/\$\{.*?\}\/image\.png/s);
        assert.match(pixel, /\?art=\$\{/);
        assert.match(actions, /navigator\.share/);
        assert.match(actions, /shareToQQ/);
        assert.match(actions, /openComposer\('qq', links\.value\.qq\)/);
        for (const platform of ['QQ', 'QQ 空间', '微博', 'X', 'Telegram']) {
            assert.match(actions, new RegExp(platform));
        }
    });

    it('keeps Room shares scoped to a selected turn and opens the shared scene route', () => {
        const router = source('src/frontend/router/index.js');
        const chat = source('src/frontend/composables/room/useRoomChat.js');
        const panel = source('src/frontend/components/room/RoomChatPanel.vue');
        const page = source('src/frontend/pages/RoomPage.vue');

        assert.match(router, /\/room\/shared\/:shareId/);
        assert.match(chat, /getShareTurn/);
        assert.match(chat, /showSharedConversation/);
        assert.match(panel, /emit\('share'/);
        assert.match(page, /RoomShareDialog/);
        assert.match(page, /\/api\/room\/shares\//);
    });
});
