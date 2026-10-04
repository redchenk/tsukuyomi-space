import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fingerprintedBrandAssets } from '../vite.frontend.config.js';

function render(englishSite = false) {
  const assets = new Map();
  const context = {
    emitFile(asset) {
      const reference = String(assets.size);
      const hash = createHash('sha256').update(asset.source).digest('hex').slice(0, 12);
      const dot = asset.name.lastIndexOf('.');
      assets.set(reference, { ...asset, fileName: `assets/${asset.name.slice(0, dot)}-${hash}${asset.name.slice(dot)}` });
      return reference;
    },
    getFileName(reference) { return assets.get(reference).fileName; }
  };
  const bundle = { 'index.html': { type: 'asset', source: readFileSync(new URL('../src/frontend/index.html', import.meta.url), 'utf8') } };
  fingerprintedBrandAssets(englishSite).generateBundle.call(context, {}, bundle);
  return { html: bundle['index.html'].source, assets: [...assets.values()] };
}

test('HTML icons and manifest use content-addressed files even when CDN ignores queries', () => {
  const { html, assets } = render();
  assert.equal(assets.length, 6);
  assert.doesNotMatch(html, /(?:favicon\.ico|assets\/icons\/icon-\d+\.png|site\.webmanifest)(?:\?v=|["<])/);
  for (const name of ['favicon.ico', 'icon-32.png', 'icon-180.png', 'site.webmanifest']) {
    assert.ok(html.includes('/' + assets.find(asset => asset.name === name).fileName));
  }
  for (const asset of assets.filter(asset => asset.name !== 'site.webmanifest')) {
    const original = asset.name === 'favicon.ico' ? '../favicon.ico' : '../assets/icons/' + asset.name;
    assert.deepEqual(asset.source, readFileSync(new URL(original, import.meta.url)));
  }
});

test('PWA icons resolve to emitted files and scope stays at the site root', () => {
  const { assets } = render();
  const manifest = JSON.parse(assets.find(asset => asset.name === 'site.webmanifest').source);
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.start_url, '/');
  for (const icon of manifest.icons) {
    assert.ok(assets.some(asset => '/' + asset.fileName === icon.src));
    assert.ok(!icon.src.includes('?'));
  }
});

test('overseas manifest is English while emitted icon bytes stay identical', () => {
  const domestic = render();
  const overseas = render(true);
  const manifest = JSON.parse(overseas.assets.find(asset => asset.name === 'site.webmanifest').source);
  assert.equal(manifest.lang, 'en');
  assert.equal(manifest.name, 'Tsukuyomi Space');
  assert.deepEqual(overseas.assets.filter(asset => asset.name !== 'site.webmanifest'), domestic.assets.filter(asset => asset.name !== 'site.webmanifest'));
});
