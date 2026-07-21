const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
    MAX_AVATAR_BYTES,
    discoverFriendLinkAvatar,
    extractIconCandidates,
    prepareFriendLinkAvatar,
    readBodyLimited
} = require('../backend/services/friend-link-avatar');

describe('friend link avatar discovery', () => {
    it('prefers high-resolution touch icons and resolves relative URLs', () => {
        const candidates = extractIconCandidates(`
            <html><head>
                <link rel="icon" sizes="32x32" href="/favicon-32.png">
                <link href="assets/touch.png" sizes="180x180" rel="apple-touch-icon">
            </head></html>
        `, 'https://example.com/blog/');

        assert.deepEqual(candidates, [
            'https://example.com/blog/assets/touch.png',
            'https://example.com/favicon-32.png'
        ]);
    });

    it('discovers and validates an HTTPS image without real network access', async () => {
        const calls = [];
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const fetchUrl = async (url) => {
            calls.push(url);
            if (url === 'https://example.com/') {
                return new Response('<link rel="apple-touch-icon" href="/touch.png">', {
                    status: 200,
                    headers: { 'Content-Type': 'text/html; charset=utf-8' }
                });
            }
            if (url === 'https://example.com/touch.png') {
                return new Response(png, {
                    status: 200,
                    headers: { 'Content-Type': 'image/png', 'Content-Length': String(png.length) }
                });
            }
            return new Response('', { status: 404 });
        };

        const avatarUrl = await discoverFriendLinkAvatar('https://example.com/', { fetchUrl });
        assert.equal(avatarUrl, 'https://example.com/touch.png');
        assert.deepEqual(calls, ['https://example.com/', 'https://example.com/touch.png']);
    });

    it('rejects oversized remote bodies before buffering them', async () => {
        const response = new Response(Buffer.alloc(1), {
            headers: { 'Content-Length': String(MAX_AVATAR_BYTES + 1) }
        });
        await assert.rejects(() => readBodyLimited(response, MAX_AVATAR_BYTES), /远程内容过大/);
    });

    it('rejects insecure and private explicit avatar URLs', async () => {
        await assert.rejects(
            () => prepareFriendLinkAvatar({ avatarUrl: 'http://example.com/avatar.png' }),
            /HTTPS/
        );
        await assert.rejects(
            () => prepareFriendLinkAvatar({ avatarUrl: 'https://127.0.0.1/avatar.png' }),
            /内网|保留地址/
        );
    });
});
