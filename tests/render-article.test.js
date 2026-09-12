const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { renderArticleHtml } = require('../backend/seo/render-article');

function articleWith(content) {
    return { id: 'test-1', title: 'Test Article', content, content_format: 'markdown' };
}

// Extract the article body section from the full SSR page.
function bodySection(html) {
    const match = html.match(/<section class="article-body">([\s\S]*?)<\/section>/i);
    return match ? match[1] : html;
}

// Check that no injected (executable) script tag appears anywhere in the document.
// The page legitimately contains <script type="application/ld+json">, so we exclude that.
function assertNoExecutableScript(html) {
    assert.doesNotMatch(html, /<script(?!\s+type=)/i);
}

// Check that no iframe element with an active non-HTTPS src was rendered.
// A rejected src causes renderIframeEmbed to return '', so no figure wrapper appears.
function assertNoEmbeddedIframe(html) {
    assert.doesNotMatch(bodySection(html), /<figure class="markdown-iframe">/i);
}

describe('renderArticleHtml iframe XSS regression', () => {
    describe('data:text/html and javascript: sources are rejected', () => {
        it('rejects data:text/html source via ::iframe directive', () => {
            const html = renderArticleHtml(articleWith(
                '::iframe[t](data:text/html,<script>alert(1)</script>)'
            ));
            assertNoEmbeddedIframe(html);
            assertNoExecutableScript(html);
        });

        it('rejects javascript: source via ::iframe directive', () => {
            const html = renderArticleHtml(articleWith(
                '::iframe[t](javascript:alert(1))'
            ));
            assertNoEmbeddedIframe(html);
            assert.doesNotMatch(bodySection(html), /javascript:/i);
        });

        it('rejects data:text/html source via raw <iframe> tag', () => {
            const html = renderArticleHtml(articleWith(
                '<iframe src="data:text/html,<script>alert(1)</script>"></iframe>'
            ));
            assertNoEmbeddedIframe(html);
            assertNoExecutableScript(html);
        });

        it('rejects javascript: source via raw <iframe> tag', () => {
            const html = renderArticleHtml(articleWith(
                '<iframe src="javascript:alert(1)"></iframe>'
            ));
            // iframe should either be absent or have no active javascript: src attribute
            assert.doesNotMatch(html, /<iframe[^>]+src="javascript:/i);
        });
    });

    describe('quote-breaking payloads in title and aria-label are escaped', () => {
        it('escapes "><script> injected via ::iframe alt text', () => {
            const html = renderArticleHtml(articleWith(
                '::iframe["><script>alert(1)</script>"](https://example.com)'
            ));
            assertNoExecutableScript(html);
        });

        it('escapes "><script> injected via raw iframe title attribute', () => {
            const html = renderArticleHtml(articleWith(
                '<iframe src="https://example.com" title=\'"><script>alert(1)</script>\'></iframe>'
            ));
            assertNoExecutableScript(html);
        });

        it('escapes "><script> injected via raw iframe aria-label attribute', () => {
            const html = renderArticleHtml(articleWith(
                '<iframe src="https://example.com" aria-label=\'"><script>alert(1)</script>\'></iframe>'
            ));
            assertNoExecutableScript(html);
        });
    });

    describe('height attribute is sanitized', () => {
        it('ignores non-numeric height and defaults to 420', () => {
            const html = renderArticleHtml(articleWith(
                '<iframe src="https://example.com" height="abc onload=alert(1)"></iframe>'
            ));
            // onload must not appear as an active attribute in the rendered iframe
            assert.doesNotMatch(bodySection(html), /\bonload\b/i);
            assert.match(bodySection(html), /height="420"/);
        });

        it('clamps oversized height to 900', () => {
            const html = renderArticleHtml(articleWith(
                '<iframe src="https://example.com" height="99999"></iframe>'
            ));
            assert.match(bodySection(html), /height="900"/);
        });

        it('clamps undersized height to 220', () => {
            const html = renderArticleHtml(articleWith(
                '<iframe src="https://example.com" height="-1"></iframe>'
            ));
            assert.match(bodySection(html), /height="220"/);
        });
    });

    describe('valid HTTPS iframe renders correctly (positive control)', () => {
        it('renders a valid HTTPS iframe with sandbox attribute', () => {
            const html = renderArticleHtml(articleWith(
                '::iframe[My Video](https://player.bilibili.com/player.html?bvid=BV1)'
            ));
            assert.match(bodySection(html), /src="https:\/\/player\.bilibili\.com/);
            assert.match(bodySection(html), /sandbox="/);
        });
    });
});
