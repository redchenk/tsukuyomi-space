import renderer from '../../../shared/markdown.cjs';
import media from '../../../shared/markdown-media.cjs';
import '../styles/markdown.css';

export const { renderMarkdown } = renderer;
export const { renderBilibiliEmbed, renderMediaCard, renderIframeEmbed } = media;

export function sanitizeRenderedHtml(html) {
  return String(html || '')
    .replace(/<\s*\/?\s*(script|style|object|embed|link|meta|base|form|input|button|textarea|select|option|svg|math)\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(href|src|poster|xlink:href)\s*=\s*(["'])\s*(?:javascript|vbscript):[\s\S]*?\2/gi, '')
    .replace(/\s+(href|src|poster|xlink:href)\s*=\s*(?:javascript|vbscript):[^\s>]+/gi, '');
}
