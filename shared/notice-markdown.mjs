import MarkdownIt from 'markdown-it';

export const NOTICE_MAX_LENGTH = 20000;
const DEFAULT_BASE = 'https://yachiyo.hk/';

// A text-only subset: no author HTML, embeds, image requests, highlighting or math.
const markdown = new MarkdownIt('zero', { html: false, breaks: true, maxNesting: 12 })
  .enable(['paragraph', 'heading', 'blockquote', 'list', 'hr', 'fence', 'code',
    'newline', 'escape', 'backticks', 'emphasis', 'strikethrough', 'link',
    'reference', 'autolink', 'entity', 'image']);

export function safeNoticeLink(value, baseUrl = DEFAULT_BASE) {
  const href = String(value || '').trim();
  if (!href || /[\\\u0000-\u001f\u007f]/.test(href) || href.startsWith('//')) return null;
  try {
    const base = new URL(baseUrl);
    const url = new URL(href, base);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    const canonicalHost = host => host.replace(/^www\./, '');
    const internal = url.origin === base.origin || (
      canonicalHost(url.hostname) === canonicalHost(base.hostname)
      && ['yachiyo.hk', 'tsukuyomi-space.com'].includes(canonicalHost(base.hostname))
      && !url.port && !base.port
    );
    return { href: internal ? url.pathname + url.search + url.hash : url.href, internal };
  } catch (_) {
    return null;
  }
}

markdown.validateLink = href => Boolean(safeNoticeLink(href));
markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  if (env.preview) return '<span class="notice-link-preview">';
  const token = tokens[index];
  const link = safeNoticeLink(token.attrGet('href'), env.baseUrl);
  if (!link) return '<a>';
  token.attrSet('href', link.href);
  if (!link.internal) {
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener noreferrer');
  }
  return renderer.renderToken(tokens, index, options);
};
markdown.renderer.rules.link_close = (tokens, index, options, env, renderer) => env.preview
  ? '</span>' : renderer.renderToken(tokens, index, options);
markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index].content);

function noticeSource(content) {
  return String(content || '').slice(0, NOTICE_MAX_LENGTH);
}

export function renderNoticeMarkdown(content, baseUrl = DEFAULT_BASE, { preview = false } = {}) {
  return markdown.render(noticeSource(content), { baseUrl, preview });
}

export function noticeSummary(content) {
  const first = markdown.parse(noticeSource(content), {}).find(token => token.type === 'inline');
  const text = (first?.children || []).map(token => {
    if (['text', 'code_inline', 'image'].includes(token.type)) return token.content;
    return ['softbreak', 'hardbreak'].includes(token.type) ? ' ' : '';
  }).join('').replace(/\s+/g, ' ').trim();
  return Array.from(text).slice(0, 100).join('');
}

export function announcementContent(settings) {
  const announcement = String(settings?.siteAnnouncement || '').trim();
  const popup = String(settings?.visitPopupContent || '').trim();
  // The legacy field was unused on the homepage and seeded with this placeholder.
  // Preserve the current custom notice until an administrator writes an announcement.
  if (announcement === '欢迎访问月读空间' && popup) return popup;
  return announcement || popup;
}
