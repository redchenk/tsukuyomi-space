const assert = require('node:assert/strict');
const { test, before } = require('node:test');
const { Parser } = require('htmlparser2');
let renderNoticeMarkdown, noticeSummary, safeNoticeLink, announcementContent, NOTICE_MAX_LENGTH;
before(async () => {
  ({ renderNoticeMarkdown, noticeSummary, safeNoticeLink, announcementContent, NOTICE_MAX_LENGTH } = await import('../shared/notice-markdown.mjs'));
});

function nodes(html) {
  const elements = [];
  new Parser({ onopentag: (tag, attrs) => elements.push({ tag, attrs }) }).end(html);
  return elements;
}

test('basic announcement formatting preserves headings, lists, emphasis, code and old line breaks', () => {
  const html = renderNoticeMarkdown('## 最新公告\n\n**重要** _提示_ ~~旧内容~~ `代码`\n换行\n\n- 第一项\n- 第二项\n\n> 温馨提示\n\n```text\n<script>示例</script>\n```');
  const tags = nodes(html).map(node => node.tag);
  for (const tag of ['h2', 'strong', 'em', 's', 'code', 'br', 'ul', 'li', 'blockquote', 'pre']) assert.ok(tags.includes(tag), tag);
  assert.match(html, /&lt;script&gt;示例&lt;\/script&gt;/);
  assert.match(renderNoticeMarkdown('原有公告\n第二行'), /原有公告<br>\n第二行/);
});

test('internal links keep query/anchors, canonical aliases and relative links resolve on the current page', () => {
  const html = renderNoticeMarkdown('[创作](/stage?sort=latest#works) [详情](./258/教程) [评论](#article-comments) [设置](https://www.yachiyo.hk/room/settings)', 'https://yachiyo.hk/articles/');
  const links = nodes(html).filter(node => node.tag === 'a');
  assert.deepEqual(links.map(node => node.attrs.href), ['/stage?sort=latest#works', '/articles/258/%E6%95%99%E7%A8%8B', '/articles/#article-comments', '/room/settings']);
  assert.ok(links.every(node => !node.attrs.target));
  assert.deepEqual(safeNoticeLink('?sort=latest', 'https://yachiyo.hk/stage'), { href: '/stage?sort=latest', internal: true });
});

test('external links open safely; separate sites, ports and deceptive hosts remain external', () => {
  for (const url of ['https://example.com/help', 'https://yachiyo.hk.evil.test/stage', 'https://yachiyo.hk:8443/stage', 'https://tsukuyomi-space.com/stage']) {
    const [link] = nodes(renderNoticeMarkdown(`[链接](${url})`)).filter(node => node.tag === 'a');
    assert.equal(link.attrs.href, url);
    assert.equal(link.attrs.target, '_blank');
    assert.equal(link.attrs.rel, 'noopener noreferrer');
  }
});

test('HTML, encoded dangerous protocols, credentials and media cannot become executable elements', () => {
  for (const input of [
    '<script>alert(1)</script><img src=x onerror=alert(1)>',
    '[x](javascript:alert(1)) [x](jav&#x61;script:alert(1)) [x](vbscript:bad)',
    '[x](data:text/html,test) [x](file:///etc/passwd) [x](//evil.test/)',
    '[x](https://user:secret@example.com/) ![图片](https://evil.test/track.png)',
    '<iframe src="https://evil.test"></iframe> <svg onload="alert(1)"></svg>',
    '[x](java%0Ascript:bad) [x](mailto:someone@example.com)'
  ]) {
    for (const node of nodes(renderNoticeMarkdown(input))) {
      assert.ok(!['script', 'img', 'iframe', 'svg', 'audio', 'video', 'object', 'embed', 'input', 'form'].includes(node.tag), input);
      assert.ok(Object.keys(node.attrs).every(key => !/^on|^srcdoc$/.test(key)), input);
      if (node.attrs.href) assert.ok(safeNoticeLink(node.attrs.href), input);
    }
  }
  for (const url of ['javascript:bad', 'data:text/html,bad', '//evil.test/', 'https://user:secret@example.com/', '/\\evil.test', '\u0001javascript:bad']) assert.equal(safeNoticeLink(url), null, url);
});

test('Terminal preview retains formatted link labels without navigating or losing unsaved input', () => {
  const html = renderNoticeMarkdown('[**创作**](/stage) [帮助](https://example.com)', undefined, { preview: true });
  assert.equal(nodes(html).filter(node => node.tag === 'a').length, 0);
  assert.equal(nodes(html).filter(node => node.attrs.class === 'notice-link-preview').length, 2);
  assert.match(html, /<strong>创作<\/strong>/);
});

test('homepage prioritizes the announcement, preserves the popup fallback and strips Markdown from the summary', () => {
  assert.equal(announcementContent({ siteAnnouncement: ' 新公告 ', visitPopupContent: '弹窗' }), '新公告');
  assert.equal(announcementContent({ siteAnnouncement: '  ', visitPopupContent: ' 弹窗 ' }), '弹窗');
  assert.equal(announcementContent({ siteAnnouncement: '欢迎访问月读空间', visitPopupContent: '已有的公告' }), '已有的公告');
  assert.equal(announcementContent({}), '');
  assert.equal(noticeSummary('## **新公告** [前往主舞台](/stage)\n\n正文'), '新公告 前往主舞台');
  assert.equal(noticeSummary('欢迎\n来到月读空间'), '欢迎 来到月读空间');
});

test('oversized input is bounded and Unicode summaries do not split emoji', () => {
  assert.equal(renderNoticeMarkdown('x'.repeat(NOTICE_MAX_LENGTH + 1000)), renderNoticeMarkdown('x'.repeat(NOTICE_MAX_LENGTH)));
  assert.equal(noticeSummary('🌙'.repeat(101)), '🌙'.repeat(100));
});
