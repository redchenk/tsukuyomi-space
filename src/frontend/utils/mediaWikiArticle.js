import { findSourceMedia } from '../data/sourceMediaAssets';

const internalRoutes = new Map([
  ['超时空辉夜姬！', '/wiki'],
  ['辉夜', '/wiki/characters/kaguya'],
  ['辉夜(超时空辉夜姬！)', '/wiki/characters/kaguya'],
  ['酒寄彩叶', '/wiki/characters/iroha'],
  ['月见八千代', '/wiki/characters/yachiyo'],
  ['酒寄朝日', '/wiki/characters/akira'],
  ['帝明', '/wiki/characters/akira'],
  ['驹泽雷', '/wiki/characters/rai'],
  ['驹泽乃依', '/wiki/characters/noi'],
  ['绫䌷芦花', '/wiki/characters/roka'],
  ['谏山真实', '/wiki/characters/mami'],
  ['海兔FUSHI', '/wiki/characters/fushi'],
  ['狗狗DOGE', '/wiki/characters/doge'],
  ['Remember(超时空辉夜姬！)', '/wiki/terms/remember'],
  ['Reply(超时空辉夜姬！)', '/wiki/terms/reply'],
  ['竹取物语', '/wiki/terms/taketori'],
  ['八千代杯', '/wiki/terms/yachiyo-cup'],
  ['合战', '/wiki/terms/kassen'],
  ['KASSEN', '/wiki/terms/kassen'],
  ['黑玛瑙', '/wiki/terms/black-onyx'],
  ['Black onyX', '/wiki/terms/black-onyx'],
  ['月夜见', '/wiki/terms/tsukuyomi'],
  ['月读空间', '/wiki/terms/tsukuyomi']
]);

const sectionIds = {
  简介: 'source-intro',
  经历: 'source-experience',
  角色相关逸事: 'source-trivia',
  注释及外部链接: 'source-notes'
};

const escapeHtml = (value = '') => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function splitTemplateArgs(value) {
  const parts = [];
  let start = 0;
  let templateDepth = 0;
  let linkDepth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const pair = value.slice(index, index + 2);
    if (pair === '{{') { templateDepth += 1; index += 1; continue; }
    if (pair === '}}') { templateDepth = Math.max(0, templateDepth - 1); index += 1; continue; }
    if (pair === '[[') { linkDepth += 1; index += 1; continue; }
    if (pair === ']]') { linkDepth = Math.max(0, linkDepth - 1); index += 1; continue; }
    if (value[index] === '|' && templateDepth === 0 && linkDepth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function renderTemplate(body) {
  const [rawName = '', ...rawArgs] = splitTemplateArgs(body);
  const name = rawName.trim();
  const args = rawArgs.map((item) => item.trim());
  if (name === '黑幕') return `<span class="wiki-source-blackout" tabindex="0" title="你知道的太多了">${args.join('｜')}</span>`;
  if (name === '萌点') return `<span class="wiki-source-traits">${args.join('、').replaceAll(',', '、')}</span>`;
  if (name === 'jpn') return args.filter((_item, index) => index % 2 === 0).join('');
  if (name === 'ruby' || name === '发色' || name === '瞳色' || name === '胡话') return args[0] || '';
  if (name === 'color') return args.at(-1) || '';
  if (name === '星座') return '';
  if (name === '声优' || name === 'Lang-ja') return args[0] || '';
  if (name === '=') return '=';
  if (name === '剧透提醒') return '<strong>以下内容包含完整剧情剧透</strong>';
  if (name === '超时空辉夜姬') return '<span class="wiki-source-template-note">超时空辉夜姬系列条目</span>';
  if (name === 'table') {
    return args.filter((item) => item && !/^style=/.test(item) && !/^-$/.test(item)).join(' ');
  }
  if (name === 'NoteTA' || name === '标题格式化' || name === 'About' || name === '欢迎编辑' || name === '生日祝福' || name === 'tabs' || name === 'Infobox3') return '';
  return args.filter((item) => item && !item.includes('=')).join('、');
}

function replaceTemplates(value) {
  let result = value;
  for (let pass = 0; pass < 80; pass += 1) {
    let changed = false;
    result = result.replace(/\{\{([^{}]*)\}\}/g, (_match, body) => {
      changed = true;
      return renderTemplate(body);
    });
    if (!changed) break;
  }
  return result;
}

function extractMediaLinks(rawValue) {
  const media = [];
  let value = '';
  let cursor = 0;

  while (cursor < rawValue.length) {
    const match = rawValue.slice(cursor).match(/\[\[(?:File|文件):/i);
    if (!match) {
      value += rawValue.slice(cursor);
      break;
    }

    const start = cursor + match.index;
    value += rawValue.slice(cursor, start);
    let depth = 0;
    let end = -1;
    for (let index = start; index < rawValue.length - 1; index += 1) {
      const pair = rawValue.slice(index, index + 2);
      if (pair === '[[') { depth += 1; index += 1; continue; }
      if (pair === ']]') {
        depth -= 1;
        if (depth === 0) { end = index + 2; break; }
        index += 1;
      }
    }

    if (end < 0) {
      value += rawValue.slice(start);
      break;
    }

    const body = rawValue.slice(start + 2, end - 2).replace(/^(?:File|文件):/i, '');
    const token = `KAGUYA_MEDIA_${media.length}_TOKEN`;
    media.push({ token, body });
    value += token;
    cursor = end;
  }

  return { value, media };
}

function mediaPlaceholder(body) {
  const [filename = '', ...options] = splitTemplateArgs(body).map((item) => item.trim()).filter(Boolean);
  const ignored = /^(?:缩略图|右|左|居中|无框|\d+px|alt=|link=)/i;
  const captions = options.filter((item) => !ignored.test(item));
  const caption = captions.at(-1) || '源条目图片';
  const alignment = options.includes('右') ? ' wiki-source-media-float-right' : options.includes('左') ? ' wiki-source-media-float-left' : '';
  const width = options.find((item) => /^\d+px$/i.test(item))?.match(/^\d+/)?.[0];
  const style = width ? ` style="--source-media-width:${width}px"` : '';
  const image = findSourceMedia(filename);
  const media = image
    ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(filename.replace(/\.[^.]+$/, ''))}" loading="lazy" decoding="async">`
    : `<div><span>图片预留</span><code>${escapeHtml(filename)}</code></div>`;
  return `<figure class="wiki-source-media-slot${image ? ' wiki-source-media-resolved' : ''}${alignment}"${style}>
    ${media}
    <figcaption>${formatInline(caption)}</figcaption>
  </figure>`;
}

function wikiLink(body) {
  const [target = '', label = target] = body.split('|').map((item) => item.trim());
  if (target.startsWith('File:') || target.startsWith('文件:')) return mediaPlaceholder(target.replace(/^(?:File|文件):/i, ''));
  if (target.startsWith('分类:')) return `<span class="wiki-source-category">${escapeHtml(target)}</span>`;
  const route = internalRoutes.get(target);
  if (route) return `<a class="wiki-source-link" href="${route}">${escapeHtml(label)}</a>`;
  const external = `https://zh.moegirl.org.cn/${encodeURIComponent(target)}`;
  return `<a class="wiki-source-link" href="${external}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function formatInline(rawValue) {
  const { value: valueWithoutMedia, media } = extractMediaLinks(rawValue.trim());
  let value = escapeHtml(valueWithoutMedia);
  value = replaceTemplates(value);
  value = value.replace(/\[\[([\s\S]*?)\]\]/g, (_match, body) => wikiLink(body));
  value = value.replace(/'''([\s\S]*?)'''/g, '<strong>$1</strong>');
  value = value.replace(/''([\s\S]*?)''/g, '<em>$1</em>');
  value = value.replace(/&lt;ref&gt;([\s\S]*?)&lt;\/ref&gt;/gi, '<sup class="wiki-source-reference">注：$1</sup>');
  value = value.replace(/&lt;references\s*\/&gt;/gi, '<span class="wiki-source-reference-list">注释已随正文保留。</span>');
  value = value.replace(/&lt;(\/?)del&gt;/gi, '<$1del>');
  value = value.replace(/&lt;(\/?)big&gt;/gi, '<$1big>');
  value = value.replace(/&lt;nowiki&gt;([\s\S]*?)&lt;\/nowiki&gt;/gi, '$1');
  value = value.replace(/&lt;\/?poem&gt;/gi, '');
  value = value.replace(/&lt;br\s*\/??&gt;/gi, '<br>');
  media.forEach(({ token, body }) => {
    value = value.replaceAll(token, mediaPlaceholder(body));
  });
  return value;
}

function findTemplateEnd(value, start) {
  let depth = 0;
  for (let index = start; index < value.length - 1; index += 1) {
    const pair = value.slice(index, index + 2);
    if (pair === '{{') { depth += 1; index += 1; continue; }
    if (pair === '}}') {
      depth -= 1;
      if (depth === 0) return index + 2;
      index += 1;
    }
  }
  return -1;
}

function extractHideTemplates(rawValue) {
  let value = rawValue;
  const hides = [];
  while (true) {
    const start = value.indexOf('{{Hide|');
    if (start < 0) break;
    const end = findTemplateEnd(value, start);
    if (end < 0) break;
    const body = value.slice(start + '{{Hide|'.length, end - 2);
    const [summary = '展开隐藏内容', ...contentParts] = splitTemplateArgs(body);
    const token = `KAGUYA_HIDE_${hides.length}_TOKEN`;
    hides.push({ token, summary, content: contentParts.join('|') });
    value = `${value.slice(0, start)}${token}${value.slice(end)}`;
  }
  return { value, hides };
}

function unwrapTableTemplates(rawValue) {
  let value = rawValue;
  while (true) {
    const start = value.indexOf('{{table|');
    if (start < 0) break;
    const end = findTemplateEnd(value, start);
    if (end < 0) break;
    const body = value.slice(start + '{{table|'.length, end - 2);
    const content = splitTemplateArgs(body)
      .filter((item) => item.trim() && !/^\s*style=/.test(item))
      .join('\n');
    value = `${value.slice(0, start)}${content}${value.slice(end)}`;
  }
  return value;
}

function renderQuote(line) {
  const body = line.slice('{{Cquote|'.length, line.lastIndexOf('}}'));
  const [quote = ''] = splitTemplateArgs(body);
  return `<blockquote class="wiki-source-quote">${formatInline(quote)}</blockquote>`;
}

function renderBlocks(rawValue) {
  const { value: hiddenValue, hides } = extractHideTemplates(rawValue);
  const value = unwrapTableTemplates(hiddenValue);
  const hideByToken = new Map(hides.map((item) => [item.token, item]));
  const lines = value.replace(/\r/g, '').split('\n');
  const output = [];
  let listOpen = false;
  let centerOpen = false;
  let mediaGroupOpen = false;

  const closeList = () => {
    if (!listOpen) return;
    output.push('</ul>');
    listOpen = false;
  };

  const closeMediaGroup = () => {
    if (!mediaGroupOpen) return;
    output.push('</div>');
    mediaGroupOpen = false;
  };

  const openMediaGroup = (centered = false) => {
    if (mediaGroupOpen) return;
    output.push(`<div class="wiki-source-media-grid${centered ? ' wiki-source-media-center' : ''}">`);
    mediaGroupOpen = true;
  };

  lines.forEach((rawLine) => {
    let line = rawLine.trim();
    if (!line) { closeList(); if (!centerOpen) closeMediaGroup(); return; }
    if (/^<\/?poem>$/i.test(line)) return;
    if (/^<center>$/i.test(line)) { closeList(); closeMediaGroup(); centerOpen = true; openMediaGroup(true); return; }
    if (/^<\/center>$/i.test(line)) { closeList(); closeMediaGroup(); centerOpen = false; return; }
    if (/^\{\|/.test(line) || /^\|-/.test(line) || /^\|\}$/.test(line)) return;
    if (/^\|\s*colspan/.test(line)) line = line.replace(/^\|[^|]*\|\s*/, '');
    else if (line.startsWith('| ')) line = line.slice(2);

    const hide = hideByToken.get(line);
    if (hide) {
      closeList();
      closeMediaGroup();
      output.push(`<details class="wiki-source-hide"><summary>${formatInline(hide.summary)}</summary><div>${renderBlocks(hide.content)}</div></details>`);
      return;
    }
    if (line.startsWith('{{Cquote|')) {
      closeList();
      closeMediaGroup();
      output.push(renderQuote(line));
      return;
    }
    if (line === '{{剧透提醒}}') {
      closeList();
      closeMediaGroup();
      output.push('<div class="wiki-source-spoiler-warning"><strong>剧透提醒</strong><span>以下内容包含作品完整剧情与结局。</span></div>');
      return;
    }
    if (line.startsWith('*')) {
      closeMediaGroup();
      if (!listOpen) { output.push('<ul class="wiki-source-list">'); listOpen = true; }
      output.push(`<li>${formatInline(line.replace(/^\*+\s*/, ''))}</li>`);
      return;
    }

    closeList();
    const formatted = formatInline(line);
    if (!formatted) return;
    if (formatted.includes('wiki-source-media-slot')) {
      const floated = formatted.includes('wiki-source-media-float-');
      if (floated && !centerOpen) { closeMediaGroup(); output.push(formatted); }
      else { openMediaGroup(centerOpen); output.push(formatted); }
    } else {
      closeMediaGroup();
      output.push(`<p>${formatted}</p>`);
    }
  });
  closeList();
  closeMediaGroup();
  return output.join('\n');
}

function extractInfoboxRows(source, prependedRows = []) {
  const start = source.indexOf('{{Infobox3');
  const end = start >= 0 ? findTemplateEnd(source, start) : -1;
  if (start < 0 || end < 0) return [];
  const rows = [...prependedRows];
  source.slice(start, end).replace(/\r/g, '').split('\n').forEach((line) => {
    const match = line.match(/^\|([^:]+)::([\s\S]*)$/);
    if (!match) return;
    const rawLabel = match[1].trim();
    const rawValue = match[2].trim();
    if (rawLabel.startsWith('-横栏')) rows.push({ label: rawValue, valueHtml: '', group: true });
    else rows.push({ label: rawLabel.replace(/^_/, ''), valueHtml: formatInline(rawValue), group: false });
  });
  return rows;
}

export function parseMediaWikiArticle(source, options = {}) {
  const articleStart = source.indexOf('{{Cquote|');
  const infoboxStart = source.indexOf('{{Infobox3');
  const infoboxEnd = infoboxStart >= 0 ? findTemplateEnd(source, infoboxStart) : -1;
  const contentStart = articleStart >= 0 ? articleStart : infoboxEnd >= 0 ? infoboxEnd : 0;
  const article = source.slice(contentStart).replaceAll('{{超时空辉夜姬}}', '');
  const heading = /^==\s*(.+?)\s*==\s*$/gm;
  const matches = [...article.matchAll(heading)];
  const sections = [];
  if (matches.length) {
    sections.push({ id: 'source-lead', title: '条目引言', html: renderBlocks(article.slice(0, matches[0].index)) });
  }
  matches.forEach((match, index) => {
    const title = match[1].trim();
    const contentStart = match.index + match[0].length;
    const contentEnd = matches[index + 1]?.index ?? article.length;
    sections.push({ id: sectionIds[title] || `source-section-${index + 1}`, title, html: renderBlocks(article.slice(contentStart, contentEnd)) });
  });
  return { profileRows: extractInfoboxRows(source, options.prependedProfileRows), sections };
}

export function parseKaguyaMediaWiki(source) {
  return parseMediaWikiArticle(source, {
    prependedProfileRows: [{ label: '地区译名', valueHtml: '简体中文：辉夜<br>繁体中文：輝耀', group: false }]
  });
}
