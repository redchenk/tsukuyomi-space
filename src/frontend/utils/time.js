export const UTC8_TIME_ZONE = 'Asia/Shanghai';

const SQLITE_UTC_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

export function parseAppDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const source = String(value).trim();
  if (!source) return null;
  const normalized = SQLITE_UTC_PATTERN.test(source) ? `${source.replace(' ', 'T')}Z` : source;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function compareAppDate(left, right) {
  return (parseAppDate(left)?.getTime() || 0) - (parseAppDate(right)?.getTime() || 0);
}

export function formatDateTime(value, locale = 'zh-CN', options = {}) {
  const date = parseAppDate(value);
  if (!date) return value ? String(value) : '-';
  return new Intl.DateTimeFormat(locale, {
    timeZone: UTC8_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...options
  }).format(date);
}

export function formatDateOnly(value, locale = 'zh-CN', options = {}) {
  const date = parseAppDate(value);
  if (!date) return value ? String(value) : '-';
  return new Intl.DateTimeFormat(locale, {
    timeZone: UTC8_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...options
  }).format(date);
}
