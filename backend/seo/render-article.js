const config = require('../config');
const { safeJsonForHtml, sanitizeRenderedHtml } = require('../services/html-sanitizer');

const SITE_NAME = '月读空间';
const DEFAULT_DESCRIPTION = '月读空间是一个融合文章、留言广场、Live2D 房间与互动工具的二次元个人站。';
const DEFAULT_IMAGE = `${config.publicSiteUrl}/assets/icons/icon-512.png`;
const TOPIC_LINKS = [
    { href: '/topics/chou-kaguya-hime', title: '超时空辉夜姬资源', text: '小说、电影、二创与图库入口' },
    { href: '/topics/yachiyo-live2d', title: '八千代 Live2D 房间', text: 'Live2D、语音与角色互动体验' },
    { href: '/topics/ai-character-room', title: '月读空间 AI 角色互动', text: 'AI 聊天、TTS、记忆与房间设置' },
    { href: '/topics/kaguya-yachiyo', title: '超时空辉夜姬 八千代', text: '八千代相关内容与现实锚点' },
    { href: '/topics/cosmic-princess-kaguya-wiki', title: '角色与世界观 Wiki', text: '全部角色、设定和音乐词条' },
    { href: '/topics/pixel-art-community', title: '192×108 在线像素画', text: '像素创作、分享、点赞与导出' }
];

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
}

function sanitizeMarkdownUrl(value) {
    const url = String(value || '').trim().replace(/&amp;/g, '&');
    if (!url) return '';
    if (/^\/\/[a-z0-9.-]+(?:\/|$)/i.test(url)) return `https:${url}`;
    if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(url)) return url.replace(/\s/g, '');
    if (/^(https?:\/\/|\/(?!\/)|\.\/|\.\.\/|#)/i.test(url)) return url;
    return '';
}

const IFRAME_ATTR_PATTERNS = {
    src: /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
    title: /\btitle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
    'aria-label': /\baria-label\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
    height: /\bheight\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
};

function iframeAttr(source, name) {
    const pattern = IFRAME_ATTR_PATTERNS[name];
    if (!pattern) return '';
    const match = String(source || '').match(pattern);
    return match ? (match[1] || match[2] || match[3] || '').trim() : '';
}

function parseIframeInput(value) {
    const source = String(value || '').trim();
    if (!/^<iframe[\s>]/i.test(source)) return { src: sanitizeMarkdownUrl(source), title: '', height: '' };
    return {
        src: sanitizeMarkdownUrl(iframeAttr(source, 'src')),
        title: iframeAttr(source, 'title') || iframeAttr(source, 'aria-label'),
        height: iframeAttr(source, 'height')
    };
}

function splitTargetAndTitle(value) {
    const source = String(value || '').trim();
    const quoted = source.match(/^(\S+)(?:\s+["']([^"']*)["'])?$/);
    if (!quoted) return { target: source, title: '' };
    return { target: quoted[1] || '', title: quoted[2] || '' };
}

function iframeSandboxForUrl(url) {
    const tokens = ['allow-scripts', 'allow-forms', 'allow-popups', 'allow-popups-to-escape-sandbox', 'allow-presentation'];
    try {
        if (new URL(url).hostname.toLowerCase() === 'player.bilibili.com') tokens.push('allow-same-origin');
    } catch (_) {
        // Keep the stricter default if parsing fails.
    }
    return tokens.join(' ');
}

function stripMarkdown(value) {
    return String(value || '')
        .replace(/^::(?:bilibili|media|iframe)\[([^\]]*)]\([^)]+\)\s*$/gim, '$1')
        .replace(/!\[[^\]]*]\([^)]+\)/g, '')
        .replace(/\[[^\]]+]\([^)]+\)/g, match => match.replace(/^\[|\]\([^)]+\)$/g, ''))
        .replace(/[#>*_`~|]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function renderInline(value) {
    const codeSpans = [];
    let source = String(value ?? '').replace(/`([^`\n]+)`/g, (_, code) => {
        const token = `%%TS_CODE_${codeSpans.length}%%`;
        codeSpans.push(`<code>${escapeHtml(code)}</code>`);
        return token;
    });

    source = escapeHtml(source)
        .replace(/!\[([^\]]*)]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, alt, rawUrl, title) => {
            const url = sanitizeMarkdownUrl(rawUrl);
            if (!url) return '';
            const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
            return `<figure class="markdown-image"><img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}"${titleAttr} loading="lazy" decoding="async"></figure>`;
        })
        .replace(/\[([^\]]+)]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, label, rawUrl, title) => {
            const url = sanitizeMarkdownUrl(rawUrl);
            if (!url) return label;
            const external = /^https?:\/\//i.test(url) ? ' target="_blank" rel="noopener noreferrer"' : '';
            const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
            return `<a href="${escapeAttr(url)}"${external}${titleAttr}>${label}</a>`;
        })
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_]+)__/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
        .replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>')
        .replace(/~~([^~]+)~~/g, '<del>$1</del>');

    codeSpans.forEach((html, index) => {
        source = source.replace(`%%TS_CODE_${index}%%`, html);
    });

    return source;
}

function renderMediaCard(url, title = '', description = '') {
    const safeUrl = sanitizeMarkdownUrl(url);
    if (!safeUrl) return '';
    const mediaKind = String(description || '').trim().toLowerCase();
    let host = safeUrl;
    try {
        host = new URL(safeUrl).hostname;
    } catch (_) {
        host = safeUrl.replace(/^https?:\/\//i, '').split('/')[0];
    }
    if (mediaKind === 'video' || mediaKind === 'audio') {
        const element = mediaKind === 'video'
            ? `<video controls preload="metadata" playsinline src="${escapeAttr(safeUrl)}"></video>`
            : `<audio controls preload="metadata" src="${escapeAttr(safeUrl)}"></audio>`;
        return `<figure class="markdown-media-card markdown-media-card-${mediaKind}">
          <div class="markdown-media-card-player">${element}</div>
          <figcaption><strong>${escapeHtml(title || host)}</strong><em>${escapeHtml(host)}</em></figcaption>
        </figure>`;
    }
    return `<a class="markdown-media-card" href="${escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer">
      <span class="markdown-media-card-main"><strong>${escapeHtml(title || host)}</strong>${description ? `<small>${escapeHtml(description)}</small>` : ''}<em>${escapeHtml(host)}</em></span>
    </a>`;
}

function renderIframeEmbed(url, title = '嵌入内容', height = '') {
    const iframeInput = parseIframeInput(url);
    const safeUrl = sanitizeMarkdownUrl(iframeInput.src);
    if (!safeUrl || !/^https:\/\//i.test(safeUrl)) return '';
    const finalTitle = title || iframeInput.title || '嵌入内容';
    const parsedHeight = Math.min(Math.max(Number.parseInt(height || iframeInput.height, 10) || 420, 220), 900);
    return `<figure class="markdown-iframe">
      <iframe src="${escapeAttr(safeUrl)}" title="${escapeAttr(finalTitle)}" loading="lazy" height="${parsedHeight}" sandbox="${escapeAttr(iframeSandboxForUrl(safeUrl))}" referrerpolicy="strict-origin-when-cross-origin" allow="fullscreen; picture-in-picture; encrypted-media; clipboard-write; web-share"></iframe>
      <figcaption>${escapeHtml(finalTitle || safeUrl)}</figcaption>
    </figure>`;
}

function renderList(lines, ordered = false) {
    const tag = ordered ? 'ol' : 'ul';
    const items = lines.map(line => {
        const text = ordered
            ? line.replace(/^\s*\d+\.\s+/, '')
            : line.replace(/^\s*[-*+]\s+/, '');
        return `<li>${renderInline(text)}</li>`;
    }).join('');
    return `<${tag}>${items}</${tag}>`;
}

function renderParagraph(lines) {
    const rendered = renderInline(lines.join('\n')).replace(/\n/g, '<br>');
    if (/^<(figure|a) class="markdown-(image|iframe|media-card)"[\s\S]*(<\/figure>|<\/a>)$/.test(rendered)) return rendered;
    return `<p>${rendered}</p>`;
}

function renderMarkdownContent(markdown) {
    const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let buffer = [];
    let quoteBuffer = [];
    let listBuffer = [];
    let orderedListBuffer = [];
    let codeBuffer = [];
    let inCodeFence = false;
    let codeLang = '';

    function flushParagraph() {
        if (!buffer.length) return;
        html.push(renderParagraph(buffer));
        buffer = [];
    }

    function flushQuote() {
        if (!quoteBuffer.length) return;
        html.push(`<blockquote>${renderParagraph(quoteBuffer)}</blockquote>`);
        quoteBuffer = [];
    }

    function flushLists() {
        if (listBuffer.length) {
            html.push(renderList(listBuffer));
            listBuffer = [];
        }
        if (orderedListBuffer.length) {
            html.push(renderList(orderedListBuffer, true));
            orderedListBuffer = [];
        }
    }

    function flushFlow() {
        flushParagraph();
        flushQuote();
        flushLists();
    }

    for (const line of lines) {
        const fence = line.match(/^\s*```([\w-]*)\s*$/);
        if (fence) {
            if (inCodeFence) {
                html.push(`<pre><code${codeLang ? ` class="language-${escapeAttr(codeLang)}"` : ''}>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
                inCodeFence = false;
                codeLang = '';
                codeBuffer = [];
            } else {
                flushFlow();
                inCodeFence = true;
                codeLang = fence[1] || '';
            }
            continue;
        }

        if (inCodeFence) {
            codeBuffer.push(line);
            continue;
        }

        if (!line.trim()) {
            flushFlow();
            continue;
        }

        if (/^\s*<iframe[\s\S]*<\/iframe>\s*$/i.test(line)) {
            flushFlow();
            const embed = renderIframeEmbed(line, iframeAttr(line, 'title') || iframeAttr(line, 'aria-label') || '嵌入内容', iframeAttr(line, 'height'));
            if (embed) html.push(embed);
            continue;
        }

        const media = line.match(/^\s*::media\[([^\]\n]*)]\(([^)\n]+)\)\s*$/i);
        if (media) {
            flushFlow();
            const { target, title } = splitTargetAndTitle(media[2]);
            const card = renderMediaCard(target, media[1] || title, title && media[1] ? title : '');
            if (card) html.push(card);
            continue;
        }

        const iframe = line.match(/^\s*::iframe\[([^\]\n]*)]\(([\s\S]+)\)\s*$/i);
        if (iframe) {
            flushFlow();
            const { target, title } = splitTargetAndTitle(iframe[2]);
            const embed = renderIframeEmbed(target, iframe[1] || title, /^\d+$/.test(title) ? title : '');
            if (embed) html.push(embed);
            continue;
        }

        const heading = line.match(/^(#{1,4})\s+(.+)$/);
        if (heading) {
            flushFlow();
            const level = heading[1].length;
            html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
            continue;
        }

        if (/^\s*> ?/.test(line)) {
            flushParagraph();
            flushLists();
            quoteBuffer.push(line.replace(/^\s*> ?/, ''));
            continue;
        }

        if (/^\s*[-*+]\s+/.test(line)) {
            flushParagraph();
            flushQuote();
            if (orderedListBuffer.length) flushLists();
            listBuffer.push(line);
            continue;
        }

        if (/^\s*\d+\.\s+/.test(line)) {
            flushParagraph();
            flushQuote();
            if (listBuffer.length) flushLists();
            orderedListBuffer.push(line);
            continue;
        }

        if (/^\s*---+\s*$/.test(line)) {
            flushFlow();
            html.push('<hr>');
            continue;
        }

        flushQuote();
        flushLists();
        buffer.push(line);
    }

    if (inCodeFence) {
        html.push(`<pre><code${codeLang ? ` class="language-${escapeAttr(codeLang)}"` : ''}>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
    }
    flushFlow();
    return sanitizeRenderedHtml(html.join('\n'));
}

function plainArticleContent(article) {
    if (article?.content_format === 'block') {
        try {
            const blocks = JSON.parse(String(article.content || '[]'));
            if (Array.isArray(blocks)) {
                return blocks.map(block => block?.text || block?.content || block?.title || block?.description || block?.url || '').join('\n\n');
            }
        } catch (_) {
            return article.content || '';
        }
    }
    if (article?.content_format === 'html') {
        return String(article.content || '').replace(/<[^>]+>/g, ' ');
    }
    return article?.content || '';
}

function renderBlockContent(content) {
    let blocks = [];
    try {
        blocks = JSON.parse(String(content || '[]'));
    } catch (_) {
        return renderMarkdownContent(content);
    }
    if (!Array.isArray(blocks)) return '';
    return sanitizeRenderedHtml(blocks.map(block => {
        const type = String(block?.type || '').toLowerCase();
        const text = block?.text || block?.content || block?.title || block?.description || '';
        const url = sanitizeMarkdownUrl(block?.url || '');
        if (type === 'heading') return `<h2>${escapeHtml(text)}</h2>`;
        if (type === 'image' && url) return `<figure class="markdown-image"><img src="${escapeAttr(url)}" alt="${escapeAttr(block?.alt || text)}" loading="lazy" decoding="async"></figure>`;
        if ((type === 'video' || type === 'audio') && url) return renderMediaCard(url, text, type);
        if (type === 'iframe' && url) return renderIframeEmbed(url, text || '嵌入内容', block?.height || '');
        return renderMarkdownContent(text);
    }).join('\n'));
}

function renderArticleBody(article) {
    const content = article?.content || '';
    if (article?.content_format === 'html') {
        return sanitizeRenderedHtml(content);
    }
    if (article?.content_format === 'block') {
        return renderBlockContent(content);
    }
    return renderMarkdownContent(content);
}

function parseTags(value) {
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    } catch (_) {
        // Support older comma-separated tag values.
    }
    return String(value).split(/[,，]/).map(tag => tag.trim()).filter(Boolean);
}

function absoluteUrl(pathname) {
    if (!pathname) return config.publicSiteUrl;
    if (/^https?:\/\//i.test(pathname)) return pathname;
    return `${config.publicSiteUrl}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function articlePath(article) {
    return `/articles/${encodeURIComponent(article.id)}${article.slug ? `/${encodeURIComponent(article.slug)}` : ''}`;
}

function articleUrl(article) {
    return absoluteUrl(articlePath(article));
}

function articleDescription(article) {
    return stripMarkdown(article.excerpt || plainArticleContent(article) || DEFAULT_DESCRIPTION).slice(0, 160) || DEFAULT_DESCRIPTION;
}

function renderPlainContent(content, limit = 12) {
    return stripMarkdown(content)
        .split(/\n{2,}/)
        .map(line => line.trim())
        .filter(Boolean)
        .slice(0, limit)
        .map(line => `<p>${escapeHtml(line)}</p>`)
        .join('\n');
}

function articleSchema(article) {
    const url = articleUrl(article);
    const tags = parseTags(article.tags);
    return {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: article.title,
        description: articleDescription(article),
        image: [absoluteUrl(article.cover_image || DEFAULT_IMAGE)],
        datePublished: article.published_at || article.created_at || article.publish_date,
        dateModified: article.updated_at || article.created_at || article.publish_date,
        author: {
            '@type': 'Person',
            name: article.author_username || 'redchenk'
        },
        publisher: {
            '@type': 'Organization',
            name: SITE_NAME,
            logo: {
                '@type': 'ImageObject',
                url: DEFAULT_IMAGE
            }
        },
        mainEntityOfPage: url,
        inLanguage: 'zh-CN',
        keywords: tags.join(','),
        articleSection: article.category || ''
    };
}

function renderArticleHtml(article) {
    const title = `${article.title} | ${SITE_NAME}`;
    const description = articleDescription(article);
    const url = articleUrl(article);
    const image = absoluteUrl(article.cover_image || DEFAULT_IMAGE);
    const keywords = [...new Set([...parseTags(article.tags), article.category, article.title, '月读空间文章'].filter(Boolean))];
    const body = renderArticleBody(article) || renderPlainContent(plainArticleContent(article) || article.excerpt || '');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="keywords" content="${escapeHtml(keywords.join(', '))}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${escapeHtml(url)}">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/icons/icon-180.png">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  <script type="application/ld+json">${safeJsonForHtml(articleSchema(article))}</script>
  <style>
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#24324a;background:#f7fbff;line-height:1.78}
    main{width:min(860px,calc(100% - 32px));margin:48px auto;padding:32px;border:1px solid rgba(132,167,205,.35);border-radius:24px;background:rgba(255,255,255,.84);box-shadow:0 24px 80px rgba(79,109,150,.14)}
    a{color:#4d73d9} h1{margin:0 0 12px;font-size:clamp(2rem,5vw,3.4rem);line-height:1.18}.meta{color:#5f7088;margin-bottom:24px}.cover{width:100%;border-radius:18px;margin:20px 0;object-fit:cover}.summary{font-size:1.04rem;color:#40516c}.article-body{margin-top:26px}.article-body h1,.article-body h2,.article-body h3,.article-body h4{line-height:1.25;margin:1.5em 0 .55em}.article-body p{margin:0 0 1em}.article-body img,.article-body video{display:block;max-width:min(100%,720px);max-height:520px;margin:0 auto;border-radius:16px}.article-body audio{width:100%}.article-body figure{margin:24px 0}.article-body figcaption{margin-top:8px;text-align:center;color:#64748b;font-size:.92rem}.article-body pre{overflow:auto;padding:16px;border-radius:14px;background:#132035;color:#eef6ff}.article-body blockquote{margin:18px 0;padding:12px 16px;border-left:4px solid #8ea2ff;background:rgba(126,151,235,.1);border-radius:12px}.markdown-media-card-player,.markdown-iframe{display:grid;place-items:center}.markdown-iframe iframe{width:min(100%,720px);border:0;border-radius:16px}.enter{display:inline-flex;margin-top:24px;padding:10px 16px;border-radius:999px;background:#7b8cf6;color:white;text-decoration:none}
  </style>
</head>
<body>
  <main>
    <article>
      <h1>${escapeHtml(article.title)}</h1>
      <div class="meta">${escapeHtml(article.category || '文章')} · ${escapeHtml(article.published_at || article.created_at || article.publish_date || '')} · ${escapeHtml(article.author_username || 'redchenk')}</div>
      ${article.cover_image ? `<img class="cover" src="${escapeHtml(article.cover_image)}" alt="${escapeHtml(article.title)}" loading="eager" decoding="async">` : ''}
      <p class="summary"><strong>${escapeHtml(description)}</strong></p>
      <section class="article-body">
        ${body}
      </section>
      <a class="enter" href="/article?id=${encodeURIComponent(article.id)}&spa=1">进入完整互动文章页</a>
    </article>
  </main>
</body>
</html>`;
}

function renderStageHtml(articles = []) {
    const title = `主舞台 | ${SITE_NAME}`;
    const description = '浏览月读空间的文章、公告、技术记录、二创作品与创作日志，内容包括 Live2D、AI 角色、个人网站开发、二次元网页设计与日常记录。';
    const url = absoluteUrl('/stage');
    const itemList = articles.map((article, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: articleUrl(article),
        name: article.title
    }));
    const listHtml = articles.map(article => `
      <a class="card" href="${escapeHtml(articlePath(article))}">
        ${article.cover_image ? `<img src="${escapeHtml(article.cover_image)}" alt="${escapeHtml(article.title)}" loading="lazy" decoding="async">` : ''}
        <span class="meta">${escapeHtml(article.category || '文章')} · ${escapeHtml(article.published_at || article.created_at || article.publish_date || '')}</span>
        <h2>${escapeHtml(article.title)}</h2>
        <p>${escapeHtml(articleDescription(article))}</p>
      </a>
    `).join('');
    const topicHtml = TOPIC_LINKS.map(topic => `
      <a class="topic" href="${escapeAttr(topic.href)}">
        <strong>${escapeHtml(topic.title)}</strong>
        <span>${escapeHtml(topic.text)}</span>
      </a>
    `).join('');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="keywords" content="月读空间文章, 主舞台, 超时空辉夜姬二创, Live2D 技术, 创作日志">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${escapeHtml(url)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(DEFAULT_IMAGE)}">
  <script type="application/ld+json">${safeJsonForHtml({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: title,
        description,
        url,
        inLanguage: 'zh-CN',
        mainEntity: {
            '@type': 'ItemList',
            itemListElement: itemList
        }
    })}</script>
  <style>
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#25314a;background:#f5f8ff;line-height:1.7}
    main{width:min(1060px,calc(100% - 32px));margin:48px auto}.hero{padding:32px;border:1px solid rgba(132,167,205,.32);border-radius:24px;background:rgba(255,255,255,.82);box-shadow:0 24px 80px rgba(79,109,150,.13)}
    h1{margin:0 0 10px;font-size:clamp(2rem,5vw,3.8rem);line-height:1.12}.topics{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:22px}.topic{display:grid;gap:4px;padding:14px;border:1px solid rgba(132,167,205,.28);border-radius:16px;background:rgba(255,255,255,.66);color:inherit;text-decoration:none}.topic span{color:#62708a;font-size:.92rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin-top:24px}.card{display:grid;gap:10px;min-height:210px;padding:18px;border:1px solid rgba(132,167,205,.28);border-radius:20px;background:rgba(255,255,255,.76);color:inherit;text-decoration:none;overflow:hidden}.card img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:14px}.card h2{margin:0;font-size:1.12rem}.card p{margin:0;color:#62708a}.meta{color:#7b86a0;font-size:.82rem}.enter{display:inline-flex;margin-top:18px;padding:10px 16px;border-radius:999px;background:#7b8cf6;color:white;text-decoration:none}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <h1>主舞台</h1>
      <p>${escapeHtml(description)}</p>
      <a class="enter" href="/stage?spa=1">进入互动主舞台</a>
      <nav class="topics" aria-label="月读空间专题入口">
        ${topicHtml}
      </nav>
    </section>
    <section class="grid" aria-label="月读空间文章列表">
      ${listHtml || '<p>暂时还没有公开文章。</p>'}
    </section>
  </main>
</body>
</html>`;
}

function renderTopicLandingHtml(topic, articles = [], galleryAssets = []) {
    const title = `${topic.title} | ${SITE_NAME}`;
    const url = absoluteUrl(topic.path);
    const primaryImage = topic.image || (galleryAssets[0] ? galleryImageUrl(galleryAssets[0]) : DEFAULT_IMAGE);
    const articleCards = articles.slice(0, 12).map(article => `
      <a class="card" href="${escapeAttr(articlePath(article))}">
        ${article.cover_image ? `<img src="${escapeAttr(article.cover_image)}" alt="${escapeAttr(article.title)}" loading="lazy" decoding="async">` : ''}
        <span class="meta">${escapeHtml(article.category || '文章')} · ${escapeHtml(article.published_at || article.created_at || article.publish_date || '')}</span>
        <h2>${escapeHtml(article.title)}</h2>
        <p>${escapeHtml(articleDescription(article))}</p>
      </a>
    `).join('');
    const galleryHtml = galleryAssets.slice(0, 6).map((asset, index) => `
      <figure class="image-card">
        <img src="${escapeAttr(galleryImageUrl(asset))}" alt="${escapeAttr(galleryImageAlt(asset, index))}" loading="lazy" decoding="async">
      </figure>
    `).join('');
    const actionHtml = topic.actions.map(action => `<a class="action" href="${escapeAttr(action.href)}">${escapeHtml(action.label)}</a>`).join('');
    const schema = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: title,
        description: topic.description,
        url,
        inLanguage: 'zh-CN',
        keywords: topic.keywords.join(','),
        primaryImageOfPage: primaryImage,
        mainEntity: {
            '@type': 'ItemList',
            itemListElement: articles.slice(0, 12).map((article, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                url: articleUrl(article),
                name: article.title
            }))
        },
        breadcrumb: {
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: SITE_NAME, item: absoluteUrl('/') },
                { '@type': 'ListItem', position: 2, name: '专题', item: absoluteUrl('/stage') },
                { '@type': 'ListItem', position: 3, name: topic.title, item: url }
            ]
        }
    };

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(topic.description)}">
  <meta name="keywords" content="${escapeHtml(topic.keywords.join(','))}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="${escapeHtml(url)}">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/icons/icon-180.png">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(topic.description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(primaryImage)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(topic.description)}">
  <meta name="twitter:image" content="${escapeHtml(primaryImage)}">
  <script type="application/ld+json">${safeJsonForHtml(schema)}</script>
  <style>
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#24324a;background:#f6f9ff;line-height:1.72}
    main{width:min(1120px,calc(100% - 32px));margin:48px auto}.hero,.section{padding:30px;border:1px solid rgba(132,167,205,.32);border-radius:24px;background:rgba(255,255,255,.84);box-shadow:0 24px 80px rgba(79,109,150,.13)}.section{margin-top:22px}
    h1{margin:0 0 12px;font-size:clamp(2rem,5vw,3.7rem);line-height:1.12}h2{margin:0 0 14px}.lead{font-size:1.05rem;color:#43536e}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.action{display:inline-flex;padding:10px 15px;border-radius:999px;background:#7b8cf6;color:white;text-decoration:none}.points{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:20px}.point{padding:14px;border-radius:16px;background:rgba(126,151,235,.1);border:1px solid rgba(132,167,205,.24)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}.card{display:grid;gap:10px;min-height:210px;padding:16px;border:1px solid rgba(132,167,205,.28);border-radius:18px;background:rgba(255,255,255,.76);color:inherit;text-decoration:none;overflow:hidden}.card img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:12px}.card h2{font-size:1.08rem;margin:0}.card p{margin:0;color:#62708a}.meta{color:#7b86a0;font-size:.82rem}.images{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.image-card{margin:0;overflow:hidden;border-radius:16px;background:#fff}.image-card img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <h1>${escapeHtml(topic.title)}</h1>
      <p class="lead">${escapeHtml(topic.description)}</p>
      <div class="actions">${actionHtml}</div>
      <div class="points">
        ${topic.points.map(point => `<div class="point">${escapeHtml(point)}</div>`).join('')}
      </div>
    </section>
    <section class="section">
      <h2>相关内容</h2>
      <div class="grid">${articleCards || '<p>相关内容正在整理中。</p>'}</div>
    </section>
    ${galleryHtml ? `<section class="section"><h2>图库影像</h2><div class="images">${galleryHtml}</div></section>` : ''}
  </main>
</body>
</html>`;
}

function galleryImageUrl(asset) {
    return absoluteUrl(asset?.display_url || asset?.access_url || asset?.url || '');
}

function galleryImageAlt(asset, index) {
    const metadata = asset?.metadata || {};
    return metadata.alt || metadata.title || metadata.description || `月读空间图库图片 ${index + 1}`;
}

function renderGalleryHtml(assets = []) {
    const title = `图库 | ${SITE_NAME}`;
    const description = '浏览月读空间公开图库中的插画、二创图片与站点影像记录。';
    const url = absoluteUrl('/gallery');
    const images = assets
        .filter(asset => asset?.url || asset?.display_url || asset?.access_url)
        .slice(0, 48);
    const primaryImage = images[0] ? galleryImageUrl(images[0]) : DEFAULT_IMAGE;
    const imageObjects = images.slice(0, 24).map((asset, index) => ({
        '@type': 'ImageObject',
        position: index + 1,
        contentUrl: galleryImageUrl(asset),
        name: galleryImageAlt(asset, index),
        uploadDate: asset.created_at || asset.updated_at || undefined
    }));
    const gridHtml = images.map((asset, index) => `
      <figure class="gallery-card">
        <img src="${escapeAttr(galleryImageUrl(asset))}" alt="${escapeAttr(galleryImageAlt(asset, index))}" loading="${index < 4 ? 'eager' : 'lazy'}" decoding="async">
      </figure>
    `).join('');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="keywords" content="月读空间图库, 超时空辉夜姬图片, 二次元插画, 公开图片画廊, 用户创作图片">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="${escapeHtml(url)}">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/icons/icon-180.png">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(primaryImage)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(primaryImage)}">
  <script type="application/ld+json">${safeJsonForHtml({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: title,
        description,
        url,
        inLanguage: 'zh-CN',
        primaryImageOfPage: primaryImage,
        mainEntity: {
            '@type': 'ImageGallery',
            name: title,
            image: imageObjects
        }
    })}</script>
  <style>
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#24324a;background:#f7fbff;line-height:1.7}
    main{width:min(1120px,calc(100% - 32px));margin:48px auto}.hero{padding:32px;border:1px solid rgba(132,167,205,.32);border-radius:24px;background:rgba(255,255,255,.84);box-shadow:0 24px 80px rgba(79,109,150,.13)}
    h1{margin:0 0 10px;font-size:clamp(2rem,5vw,3.8rem);line-height:1.12}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:24px}.gallery-card{margin:0;overflow:hidden;border-radius:20px;border:1px solid rgba(132,167,205,.26);background:#fff;box-shadow:0 18px 48px rgba(67,92,130,.11)}.gallery-card img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}.enter{display:inline-flex;margin-top:18px;padding:10px 16px;border-radius:999px;background:#7b8cf6;color:white;text-decoration:none}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <h1>图库</h1>
      <p>${escapeHtml(description)}</p>
      <a class="enter" href="/gallery?spa=1">进入互动图库</a>
    </section>
    <section class="grid" aria-label="月读空间公开图库">
      ${gridHtml || '<p>暂时还没有公开图库图片。</p>'}
    </section>
  </main>
</body>
</html>`;
}

function renderNotFoundHtml() {
    return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex,nofollow"><title>文章不存在 | 月读空间</title></head><body><main><h1>文章不存在</h1><p>这篇文章可能已经离开月读空间。</p><a href="/stage">返回主舞台</a></main></body></html>`;
}

module.exports = {
    articlePath,
    articleUrl,
    renderArticleHtml,
    renderGalleryHtml,
    renderStageHtml,
    renderTopicLandingHtml,
    renderNotFoundHtml
};
