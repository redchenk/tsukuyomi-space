import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import interfaceCompiler from './scripts/i18n-transform.cjs';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const frontendRoot = fileURLToPath(new URL('./src/frontend', import.meta.url));

// Some CDN rules ignore query strings. Put brand files in the immutable build
// instead of relying on ?v=... to refresh cached favicon / PWA URLs.
export function fingerprintedBrandAssets(englishSite = false) {
  return {
    name: 'tsukuyomi-fingerprinted-brand-assets',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const replacements = new Map();
      for (const path of ['favicon.ico', ...[32, 180, 192, 512].map(size => `assets/icons/icon-${size}.png`)]) {
        const name = path.split('/').at(-1);
        const reference = this.emitFile({ type: 'asset', name, source: readFileSync(new URL(path, import.meta.url)) });
        replacements.set('/' + path, '/' + this.getFileName(reference));
      }
      const manifest = JSON.parse(readFileSync(new URL('./site.webmanifest', import.meta.url), 'utf8'));
      for (const icon of manifest.icons) icon.src = replacements.get(icon.src.split('?')[0]);
      if (englishSite) {
        manifest.name = 'Tsukuyomi Space';
        manifest.short_name = 'Tsukuyomi';
        manifest.description = 'Stories, community, fan art, pixel art and the Tsukimi Yachiyo Live2D room.';
        manifest.lang = 'en';
      }
      const reference = this.emitFile({ type: 'asset', name: 'site.webmanifest', source: JSON.stringify(manifest, null, 2) });
      replacements.set('/site.webmanifest', '/' + this.getFileName(reference));
      const index = bundle['index.html'];
      if (!index || index.type !== 'asset') throw new Error('Missing frontend HTML for brand assets');
      let html = String(index.source);
      for (const [original, replacement] of replacements) {
        html = html.replaceAll(original + '?v=sakura-20261004', replacement).replaceAll(original, replacement);
      }
      index.source = html;
    }
  };
}

function englishSiteHtml(englishSite) {
  return {
    name: 'tsukuyomi-english-site-html',
    transformIndexHtml(html) {
      if (!englishSite) return html;
      const description = 'Explore the Cosmic Princess Kaguya fan wiki, Tsukimi Yachiyo Live2D AI room, translated articles, fan art, pixel art and community posts.';
      const title = 'Tsukuyomi Space | Live2D, Wiki and Creative Community';
      const keywords = 'Tsukuyomi Space, Cosmic Princess Kaguya wiki, Tsukimi Yachiyo, Live2D AI, anime fan wiki, fan art gallery, pixel art community';
      const structuredData = JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            '@id': 'https://tsukuyomi-space.com/#website',
            name: 'Tsukuyomi Space',
            alternateName: 'Tsukuyomi Space English',
            url: 'https://tsukuyomi-space.com/',
            description,
            inLanguage: 'en'
          },
          {
            '@type': 'Organization',
            '@id': 'https://tsukuyomi-space.com/#organization',
            name: 'Tsukuyomi Space',
            url: 'https://tsukuyomi-space.com/',
            logo: 'https://tsukuyomi-space.com/assets/icons/icon-512.png'
          }
        ]
      });
      const additions = [
        '<meta http-equiv="content-language" content="en">',
        '<meta name="googlebot" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">',
        '<meta property="og:locale" content="en_US">',
        '<link rel="alternate" hreflang="en" href="https://tsukuyomi-space.com/">',
        '<link rel="alternate" hreflang="zh-Hans" href="https://yachiyo.hk/">',
        '<link rel="alternate" hreflang="x-default" href="https://tsukuyomi-space.com/">'
      ].join('\n    ');
      return html
        .replace(/<html\s+lang="[^"]*"/, '<html lang="en"')
        .replaceAll('https://yachiyo.hk', 'https://tsukuyomi-space.com')
        .replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
        .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${description}">`)
        .replace(/<meta\s+name="keywords"[^>]*>/i, `<meta name="keywords" content="${keywords}">`)
        .replace(/<meta\s+name="robots"[^>]*>/i, '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">')
        .replace(/<link\s+rel="canonical"[^>]*>/i, '<link rel="canonical" href="https://tsukuyomi-space.com/">')
        .replace(/<meta\s+property="og:site_name"[^>]*>/i, '<meta property="og:site_name" content="Tsukuyomi Space">')
        .replace(/<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${title}">`)
        .replace(/<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${description}">`)
        .replace(/<meta\s+property="og:url"[^>]*>/i, '<meta property="og:url" content="https://tsukuyomi-space.com/">')
        .replace(/<meta\s+name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${title}">`)
        .replace(/<meta\s+name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${description}">`)
        .replace(/<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/i, `<script type="application/ld+json">${structuredData}</script>`)
        .replace('</head>', `    ${additions}\n</head>`);
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '');
  const englishSite = String(process.env.VITE_SITE_LANGUAGE || env.VITE_SITE_LANGUAGE || '').trim() === 'en';

  return {
    root: frontendRoot,
    envDir: projectRoot,
    publicDir: false,
    define: {
      __TSUKUYOMI_ENGLISH_SITE__: JSON.stringify(englishSite)
    },
    plugins: [{
      name: 'tsukuyomi-interface-i18n', enforce: 'pre',
      resolveId(id) { if (/^virtual:tsukuyomi-interface-(en|ja)$/.test(id)) return '\0' + id; },
      load(id) {
        const match = /^\0virtual:tsukuyomi-interface-(en|ja)$/.exec(id);
        if (!match) return;
        const catalog = JSON.parse(readFileSync(new URL('./src/frontend/i18n/interface-catalog.json', import.meta.url), 'utf8'));
        return 'export default ' + JSON.stringify(Object.fromEntries(Object.entries(catalog).map(([source, values]) => [source, values[match[1]]])));
      },
      transform(source, id) {
        if (!id.startsWith(frontendRoot) || !/\.(?:vue|js|mjs)$/.test(id) || /\/(?:i18n|runtime|constants|data)\//.test(id)) return null;
        const result = interfaceCompiler.transformInterface(source, id);
        return result.changed ? { code: result.code, map: null } : null;
      }
    }, vue(), englishSiteHtml(englishSite), fingerprintedBrandAssets(englishSite)],
    resolve: {
      alias: {
        '@frontend': frontendRoot
      }
    },
    server: {
      fs: {
        allow: [projectRoot]
      },
      proxy: {
        '^/api(?!/client\\.js(?:\\?|$))': 'http://127.0.0.1:3000',
        '/lib': 'http://127.0.0.1:3000',
        '/models': 'http://127.0.0.1:3000',
        '/assets': 'http://127.0.0.1:3000',
        '/live2d-core.js': 'http://127.0.0.1:3000'
      }
    },
    build: {
      outDir: fileURLToPath(new URL('./dist/frontend', import.meta.url)),
      emptyOutDir: true,
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/vue') || id.includes('node_modules/@vue') || id.includes('node_modules/vue-router')) {
              return 'vue-vendor';
            }
          }
        }
      }
    }
  };
});
