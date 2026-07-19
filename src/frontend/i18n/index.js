import { i18n } from './messages.js';

export { i18n };

export const DEFAULT_LANGUAGE = 'zh';
export const SUPPORTED_LANGUAGES = Object.freeze(['zh', 'ja']);

export function normalizeLanguage(value) {
  const language = String(value || '').trim().toLowerCase().split('-')[0];
  return SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
}

export function documentLanguage(value) {
  return normalizeLanguage(value) === 'ja' ? 'ja' : 'zh-CN';
}

export function alternateLanguage(value) {
  return normalizeLanguage(value) === 'zh' ? 'ja' : 'zh';
}
