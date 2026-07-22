const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { buildSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function loadBundledModule(relativePath) {
  const filePath = path.join(root, relativePath);
  const output = buildSync({
    entryPoints: [filePath],
    bundle: true,
    format: 'cjs',
    logLevel: 'silent',
    platform: 'node',
    write: false
  }).outputFiles[0].text;
  const loaded = new Module(filePath, module);
  loaded.filename = filePath;
  loaded.paths = Module._nodeModulePaths(path.dirname(filePath));
  loaded._compile(output, filePath);
  return loaded.exports;
}

test('Wiki route, navigation and production fallback are wired together', () => {
  const router = read('src/frontend/router/index.js');
  const shell = read('src/frontend/layouts/AppShell.vue');
  const messages = read('src/frontend/i18n/messages.js');
  const staticMiddleware = read('backend/middleware/static.js');

  assert.match(router, /const WikiPage = loadRoute\(\(\) => import\('\.\.\/pages\/WikiPage\.vue'\), \(\) => import\('\.\.\/styles\/routes\/wiki\.css'\)\)/);
  assert.match(router, /path: '\/wiki',[\s\S]*name: 'wiki',[\s\S]*component: WikiPage/);
  assert.match(router, /path: '\/wiki\/characters\/:slug',[\s\S]*name: 'wikiCharacter'/);
  assert.match(router, /path: '\/wiki\/terms\/:slug',[\s\S]*name: 'wikiTerm'/);
  assert.match(shell, /path: '\/stage'[\s\S]*path: '\/wiki'[\s\S]*label: props\.t\.wiki/);
  assert.match(messages, /wiki: '百科'[\s\S]*wiki: 'Wiki'/);
  assert.match(staticMiddleware, /\{ path: '\/wiki', priority: '0\.8', changefreq: 'monthly' \}/);
  assert.match(staticMiddleware, /vueRoutes = new Set\(\[[^\]]*'\/wiki'/);
  assert.match(staticMiddleware, /wikiEntryRoute = req\.path\.startsWith\('\/wiki\/characters\/'\) \|\| req\.path\.startsWith\('\/wiki\/terms\/'\)/);
  assert.match(read('src/frontend/styles/routes/wiki.css'), /assets\/css\/vue\/pages\/wiki(?:-entry)?\.css/);
});

test('MediaWiki rendering keeps generated HTML inside a strict passive allowlist', () => {
  const { parseMediaWikiArticle } = loadBundledModule('src/frontend/utils/mediaWikiArticle.js');
  const maliciousSource = `{{Infobox3
|name::<img src=x onerror=alert(1)>
}}
{{Cquote|<script>alert(1)</script>}}
== intro ==
* [[javascript:alert(1)|unsafe link]]
* {{blackout|<svg onload=alert(1)>}}
[[File:missing.webp|thumb|<img src=x onerror=alert(1)>]]`;
  const maliciousResult = parseMediaWikiArticle(maliciousSource);
  const maliciousHtml = [
    ...maliciousResult.profileRows.map((row) => row.valueHtml),
    ...maliciousResult.sections.map((section) => section.html)
  ].join('\n');

  assert.doesNotMatch(maliciousHtml, /<(?:script|iframe|object|embed|svg|math|form|input|button|textarea|select|style|link|meta|base)\b/i);
  assert.doesNotMatch(maliciousHtml, /<[^>]+\son[a-z]+\s*=/i);
  assert.doesNotMatch(maliciousHtml, /(?:javascript|data|vbscript):/i);
  assert.match(maliciousHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);

  const allowedTags = new Set(['a', 'big', 'blockquote', 'br', 'code', 'del', 'details', 'div', 'em', 'figcaption', 'figure', 'img', 'li', 'p', 'span', 'strong', 'summary', 'sup', 'ul']);
  const sourceDir = path.join(root, 'src/frontend/data/wiki-sources');
  for (const fileName of fs.readdirSync(sourceDir).filter((file) => file.endsWith('.mediawiki'))) {
    const parsed = parseMediaWikiArticle(read(`src/frontend/data/wiki-sources/${fileName}`));
    const html = [
      ...parsed.profileRows.map((row) => row.valueHtml),
      ...parsed.sections.map((section) => section.html)
    ].join('\n');
    const tags = [...html.matchAll(/<\/?([a-z][a-z0-9-]*)\b/gi)].map((match) => match[1].toLowerCase());
    tags.forEach((tag) => assert.equal(allowedTags.has(tag), true, `${fileName}: unexpected <${tag}>`));
    [...html.matchAll(/\shref="([^"]*)"/gi)].forEach((match) => {
      assert.match(match[1], /^(?:\/wiki(?:\/|$)|https:\/\/zh\.moegirl\.org\.cn\/)/, `${fileName}: unsafe href`);
    });
    [...html.matchAll(/\ssrc="([^"]*)"/gi)].forEach((match) => {
      assert.match(match[1], /^\/assets\/images\/wiki\/content\/source-\d{3}\.webp$/, `${fileName}: unsafe image src`);
    });
    [...html.matchAll(/\sstyle="([^"]*)"/gi)].forEach((match) => {
      assert.match(match[1], /^--source-media-width:\d+px$/, `${fileName}: unsafe inline style`);
    });
    assert.doesNotMatch(html, /<[^>]+\son[a-z]+\s*=/i);
    assert.doesNotMatch(html, /(?:javascript|data|vbscript):/i);
  }
});

test('Wiki navigation, source links and image paths reject hostile values', () => {
  const {
    decodeWikiHash,
    trustedWikiAssetPath,
    trustedWikiSourceUrl
  } = loadBundledModule('src/frontend/utils/wikiSecurity.js');

  assert.equal(decodeWikiHash('#source-intro'), 'source-intro');
  assert.equal(decodeWikiHash('#source%2Dintro'), 'source-intro');
  assert.equal(decodeWikiHash('#%'), '');
  assert.equal(decodeWikiHash(`#${'a'.repeat(500)}`), '');
  assert.equal(decodeWikiHash('#safe%00unsafe'), '');

  assert.equal(trustedWikiSourceUrl('javascript:alert(1)'), '');
  assert.equal(trustedWikiSourceUrl('http://zh.moegirl.org.cn/wiki/test'), '');
  assert.equal(trustedWikiSourceUrl('https://zh.moegirl.org.cn.evil.example/wiki/test'), '');
  assert.equal(trustedWikiSourceUrl('https://user:password@zh.moegirl.org.cn/wiki/test'), '');
  assert.equal(trustedWikiSourceUrl('https://zh.moegirl.org.cn/wiki/test'), 'https://zh.moegirl.org.cn/wiki/test');

  assert.equal(trustedWikiAssetPath('/assets/images/wiki/content/source-001.webp'), '/assets/images/wiki/content/source-001.webp');
  assert.equal(trustedWikiAssetPath('/assets/images/wiki/../../index.html'), '');
  assert.equal(trustedWikiAssetPath('/assets/images/wiki/content/active.svg'), '');
  assert.equal(trustedWikiAssetPath('data:image/svg+xml,<svg onload=alert(1)>'), '');

  const landing = read('src/frontend/pages/WikiPage.vue');
  const entry = read('src/frontend/pages/WikiEntryPage.vue');
  assert.doesNotMatch(landing, /decodeURIComponent\(window\.location\.hash/);
  assert.doesNotMatch(entry, /decodeURIComponent\(window\.location\.hash/);
  assert.match(landing, /trustedReferences/);
  assert.match(entry, /trustedSourceLinks/);
});

test('Every published Wiki entry is admitted by the overseas SEO allowlist', () => {
  const { allWikiEntries, wikiEntryPath } = loadBundledModule('src/frontend/data/cosmicKaguyaWikiEntries.js');
  const service = read('deploy/overseas-translation-service.py');
  for (const entry of allWikiEntries) {
    const entryPath = wikiEntryPath(entry.kind, entry.slug);
    assert.match(service, new RegExp(`['"]${entryPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`), entryPath);
  }
});

test('Every character and term receives a reusable secondary entry page', () => {
  const data = read('src/frontend/data/cosmicKaguyaWikiEntries.js');
  const page = read('src/frontend/pages/WikiEntryPage.vue');
  const styles = read('assets/css/vue/pages/wiki-entry.css');
  const sourceComponent = read('src/frontend/components/KaguyaSourceArticle.vue');
  const sourceParser = read('src/frontend/utils/mediaWikiArticle.js');
  const kaguyaSource = read('src/frontend/data/wiki-sources/kaguya.mediawiki');

  const characterSlugs = ['kaguya', 'iroha', 'yachiyo', 'akira', 'rai', 'noi', 'roka', 'mami', 'fushi', 'doge', 'otako', 'terukoto'];
  const termSlugs = ['tsukuyomi', 'yachiyo-cup', 'kassen', 'black-onyx', 'remember', 'reply', 'taketori'];
  characterSlugs.forEach((slug) => assert.match(data, new RegExp(`\\b${slug}: \\{`)));
  termSlugs.forEach((slug) => assert.match(data, new RegExp(`['\"]?${slug}['\"]?: \\{`)));
  assert.match(page, /图片预留位置/);
  assert.match(page, /<details class="wiki-entry-spoiler">/);
  assert.match(page, /relatedWikiEntries/);
  assert.match(page, /entry\.kind === 'character'.+id="moegirl"/s);
  assert.match(page, /v-else id="gallery"/);
  assert.match(page, /跳转至萌娘百科/);
  assert.match(data, /moegirlCharacterEntries/);
  assert.match(data, /characterImageVariants/);
  assert.match(data, /kaguya-reality\.webp/);
  assert.match(data, /kaguya-tsukuyomi\.webp/);
  const sourceBackedSlugs = ['kaguya', 'iroha', 'yachiyo', 'akira', 'rai', 'noi', 'roka', 'mami'];
  sourceBackedSlugs.forEach((slug) => {
    assert.match(data, new RegExp(`${slug}: \\{[\\s\\S]{0,260}?sourceArticle: '${slug}'`));
    assert.match(sourceComponent, new RegExp(`${slug}\\.mediawiki\\?raw`));
    assert.equal(fs.existsSync(path.join(root, `src/frontend/data/wiki-sources/${slug}.mediawiki`)), true, slug);
  });
  assert.match(data, /source-experience/);
  assert.match(page, /<KaguyaSourceArticle v-if="entry\.sourceArticle" :source-key="entry\.sourceArticle"/);
  assert.match(sourceComponent, /parseMediaWikiArticle/);
  assert.match(sourceComponent, /article\.value\.sections\.filter\(\(section\) => section\.id !== 'source-notes'\)/);
  assert.doesNotMatch(data, /\{ id: 'source-notes', label: '注释及外部链接' \}/);
  assert.match(page, /<span v-if="!entry\.sourceArticle">\{\{ entry\.kindLabel \}\}<\/span>/);
  assert.match(page, /<figcaption v-if="activeImage\?\.imageSource && !entry\.sourceArticle">/);
  assert.match(page, /<div v-if="!entry\.sourceArticle" class="wiki-entry-notice" role="note">/);
  assert.match(sourceParser, /parseKaguyaMediaWiki/);
  assert.match(sourceParser, /wiki-source-media-slot/);
  assert.match(sourceParser, /wiki-source-media-float-right/);
  assert.match(sourceParser, /title="你知道的太多了"/);
  assert.match(kaguyaSource, /一起！（一休尼！）/);
  assert.match(kaguyaSource, /辉夜就是八千代吗/);
  assert.match(kaguyaSource, /真正的'''皆大欢喜，可喜可贺/);
  assert.match(data, /萌娘百科：辉夜（本页资料参考）/);
  assert.equal((data.match(/standalone: true/g) || []).length, 8);
  assert.equal((data.match(/standalone: false/g) || []).length, 4);
  assert.match(styles, /\.wiki-entry-image-placeholder/);
  assert.match(styles, /\.wiki-entry-image-variants/);
  assert.doesNotMatch(styles, /@keyframes wiki-entry-image-in\s*\{\s*from \{ opacity: 0;/);
  assert.match(styles, /body\.wiki-entry-open \.route-stage \{ z-index: 4; \}/);
  assert.match(styles, /body\.wiki-entry-open \.moon \{ pointer-events: none; \}/);
  assert.match(styles, /\.wiki-source-blackout/);
  assert.match(styles, /\.wiki-source-blackout \.wiki-source-link \{ color: inherit; text-decoration-color: transparent; \}/);
  assert.match(styles, /\.wiki-source-section#source-lead \.wiki-source-quote \{ display: flow-root; \}/);
  assert.match(styles, /\.wiki-source-media-slot/);
  assert.match(styles, /\.wiki-source-media-float-right/);
  assert.match(styles, /\.wiki-entry-layout-source/);
  assert.match(page, /:class="\{ 'wiki-entry-layout-source': entry\.sourceArticle \}"/);
  assert.match(page, /<aside v-if="!entry\.sourceArticle" class="wiki-entry-infobox"/);
  assert.match(styles, /\.wiki-entry-moegirl-card/);
  assert.match(styles, /html\[lang="en"\] \.wiki-entry-moegirl-card::after \{[\s\S]*?content: "M"/);
});

test('Wiki landing page includes the expanded release, credits, music and derivative archive', () => {
  const data = read('src/frontend/data/cosmicKaguyaWiki.js');
  const page = read('src/frontend/pages/WikiPage.vue');
  const styles = read('assets/css/vue/pages/wiki.css');

  assert.match(data, /\{ id: 'release', label: '发行与衍生', index: '07' \}/);
  assert.match(data, /2025-11-05/);
  assert.match(data, /2026-09-09/);
  assert.match(data, /export const boxOfficeMilestones/);
  assert.match(data, /达到 25 亿日元/);
  assert.match(data, /export const derivativeWorks/);
  assert.match(data, /978-4-04-811757-9/);
  assert.match(data, /978-4-04-738734-8/);
  assert.match(data, /978-4-04-117055-7/);
  assert.match(data, /type: '主题曲'/);
  assert.match(data, /type: '片尾曲'/);
  assert.match(data, /type: '特别曲'/);
  assert.match(data, /type: '插入歌'/);
  assert.match(data, /type: '翻唱曲'/);
  assert.match(data, /帝明／酒寄朝日/);
  assert.match(page, /id="release"/);
  assert.match(page, /上映、票房与衍生作品/);
  assert.match(page, /v-for="milestone in boxOfficeMilestones"/);
  assert.match(page, /v-for="work in derivativeWorks"/);
  assert.match(styles, /\.wiki-work-highlights/);
  assert.match(styles, /\.wiki-release-grid/);
  assert.match(styles, /\.wiki-derivative-grid/);
});

test('User-provided source media resolves into article images and primary-page cards', () => {
  const data = read('src/frontend/data/cosmicKaguyaWiki.js');
  const page = read('src/frontend/pages/WikiPage.vue');
  const parser = read('src/frontend/utils/mediaWikiArticle.js');
  const manifest = read('src/frontend/data/sourceMediaAssets.js');
  const entryStyles = read('assets/css/vue/pages/wiki-entry.css');
  const mediaDir = path.join(root, 'assets/images/wiki/content');
  const mediaFiles = fs.readdirSync(mediaDir).filter((file) => file.endsWith('.webp'));
  const normalize = (name) => name
    .replace(/\.[^.]+$/, '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '');
  const manifestList = manifest.match(/const sourceMediaFileNames = \[([\s\S]*?)\];/)?.[1] || '';
  const manifestNames = [...manifestList.matchAll(/'([^']+)'\s*,?/g)].map((match) => match[1]);
  const mediaKeys = new Set(manifestNames.map(normalize));
  const sourceRefs = fs.readdirSync(path.join(root, 'src/frontend/data/wiki-sources'))
    .filter((file) => file.endsWith('.mediawiki'))
    .flatMap((file) => [...read(`src/frontend/data/wiki-sources/${file}`).matchAll(/\[\[(?:File|文件):\s*([^|\]]+)/gi)].map((match) => match[1].trim()));
  const matchedRefs = new Set(sourceRefs.filter((name) => mediaKeys.has(normalize(name))).map(normalize));

  assert.equal(manifestNames.length, 59);
  assert.equal(mediaFiles.length, manifestNames.length);
  assert.deepEqual(mediaFiles.sort(), manifestNames.map((_name, index) => `source-${String(index + 1).padStart(3, '0')}.webp`));
  assert.equal(matchedRefs.size, 52);
  assert.match(manifest, /export function findSourceMedia/);
  assert.match(manifest, /\/assets\/images\/wiki\/content\/\$\{assetFileName\}/);
  assert.match(parser, /import \{ findSourceMedia \}/);
  assert.match(parser, /wiki-source-media-resolved/);
  assert.match(entryStyles, /\.wiki-source-media-resolved > img/);
  assert.match(entryStyles, /\.wiki-source-hide > summary::after/);
  assert.match(entryStyles, /\.wiki-source-hide\[open\] > summary::after \{ rotate: 180deg; \}/);
  assert.match(data, /超时空辉夜姬FUSHI\.webp/);
  assert.match(data, /超时空辉夜姬犬DOGE\.webp/);
  assert.match(data, /超时空辉夜姬忠犬宅公\.webp/);
  assert.match(data, /超时空辉夜姬乙事照琴\.webp/);
  assert.match(data, /超时空辉夜姬漫画封面1\.webp/);
  assert.match(data, /超时空辉夜姬小说封面\.webp/);
  assert.match(data, /超时空辉夜姬公式指南书封面\.webp/);
  assert.match(page, /trustedWikiAssetPath\(work\.image\)/);
});

test('Wiki page keeps spoilers collapsed and exposes interactive entry points', () => {
  const page = read('src/frontend/pages/WikiPage.vue');

  assert.match(page, /<details class="wiki-spoiler">/);
  assert.doesNotMatch(page, /<details class="wiki-spoiler"\s+open/);
  assert.match(page, /v-model="searchQuery"/);
  assert.match(page, /activeCharacterGroup/);
  assert.match(page, /activeMusicGroup/);
  assert.match(page, /role="dialog"/);
  assert.match(page, /rel="noopener noreferrer"/);
  assert.match(page, /非官方网站/);
});

test('Wiki assets and original content module are present', () => {
  const data = read('src/frontend/data/cosmicKaguyaWiki.js');
  const expectedAssets = [
    'assets/images/wiki/wiki-hero-original.webp',
    'assets/images/wiki/entries/characters/kaguya-reality.webp',
    'assets/images/wiki/entries/characters/kaguya-tsukuyomi.webp',
    'assets/images/wiki/entries/characters/iroha-reality.webp',
    'assets/images/wiki/entries/characters/iroha-tsukuyomi.webp',
    'assets/images/wiki/entries/characters/yachiyo-tsukuyomi.webp',
    'assets/images/wiki/entries/characters/akira-tsukuyomi.webp',
    'assets/images/wiki/entries/characters/rai-tsukuyomi.webp',
    'assets/images/wiki/entries/characters/noi-tsukuyomi.webp',
    'assets/images/wiki/entries/characters/roka-reality.webp',
    'assets/images/wiki/entries/characters/roka-tsukuyomi.webp',
    'assets/images/wiki/entries/characters/mami-reality.webp',
    'assets/images/wiki/entries/characters/mami-tsukuyomi.webp'
  ];

  expectedAssets.forEach((asset) => assert.equal(fs.existsSync(path.join(root, asset)), true, asset));
  assert.match(data, /export const characters = \[/);
  assert.match(data, /export const terms = \[/);
  assert.match(data, /export const music = \[/);
  assert.match(data, /export const references = \[/);
  assert.doesNotMatch(data, /-official\.(?:png|jpe?g|webp)/i);
});
