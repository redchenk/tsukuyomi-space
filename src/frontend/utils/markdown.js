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
  const lower = url.toLowerCase();
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(url)) return url.replace(/\s/g, '');
  if (/^(https?:\/\/|\/(?!\/)|\.\/|\.\.\/|#)/i.test(url)) return url;
  if (/^(javascript|data|vbscript):/i.test(lower)) return '';
  return '';
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
  if (/^<figure class="markdown-image">[\s\S]*<\/figure>$/.test(rendered)) return rendered;
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
