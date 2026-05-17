const CODE_TOKEN_PREFIX = '%%TS_CODE_';
const CODE_TOKEN_SUFFIX = '%%';

function escapeHtml(value) {
  return String(value ?? '')
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
  const lower = url.toLowerCase();
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(url)) return url.replace(/\s/g, '');
  if (/^(https?:\/\/|\/(?!\/)|\.\/|\.\.\/|#)/i.test(url)) return url;
  if (/^(javascript|data|vbscript):/i.test(lower)) return '';
  return '';
}

function iframeAttr(source, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = String(source || '').match(pattern);
  return match ? (match[1] || match[2] || match[3] || '').trim() : '';
}

function parseIframeInput(value) {
  const source = String(value || '').trim();
  if (!/^<iframe[\s>]/i.test(source)) return { src: source, title: '', height: '' };
  return {
    src: iframeAttr(source, 'src'),
    title: iframeAttr(source, 'title') || iframeAttr(source, 'aria-label'),
    height: iframeAttr(source, 'height')
  };
}

function isRawIframe(value) {
  return /^\s*<iframe[\s\S]*<\/iframe>\s*$/i.test(String(value || '').trim());
}

function iframeSandboxForUrl(url) {
  const tokens = ['allow-scripts', 'allow-forms', 'allow-popups', 'allow-popups-to-escape-sandbox', 'allow-presentation'];
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname === 'player.bilibili.com') tokens.push('allow-same-origin');
  } catch (_) {
    // Keep the stricter default if the URL cannot be parsed.
  }
  return tokens.join(' ');
}

function splitTargetAndTitle(value) {
  const source = String(value || '').trim();
  const quoted = source.match(/^(\S+)(?:\s+["']([^"']*)["'])?$/);
  if (!quoted) return { target: source, title: '' };
  return { target: quoted[1] || '', title: quoted[2] || '' };
}

function parseBilibiliTarget(value) {
  const source = String(value || '').trim().replace(/&amp;/g, '&');
  const result = { bvid: '', aid: '', page: '1' };
  const pageMatch = source.match(/[?&]p=(\d+)/i) || source.match(/[?&]page=(\d+)/i);
  if (pageMatch) result.page = pageMatch[1];

  const bvidMatch = source.match(/(BV[a-zA-Z0-9]+)/i) || source.match(/[?&]bvid=(BV[a-zA-Z0-9]+)/i);
  if (bvidMatch) {
    result.bvid = bvidMatch[1];
    return result;
  }

  const aidMatch = source.match(/(?:av|aid=)(\d+)/i);
  if (aidMatch) result.aid = aidMatch[1];
  return result;
}

export function renderBilibiliEmbed(target, title = 'Bilibili video') {
  const parsed = parseBilibiliTarget(target);
  const params = new URLSearchParams({
    page: parsed.page || '1',
    high_quality: '1',
    danmaku: '0'
  });
  if (parsed.bvid) params.set('bvid', parsed.bvid);
  if (parsed.aid) params.set('aid', parsed.aid);
  if (!parsed.bvid && !parsed.aid) return '';

  return `<figure class="markdown-bilibili">
    <div class="markdown-bilibili-frame">
      <iframe src="https://player.bilibili.com/player.html?${escapeAttr(params.toString())}" title="${escapeAttr(title || 'Bilibili video')}" loading="lazy" allowfullscreen></iframe>
    </div>
    <figcaption>${escapeHtml(title || parsed.bvid || `av${parsed.aid}`)}</figcaption>
  </figure>`;
}

export function renderMediaCard(url, title = '', description = '') {
  const safeUrl = sanitizeMarkdownUrl(url);
  if (!safeUrl || !/^https?:\/\//i.test(safeUrl)) return '';
  let host = safeUrl;
  try {
    host = new URL(safeUrl).hostname;
  } catch (_) {
    host = safeUrl.replace(/^https?:\/\//i, '').split('/')[0];
  }
  return `<a class="markdown-media-card" href="${escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer">
    <span class="markdown-media-card-icon">Link</span>
    <span class="markdown-media-card-main">
      <strong>${escapeHtml(title || host)}</strong>
      ${description ? `<small>${escapeHtml(description)}</small>` : ''}
      <em>${escapeHtml(host)}</em>
    </span>
  </a>`;
}

export function renderIframeEmbed(url, title = 'Embedded content', height = '') {
  const iframeInput = parseIframeInput(url);
  const safeUrl = sanitizeMarkdownUrl(iframeInput.src);
  if (!safeUrl || !/^https:\/\//i.test(safeUrl)) return '';
  const finalTitle = title || iframeInput.title || 'Embedded content';
  const parsedHeight = Math.min(Math.max(Number.parseInt(height || iframeInput.height, 10) || 420, 220), 900);
  return `<figure class="markdown-iframe">
    <iframe src="${escapeAttr(safeUrl)}" title="${escapeAttr(finalTitle)}" loading="lazy" height="${parsedHeight}" sandbox="${escapeAttr(iframeSandboxForUrl(safeUrl))}" referrerpolicy="strict-origin-when-cross-origin" allow="fullscreen; picture-in-picture; encrypted-media; clipboard-write; web-share"></iframe>
    <figcaption>${escapeHtml(finalTitle || safeUrl)}</figcaption>
  </figure>`;
}

function renderInline(value) {
  const codeSpans = [];
  let source = String(value ?? '').replace(/`([^`\n]+)`/g, (_, code) => {
    const token = `${CODE_TOKEN_PREFIX}${codeSpans.length}${CODE_TOKEN_SUFFIX}`;
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  source = escapeHtml(source)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, alt, rawUrl, title) => {
      const url = sanitizeMarkdownUrl(rawUrl);
      if (!url) return '';
      const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
      return `<figure class="markdown-image"><img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}"${titleAttr} loading="lazy"></figure>`;
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, label, rawUrl, title) => {
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
    source = source.replace(`${CODE_TOKEN_PREFIX}${index}${CODE_TOKEN_SUFFIX}`, html);
  });

  return source;
}

function renderList(lines, ordered = false) {
  const tag = ordered ? 'ol' : 'ul';
  const items = lines.map((line) => {
    const text = ordered
      ? line.replace(/^\s*\d+\.\s+/, '')
      : line.replace(/^\s*[-*+]\s+/, '');
    return `<li>${renderInline(text)}</li>`;
  }).join('');
  return `<${tag}>${items}</${tag}>`;
}

function renderParagraph(lines) {
  const rendered = renderInline(lines.join('\n')).replace(/\n/g, '<br>');
  if (/^<(figure|a) class="markdown-(image|bilibili|iframe|media-card)"[\s\S]*(<\/figure>|<\/a>)$/.test(rendered)) return rendered;
  return `<p>${rendered}</p>`;
}

export function renderMarkdown(markdown) {
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

    if (isRawIframe(line)) {
      flushFlow();
      const embed = renderIframeEmbed(line, iframeAttr(line, 'title') || iframeAttr(line, 'aria-label') || '嵌入内容', iframeAttr(line, 'height'));
      if (embed) html.push(embed);
      continue;
    }

    const bilibili = line.match(/^\s*::bilibili\[([^\]\n]*)\]\(([^)\n]+)\)\s*$/i);
    if (bilibili) {
      flushFlow();
      const { target, title } = splitTargetAndTitle(bilibili[2]);
      const embed = renderBilibiliEmbed(target, bilibili[1] || title);
      if (embed) html.push(embed);
      continue;
    }

    const media = line.match(/^\s*::media\[([^\]\n]*)\]\(([^)\n]+)\)\s*$/i);
    if (media) {
      flushFlow();
      const { target, title } = splitTargetAndTitle(media[2]);
      const card = renderMediaCard(target, media[1] || title, title && media[1] ? title : '');
      if (card) html.push(card);
      continue;
    }

    const iframe = line.match(/^\s*::iframe\[([^\]\n]*)\]\(([\s\S]+)\)\s*$/i);
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
  return html.join('');
}
