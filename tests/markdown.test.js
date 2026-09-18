const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Parser } = require('htmlparser2');
const { renderMarkdown } = require('../shared/markdown.cjs');
const { renderArticleHtml } = require('../backend/seo/render-article');
const fs = require('node:fs');
const vm = require('node:vm');
const { continueMarkdownList, markdownTemplates } = vm.runInNewContext(
  fs.readFileSync(require('node:path').join(__dirname, '../src/frontend/utils/markdownTemplates.js'), 'utf8')
    .replace(/export function /g, 'function ') + '\n({ continueMarkdownList, markdownTemplates })'
);
function elements(html) {
  const result = [];
  const parser = new Parser({ onopentag: (name, attrs) => result.push({ name, attrs }) });
  parser.end(html); return result;
}

test('CommonMark structure supports nested lists, references, escaped delimiters and six heading levels', () => {
  const html = renderMarkdown('###### Heading\n\n- parent\n  - **child _emphasis_**\n\n3. third\n4. fourth\n\n[link][ref]\n\n[ref]: /stage "Stage"\n\n\\*literal\\*');
  assert.match(html, /<h6>Heading<\/h6>/);
  assert.match(html, /<ul>\s*<li>parent\s*<ul>/);
  assert.match(html, /<strong>child <em>emphasis<\/em><\/strong>/);
  assert.match(html, /<ol start="3">/);
  assert.match(html, /href="\/stage" title="Stage"/);
  assert.match(html, /\*literal\*/);
});

test('tables retain alignment and escaped pipes; task lists have read-only accessible state', () => {
  const html = renderMarkdown('| Left | Right |\n| :--- | ---: |\n| a\\|b | 12 |\n\n- [ ] Todo\n- [x] Done');
  assert.match(html, /markdown-table-scroll/);
  assert.match(html, /text-align:right/);
  assert.match(html, /a\|b/);
  assert.match(html, /aria-label="Incomplete"/);
  assert.match(html, /aria-label="Complete"/);
  assert.doesNotMatch(html, /<input/);
});

test('callouts, alerts and nested disclosures support formatted content without interpreting code samples', () => {
  const html = renderMarkdown('::: tip[Tip title]\n**Strong**\n\n:::: details More\n- first\n- second\n::::\n:::\n\n> [!WARNING]\n> warning\n\n```markdown\n::: tip\n==sample== :spoiler[secret]\n```');
  assert.match(html, /markdown-callout-tip/);
  assert.match(html, /<details[^>]*><summary>More/);
  assert.match(html, /markdown-callout-warning/);
  assert.equal(elements(html).filter(e => e.name === 'mark').length, 0);
  assert.equal(elements(html).filter(e => e.attrs.class === 'markdown-spoiler').length, 0);
});

test('markers, spoiler text, abbreviations and sub/superscripts render with stable semantics', () => {
  const html = renderMarkdown('*[SSR]: Server-Side Rendering\n\nSSR ==important=={.tip} H~2~O x^2^ :spoiler[hidden <b>text</b>] `==literal==`');
  assert.match(html, /<abbr title="Server-Side Rendering">SSR<\/abbr>/);
  assert.match(html, /markdown-mark-tip/);
  assert.match(html, /<sub>2<\/sub>/); assert.match(html, /<sup>2<\/sup>/);
  assert.match(html, /aria-expanded="false"/); assert.match(html, /aria-hidden="true"/);
  assert.match(html, /hidden &lt;b&gt;text&lt;\/b&gt;/);
  assert.match(html, /<code>==literal==<\/code>/);
  assert.doesNotMatch(renderMarkdown('\\==escaped== :spoiler[unclosed'), /<mark|markdown-spoiler/);
});

test('footnotes support multiple references and isolated documents', () => {
  const html = renderMarkdown('First[^one], again[^one].\n\n[^one]: Source **note**.');
  const nodes = elements(html), ids = nodes.map(e => e.attrs.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
  for (const a of nodes.filter(e => e.name === 'a' && e.attrs.href?.startsWith('#'))) assert.ok(ids.includes(a.attrs.href.slice(1)));
  assert.doesNotMatch(renderMarkdown('No note[^one]'), /class="footnote-ref"/);
});

test('math renders accessible MathML and fails safely for invalid, untrusted and oversized input', () => {
  assert.match(renderMarkdown('$x^2$\n\n$$\n\\frac{1}{2}\n$$'), /<math/);
  assert.match(renderMarkdown('$\\notARealCommand{x}$'), /markdown-math-error/);
  assert.match(renderMarkdown('$' + 'x'.repeat(4001) + '$'), /<code>/);
  assert.doesNotMatch(renderMarkdown('Costs $100 and $200.'), /<math/);
  const malicious = renderMarkdown('$\\href{javascript:alert(1)}{link}$');
  assert.ok(elements(malicious).every(e => !/^javascript:/i.test(e.attrs.href || '')));
});

test('code highlighting, titles and copying preserve exact source and unknown languages remain readable', () => {
  const source = 'const x = "<script>";\n';
  const html = renderMarkdown('```javascript title="example.js"\n' + source + '```');
  assert.match(html, /example.js/); assert.match(html, /hljs-keyword/); assert.match(html, /data-md-copy/);
  let inCode = false, text = '';
  const parser = new Parser({ onopentag: n => { if (n === 'code') inCode = true; }, onclosetag: n => { if (n === 'code') inCode = false; }, ontext: s => { if (inCode) text += s; } });
  parser.end(html); assert.equal(text, source);
  assert.match(renderMarkdown('```unknown\n<script>\n```'), /&lt;script&gt;/);
  assert.match(renderMarkdown('~~~~text\n```\nliteral\n~~~~'), /```/);
});

test('legacy media, images and native Markdown links remain compatible', () => {
  const html = renderMarkdown('![image](/assets/image.webp "caption")\n\n::bilibili[Video](BV12345)\n\n::media[Sound](/assets/music.flac "audio")\n\n::iframe[Example](https://example.com "500")');
  assert.match(html, /src="\/assets\/image.webp"/);
  assert.match(html, /markdown-bilibili/); assert.match(html, /<audio controls/);
  assert.match(html, /height="500"/); assert.match(html, /sandbox="/);
});

test('author HTML and encoded URL payloads cannot become executable in extended Markdown', () => {
  const attacks = [
    '<script>alert(1)</script><img src=x onerror=alert(1)>',
    '[x](javascript:alert(1)) ![x](data:image/svg+xml;base64,PHN2Zy8+)',
    '[x](jav&#x61;script:alert(1))',
    '::: tip[<img src=x onerror=alert(1)>]\nSafe\n:::',
    ':spoiler[<svg onload=alert(1)>]',
    '```js title="<script>alert(1)</script>"\nalert(1)\n```',
    '::iframe[x](javascript:alert(1))',
    '<iframe src="https://example.com" onload="alert(1)" srcdoc="bad"></iframe>',
    '$\\htmlStyle{background:url(javascript:alert(1))}{x}$'
  ];
  for (const attack of attacks) for (const el of elements(renderMarkdown(attack))) {
    assert.ok(!['script', 'svg', 'object', 'embed', 'form', 'input'].includes(el.name), attack);
    for (const [key, value] of Object.entries(el.attrs)) {
      assert.ok(!/^on|^srcdoc$/.test(key), attack);
      if (['href', 'src', 'xlink:href'].includes(key)) assert.ok(!/^(?:javascript|vbscript):/i.test(value), attack);
    }
  }
});

test('server article body uses the exact shared Markdown output', () => {
  const source = '## Parity\n\n::: details Read\n==highlight==\n:::\n\n$x^2$\n\n- [x] Done\n\nA[^1]\n\n[^1]: Note';
  const html = renderArticleHtml({ id: 'parity', title: 'Parity', content: source, content_format: 'markdown' });
  assert.ok(html.includes(renderMarkdown(source)));
});

test('all insertable templates render and list continuation respects fences and selections', () => {
  for (const snippet of markdownTemplates()) assert.ok(renderMarkdown(snippet.source).length > 0, snippet.id);
  assert.equal(continueMarkdownList('- [x] Done', 10, 10).text, '\n- [ ] ');
  assert.equal(continueMarkdownList('3. Item', 7, 7).text, '\n4. ');
  assert.equal(continueMarkdownList('- ', 2, 2).start, 0);
  assert.equal(continueMarkdownList('- Item', 1, 4), null);
  assert.equal(continueMarkdownList('```text\n- Item', 14, 14), null);
  assert.equal(continueMarkdownList('```text\n- Item\n```\n- Next', 24, 24).text, '\n- ');
});
