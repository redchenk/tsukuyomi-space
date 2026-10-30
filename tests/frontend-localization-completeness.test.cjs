const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { build } = require('esbuild');
const { Parser } = require('htmlparser2');
const catalog = require('../src/frontend/i18n/interface-catalog.json');

let runtime;
async function load() {
  return runtime ||= (async () => {
    const result = await build({
      stdin: { resolveDir: path.resolve(__dirname, '..'), contents: `
        export * from './src/frontend/i18n/runtime.js';
        export * from './src/frontend/services/wikiLocalization.js';
        export * from './src/frontend/services/wikiSourceLocalization.js';
        export * from './src/frontend/services/systemText.js';
        export * from './src/frontend/utils/mediaWikiArticle.js';
        export * from './src/frontend/utils/markdownTemplates.js';
        export * as wiki from './src/frontend/data/cosmicKaguyaWiki.js';
        export * as entries from './src/frontend/data/cosmicKaguyaWikiEntries.js';`
      },
      bundle: true, write: false, format: 'cjs', platform: 'node', external: ['vue'],
      plugins: [{ name: 'bundled-locales', setup(builder) {
        builder.onResolve({ filter: /^virtual:tsukuyomi-interface-/ }, args => ({ path: args.path, namespace: 'locale' }));
        builder.onLoad({ filter: /.*/, namespace: 'locale' }, args => ({
          contents: 'export default ' + JSON.stringify(Object.fromEntries(Object.entries(catalog).map(([key, value]) => [key, value[args.path.endsWith('-en') ? 'en' : 'ja']]))), loader: 'js'
        }));
      } }]
    });
    const context = { module: { exports: {} }, require, localStorage: { getItem: () => null } };
    context.exports = context.module.exports;
    vm.runInNewContext(result.outputFiles[0].text, context);
    return context.module.exports;
  })();
}

test('English controls contain no accidental Japanese and explain errors and page numbers', async () => {
  const api = await load();
  await api.setInterfaceLanguage('en');
  assert.equal(api.uiText('去登录'), 'Sign in');
  assert.equal(api.uiText('头像链接'), 'Avatar URL');
  assert.equal(api.uiText('第 {0} 页', [41]), 'Page 41');
  assert.equal(api.uiText('第 {0} 步，共 {1} 步', [2, 3]), 'Step 2 of 3');
  assert.equal(api.uiText('两次输入的新密码不一致'), 'The new passwords do not match.');
  for (const [key, value] of Object.entries(catalog)) assert.doesNotMatch(value.en || '', /[\u3040-\u30ff]/, key);
  assert.match(api.translateFeedback('自定义端点不自动转发密钥；请手动填写完整模型 ID。'), /^Custom endpoints/);
  assert.equal(api.translateFeedback('模型列表服务暂不可用（HTTP 503），请稍后重试。'), 'Model listing is temporarily unavailable (HTTP 503). Try again later.');
});

test('all Wiki entries localize editorial text while preserving identity, source names and source data', async () => {
  const api = await load();
  await api.setInterfaceLanguage('en');
  const before = JSON.stringify(api.entries.allWikiEntries);
  for (const entry of api.entries.allWikiEntries) {
    const display = api.localizeWikiData(entry);
    assert.equal(display.slug, entry.slug);
    assert.equal(display.original, entry.original);
    assert.equal(display.image, entry.image);
    assert.equal(display.sourceArticle, entry.sourceArticle);
    assert.equal(display.moegirl?.url, entry.moegirl?.url);
    assert.doesNotMatch(display.headline, /[\u3400-\u9fff]/, entry.slug);
    for (const [label, paragraphs] of display.sections) {
      assert.doesNotMatch(label, /[\u3400-\u9fff]/, entry.slug);
      for (const paragraph of paragraphs) assert.doesNotMatch(paragraph, /[\u3400-\u9fff]/, entry.slug);
    }
  }
  assert.equal(JSON.stringify(api.entries.allWikiEntries), before);
  const timeline = api.localizeWikiData(api.wiki.timeline);
  assert.ok(timeline.every(item => !/[\u3400-\u9fff]/.test(item.label + item.detail)));
});

function htmlFacts(html) {
  const result = { links: [], images: [], ids: [], text: [], descriptions: [] };
  const parser = new Parser({ ontext: text => result.text.push(text), onopentag(name, attrs) {
    if (attrs.href) result.links.push(attrs.href);
    if (attrs.src) result.images.push(attrs.src);
    if (attrs.id) result.ids.push(attrs.id);
    for (const attr of ['alt', 'title', 'aria-label']) if (attrs[attr]) result.descriptions.push(attrs[attr]);
  } });
  parser.write(html); parser.end();
  return result;
}

test('all eight imported character articles retain links, images and spoilers with English prose and alt text', async () => {
  const api = await load();
  await api.setInterfaceLanguage('en');
  const originalNames = /星降る海|酒寄\s?彩葉|月見\s?ヤチヨ|帝\s?アキラ|酒寄\s?朝日|駒沢雷|駒沢乃依|綾紬\s?芦花|諫山\s?真実|色色|内田雄马/gu;
  for (const name of ['kaguya', 'iroha', 'yachiyo', 'akira', 'rai', 'noi', 'roka', 'mami']) {
    const source = fs.readFileSync(`src/frontend/data/wiki-sources/${name}.mediawiki`, 'utf8');
    const article = (name === 'kaguya' ? api.parseKaguyaMediaWiki : api.parseMediaWikiArticle)(source);
    const display = api.localizeWikiSourceArticle(article);
    assert.equal(display.sections.length, article.sections.length);
    for (let index = 0; index < article.sections.length; index++) {
      const original = article.sections[index], translated = display.sections[index];
      assert.equal(translated.id, original.id);
      const before = htmlFacts(original.html), after = htmlFacts(translated.html);
      assert.deepEqual(after.links, before.links, name);
      assert.deepEqual(after.images, before.images, name);
      assert.deepEqual(after.ids, before.ids, name);
      if (original.id === 'source-notes') continue;
      for (const text of after.text) assert.doesNotMatch(text.replace(originalNames, ''), /[\u3400-\u9fff]/, `${name}: ${text}`);
      for (const description of after.descriptions) assert.doesNotMatch(description, /[\u3400-\u9fff]/, `${name}: ${description}`);
    }
    assert.match(display.sections.find(section => section.id === 'source-experience').html, /<details/);
  }
});

test('localization does not change Chinese source HTML or treat unknown text as executable translations', async () => {
  const api = await load();
  const html = '<a href="/wiki/characters/kaguya" title="你知道的太多了">辉夜</a><code>&lt;script&gt;未知&lt;/script&gt;</code>';
  await api.setInterfaceLanguage('zh');
  assert.equal(api.localizeWikiSourceHtml(html), html);
  await api.setInterfaceLanguage('en');
  const translated = api.localizeWikiSourceHtml(html);
  assert.match(translated, /title="Reveal spoiler"/);
  assert.match(translated, /&lt;script&gt;未知&lt;\/script&gt;/);
  assert.doesNotMatch(translated, /<script>/);
});

test('system notifications and moderation preserve user values and unknown messages', async () => {
  const api = await load();
  await api.setInterfaceLanguage('en');
  const actor = '保存 {1} <script>用户</script>';
  assert.equal(api.notificationTitle({ type: 'reply', title: `${actor} 评论了你的文章《我的文章》` }), `${actor} commented on your article “我的文章”`);
  assert.equal(api.notificationContent({ type: 'reply', content: '去登录' }), '去登录');
  assert.equal(api.notificationTitle({ type: 'pixel_art_like', title: '月下旅人 点赞了你的像素画' }), '月下旅人 liked your pixel art');
  assert.equal(api.notificationTitle({ type: 'like', title: '月下旅人 点赞了你的图库图片《我的作品》' }), '月下旅人 liked your gallery image “我的作品”');
  assert.equal(api.notificationContent({ type: 'like', metadata: { kind: 'gallery' }, content: '你的图库图片收到了一个赞。' }), 'Your gallery image received a like.');
  assert.equal(api.notificationContent({ type: 'reply', content: '你的图库图片收到了一个赞。' }), '你的图库图片收到了一个赞。');
  assert.equal(api.notificationTitle({ type: 'custom', title: '去登录' }), '去登录');
  assert.equal(api.moderationReason({ code: 'custom', message: 'Unknown provider message' }), 'Unknown provider message');
  const reason = { code: 'external_link', message: '包含需核实的站外链接：example.test。确认链接安全后才能公开。' };
  assert.equal(api.moderationReason(reason), 'External links need verification: example.test. The content can be published once the links are confirmed safe.');
  assert.equal(api.notificationContent({ type: 'moderation', content: '审核原因：需要人工确认。内容尚未公开，请登录后台核对完整内容。' }), 'Review reasons: Human review required. This content is not public. Sign in to the admin console to review it in full.');
});

test('new English Markdown examples are English without altering existing draft strings', async () => {
  const api = await load();
  const examples = api.markdownTemplates(true);
  for (const item of examples) assert.doesNotMatch(item.source, /[\u3400-\u9fff]/, item.id);
  assert.match(examples.find(item => item.id === 'table').source, /\| Item \| Description \|/);
  assert.match(api.markdownTemplates(false).find(item => item.id === 'table').source, /项目/);
});
