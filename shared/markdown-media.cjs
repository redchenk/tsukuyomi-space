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

function renderBilibiliEmbed(target, title = 'Bilibili video') {
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
      <iframe src="https://player.bilibili.com/player.html?${escapeAttr(params.toString())}" title="${escapeAttr(title || 'Bilibili video')}" loading="lazy" sandbox="allow-scripts allow-same-origin allow-presentation" allowfullscreen></iframe>
    </div>
    <figcaption>${escapeHtml(title || parsed.bvid || `av${parsed.aid}`)}</figcaption>
  </figure>`;
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
      <figcaption>
        <strong>${escapeHtml(title || host)}</strong>
        <em>${escapeHtml(host)}</em>
      </figcaption>
    </figure>`;
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

function renderIframeEmbed(url, title = 'Embedded content', height = '') {
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


module.exports = { escapeHtml, escapeAttr, sanitizeMarkdownUrl, iframeAttr, isRawIframe, splitTargetAndTitle, renderBilibiliEmbed, renderMediaCard, renderIframeEmbed };
