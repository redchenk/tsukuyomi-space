import { interfaceLanguage } from '../i18n/runtime';
import translations from '../data/wiki-sources/en.json';
import { wikiText } from './wikiLocalization';

const decodeText = value => value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
  if (entity[0] === '#') return String.fromCodePoint(parseInt(entity.slice(entity[1].toLowerCase() === 'x' ? 2 : 1), entity[1].toLowerCase() === 'x' ? 16 : 10));
  return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' })[entity.toLowerCase()] || match;
});
const escapeText = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const sourceText = value => translations[value] ?? wikiText(value);

// Only the sanitized output of the bundled MediaWiki parser reaches this
// function. Translations remain plain text; they cannot introduce HTML or URLs.
export function localizeWikiSourceHtml(html) {
  if (interfaceLanguage.value !== 'en') return html;
  return String(html || '').replace(/<[^>]*>|[^<]+/g, token => {
    if (token.startsWith('<')) return token.replace(/\s(title|alt|aria-label)="([^"]*)"/g, (_match, name, value) => ` ${name}="${escapeText(sourceText(decodeText(value)))}"`);
    const decoded = decodeText(token);
    const translated = sourceText(decoded);
    return translated === decoded ? token : escapeText(translated);
  });
}

export function localizeWikiSourceArticle(article) {
  if (interfaceLanguage.value !== 'en') return article;
  return {
    ...article,
    profileRows: article.profileRows.map(row => ({ ...row, label: sourceText(row.label), valueHtml: localizeWikiSourceHtml(row.valueHtml) })),
    sections: article.sections.map(section => ({ ...section, title: sourceText(section.title), html: localizeWikiSourceHtml(section.html) }))
  };
}
