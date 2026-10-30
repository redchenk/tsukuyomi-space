import { interfaceLanguage, uiText } from '../i18n/runtime';
import english from '../data/wiki.en.json';

// This boundary accepts only bundled editorial Wiki data, never API responses,
// user drafts, model prompts or HTML. Original names and routing IDs stay exact.
const identityFields = new Set(['id', 'slug', 'kind', 'target', 'route', 'url', 'image', 'file', 'sourceArticle', 'original', 'keywords', 'relatedCharacters', 'relatedTerms', 'groups', 'category', 'imageTarget']);

export function wikiText(value) {
  const text = String(value ?? '');
  if (interfaceLanguage.value === 'en') return english[text.trim().replace(/\s+/g, ' ')] || uiText(text);
  return uiText(text);
}

export function localizeWikiData(value, field = '') {
  if (identityFields.has(field)) return value;
  if (typeof value === 'string') return wikiText(value);
  if (Array.isArray(value)) return value.map(item => localizeWikiData(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localizeWikiData(item, key)]));
  return value;
}
