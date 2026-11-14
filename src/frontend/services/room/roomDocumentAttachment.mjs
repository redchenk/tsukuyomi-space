// Text documents travel inside the user's own message. History, retries,
// edits, sharing, the diary and the model therefore all see the same turn,
// without a second storage format. The panel renders the block as a file card.

const HEADER_OPEN = '【附件文件：';
const HEADER_CLOSE = '】';
const FENCE = '`````';
const DOCUMENT_PATTERN = new RegExp(`(?:^|\\n\\n)${HEADER_OPEN}([^\\n${HEADER_CLOSE}]{1,240})${HEADER_CLOSE}([^\\n]*)\\n${FENCE}\\n([\\s\\S]*?)\\n${FENCE}\\s*$`, 'u');

export const DOCUMENT_MAX_BYTES = 1024 * 1024;
export const DOCUMENT_MAX_CHARS = 16000;

const TEXT_EXTENSIONS = [
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'log', 'yaml', 'yml', 'xml', 'html', 'htm',
  'srt', 'vtt', 'ini', 'toml', 'conf', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'vue', 'py', 'java',
  'kt', 'go', 'rs', 'c', 'h', 'cpp', 'hpp', 'cs', 'rb', 'php', 'sh', 'sql', 'css', 'scss', 'lua'
];

// No image types here: the image picker owns those, and keeping the two inputs
// apart keeps `input[accept*="image"]` unambiguous.
export const DOCUMENT_ACCEPT = [...TEXT_EXTENSIONS.map(extension => `.${extension}`), 'text/plain', 'text/markdown', 'text/csv', 'application/json'].join(',');

function extensionOf(name) {
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(String(name || ''));
  return match ? match[1].toLowerCase() : '';
}

export function isDocumentFile(file) {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  if (type.startsWith('image/')) return false;
  return type.startsWith('text/') || /(?:json|xml|yaml|javascript|typescript|x-sh|x-python)/.test(type) || TEXT_EXTENSIONS.includes(extensionOf(file.name));
}

function cleanDocumentName(name) {
  const cleaned = String(name || '').replace(/[\r\n【】]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return cleaned || 'document.txt';
}

export async function readDocumentFile(file) {
  if (!isDocumentFile(file)) throw new Error('暂时只支持文本类文件，例如 txt、md、csv、json 或代码文件');
  if (file.size > DOCUMENT_MAX_BYTES) throw new Error('文件超过 1 MB，请删减后再上传');
  const raw = await file.text();
  if (raw.slice(0, 4000).includes('\u0000')) throw new Error('这个文件看起来不是纯文本，暂时无法读取');
  const content = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  if (!content) throw new Error('这个文件是空的');
  const truncated = content.length > DOCUMENT_MAX_CHARS;
  return {
    name: cleanDocumentName(file.name),
    size: file.size,
    chars: content.length,
    truncated,
    content: truncated ? content.slice(0, DOCUMENT_MAX_CHARS) : content
  };
}

export function composeDocumentMessage(message, attachment) {
  if (!attachment?.content) return String(message || '');
  const note = attachment.truncated ? `（原文 ${attachment.chars} 字，只附上前 ${attachment.content.length} 字）` : '';
  const block = `${HEADER_OPEN}${cleanDocumentName(attachment.name)}${HEADER_CLOSE}${note}\n${FENCE}\n${attachment.content}\n${FENCE}`;
  return [String(message || '').trim(), block].filter(Boolean).join('\n\n');
}

export function splitDocumentMessage(content) {
  const source = String(content || '');
  const match = DOCUMENT_PATTERN.exec(source);
  if (!match) return { text: source, attachment: null };
  return {
    text: source.slice(0, match.index).trim(),
    attachment: { name: match[1].trim(), truncated: Boolean(match[2].trim()), content: match[3], chars: match[3].length }
  };
}

export function formatFileSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10240 ? 1 : 0)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
