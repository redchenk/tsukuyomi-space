const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { safeJsonForHtml, sanitizeRenderedHtml } = require('../backend/services/html-sanitizer');

describe('server-side HTML sanitizer', () => {
    it('removes executable markup and encoded URL handlers', () => {
        const attacks = [
            '<script>alert(1)</script><p>safe</p>',
            '<img src="x" onerror="alert(1)">',
            '<svg><a xlink:href="javascript:alert(1)">x</a></svg>',
            '<xmp><img src=x onerror=alert(1)></xmp>',
            '<a href="javascript:alert(1)">click</a>',
            '<iframe srcdoc="<script>alert(1)</script>"></iframe>'
        ];

        for (const attack of attacks) {
            const clean = sanitizeRenderedHtml(attack);
            assert.doesNotMatch(clean, /<script|onerror|javascript:|srcdoc|<svg|<xmp/i);
        }
    });

    it('keeps safe article formatting and enforces iframe sandboxing', () => {
        const clean = sanitizeRenderedHtml(`
            <h2>Title</h2>
            <p><strong>Body</strong> <a href="https://example.com">link</a></p>
            <iframe src="https://player.bilibili.com/player.html?bvid=BV1" allow-same-origin></iframe>
        `);

        assert.match(clean, /<h2>Title<\/h2>/);
        assert.match(clean, /rel="noopener noreferrer"/);
        assert.match(clean, /sandbox="[^"]*allow-scripts/);
        assert.doesNotMatch(clean, /allow-same-origin="/);
    });

    it('cannot close an SSR JSON-LD script element', () => {
        const serialized = safeJsonForHtml({ title: '</script><script>alert(1)</script>' });
        assert.doesNotMatch(serialized, /<\/script|<script/i);
        assert.match(serialized, /\\u003c\/script\\u003e/);
        assert.deepEqual(JSON.parse(serialized), { title: '</script><script>alert(1)</script>' });
    });
});
