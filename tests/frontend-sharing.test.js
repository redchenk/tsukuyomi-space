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

function loadQQShare(overrides = {}) {
    const context = {
        URL, URLSearchParams, String, TextEncoder, normalizedSharePayload: loadShareLinks().normalizedSharePayload,
        qqSdkUrl: '/assets/qqapi-test.js',
        btoa: value => Buffer.from(value, 'binary').toString('base64'),
        ...overrides
    };
    const code = source('src/frontend/services/qqShare.js')
        .replace(/^import .*;$/gm, '')
        .replace(/export function /g, 'function ')
        .concat('\nglobalThis.__sharing = { qqShareEnvironment, qqSharePayload, buildQQAppLink, buildQQBridgePayload, buildQQSystemPayload, qqShareResult, loadQQShareSdk, launchQQApp };\n');
    vm.runInNewContext(code, context, { filename: 'src/frontend/services/qqShare.js' });
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
        assert.match(actions, /!qqEnvironment\.mobile.*openComposer\('qq', links\.value\.qq\)/);
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

describe('mobile QQ article cards', () => {
    const payload = {
        title: '八千代的新手教程 🌙', text: '点击文章，一步步完成设置。',
        url: 'https://yachiyo.hk/articles/282/' + encodeURIComponent('八千代语音合成一键包新手教程') + '?from=%2Fstage#comments',
        imageUrl: 'https://yachiyo.hk/api/uploads/article-cover.png'
    };

    it('detects Android, iPhone and desktop-mode iPad while keeping QQ Browser separate from QQ', () => {
        const { qqShareEnvironment } = loadQQShare();
        for (const ua of ['Mozilla/5.0 Android 15 Chrome/140 Mobile', 'Mozilla/5.0 iPhone OS 18 Safari/605']) {
            assert.equal(qqShareEnvironment({ userAgent: ua }).mobile, true);
            assert.equal(qqShareEnvironment({ userAgent: ua + ' QQ/9.2.1' }).insideQQ, true);
        }
        assert.equal(qqShareEnvironment({ userAgent: 'Android MQQBrowser/15.0' }).insideQQ, false);
        assert.equal(qqShareEnvironment({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 }).mobile, true);
        assert.equal(qqShareEnvironment({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 }).ios, true);
        assert.equal(qqShareEnvironment({ userAgent: 'iPhone OS 18 Safari/605' }).ios, true);
        assert.equal(qqShareEnvironment({ userAgent: 'Android 15 Chrome/140' }).ios, false);
        assert.equal(qqShareEnvironment({ userAgent: 'Macintosh Chrome/140' }).mobile, false);
    });

    it('uses UTF-8 card fields and the short URL in the mobile QQ app link', () => {
        const { buildQQAppLink } = loadQQShare();
        const link = new URL(buildQQAppLink(payload));
        const decode = key => Buffer.from(link.searchParams.get(key), 'base64').toString('utf8');
        assert.equal(link.protocol + '//' + link.host + link.pathname, 'mqqapi://share/to_fri');
        assert.equal(decode('url'), 'https://yachiyo.hk/articles/282');
        assert.ok(Buffer.byteLength(decode('url')) < 120);
        assert.equal(decode('title'), payload.title);
        assert.equal(decode('description'), payload.text);
        assert.equal(decode('image_url'), payload.imageUrl);
        assert.equal(decode('previewimageUrl'), payload.imageUrl);
        assert.equal(decode('thirdAppDisplayName'), '月读空间');
        assert.equal(link.searchParams.get('share_id'), '1904951941');
        assert.equal(link.searchParams.get('req_type'), '1');
        assert.equal(link.searchParams.get('file_type'), 'news');
        for (const key of ['generalpastboard', 'objectlocation', 'callback_type', 'callback_name']) assert.equal(link.searchParams.has(key), false);
    });

    it('shortens legacy article links and supplies a real thumbnail without dropping other shared scene identities', () => {
        const { qqSharePayload, buildQQAppLink } = loadQQShare();
        const share = qqSharePayload({ url: 'https://tsukuyomi-space.com/article?id=282&from=stage' });
        assert.equal(share.url, 'https://tsukuyomi-space.com/articles/282');
        assert.equal(share.imageUrl, 'https://tsukuyomi-space.com/assets/icons/icon-512.png');
        assert.equal(qqSharePayload({ url: 'https://yachiyo.hk/pixel?art=42' }).url, 'https://yachiyo.hk/pixel?art=42');
        assert.equal(buildQQAppLink({ url: 'javascript:alert(1)' }), '');
    });

    it('sends a news card to the QQ friend picker, without specifying a recipient', () => {
        const { buildQQBridgePayload } = loadQQShare();
        assert.deepEqual(JSON.parse(JSON.stringify(buildQQBridgePayload(payload))), {
            title: payload.title, desc: payload.text, share_url: 'https://yachiyo.hk/articles/282',
            image_url: payload.imageUrl, share_type: 0, shareElement: 'news', appid: '1904951941', back: true
        });
    });

    it('gives the iOS QQ extension the article title as its text item with a short URL', () => {
        const { buildQQSystemPayload } = loadQQShare();
        assert.deepEqual(JSON.parse(JSON.stringify(buildQQSystemPayload(payload))), {
            title: payload.title, text: payload.title, url: 'https://yachiyo.hk/articles/282'
        });
    });

    it('accepts explicit SDK confirmation only and distinguishes cancellation from unknown results', () => {
        const { qqShareResult } = loadQQShare();
        for (const result of [{ retCode: 0 }, { ret: 0 }, { retCode: '0' }]) assert.equal(qqShareResult(result), 'confirmed');
        for (const result of [{ retCode: 1 }, { ret: '1' }]) assert.equal(qqShareResult(result), 'cancelled');
        for (const result of [null, {}, { retCode: -1 }, { success: true }, { retCode: 2, ret: 0 }]) assert.equal(qqShareResult(result), 'failed');
    });

    it('does not split emoji when limiting a QQ card description', () => {
        const share = loadQQShare().qqSharePayload({ ...payload, text: '🌙'.repeat(100) });
        assert.equal(share.text, '🌙'.repeat(50));
    });

    it('hands the URL directly to the app and treats remaining visible as unavailable, never as success', () => {
        const events = new Map();
        const calls = [];
        let timer;
        const window = {
            location: { assign: value => calls.push(value) },
            setTimeout: callback => { timer = callback; return 1; }, clearTimeout: () => {},
            addEventListener: (name, cb) => events.set(name, cb), removeEventListener: name => events.delete(name)
        };
        const document = {
            visibilityState: 'visible', addEventListener: window.addEventListener, removeEventListener: window.removeEventListener
        };
        const { launchQQApp } = loadQQShare({ window, document });
        let unavailable = 0;
        launchQQApp('mqqapi://share/to_fri?url=test', () => unavailable++);
        assert.deepEqual(calls, ['mqqapi://share/to_fri?url=test']);
        timer();
        assert.equal(unavailable, 1);
        assert.equal(events.size, 0);
        document.visibilityState = 'visible';
        launchQQApp('mqqapi://share/to_fri?url=test', () => unavailable++);
        document.visibilityState = 'hidden';
        events.get('visibilitychange')();
        document.visibilityState = 'visible';
        timer();
        assert.equal(unavailable, 1, 'Returning from QQ must not display a launch failure');
        assert.equal(events.size, 0);
    });

    it('loads the official SDK from the same origin once and keeps the existing CSP', async () => {
        const scripts = [];
        const window = { setTimeout: () => 1, clearTimeout: () => {} };
        const document = { createElement: () => ({}), head: { appendChild: script => scripts.push(script) } };
        const { loadQQShareSdk } = loadQQShare({ window, document });
        const first = loadQQShareSdk();
        const second = loadQQShareSdk();
        assert.equal(first, second);
        assert.equal(scripts.length, 1);
        assert.equal(scripts[0].src, '/assets/qqapi-test.js');
        window.mqq = { ui: { shareMessage() {} } };
        scripts[0].onload();
        assert.equal(await first, window.mqq);
        assert.equal(await loadQQShareSdk(), window.mqq);
        assert.match(source('src/frontend/index.html'), /script-src 'self';/);
        assert.match(source('src/frontend/vendor/qq/qqapi.js'), /mqq\.ui\.shareMessage/);
    });
});
