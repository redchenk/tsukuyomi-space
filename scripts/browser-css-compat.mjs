import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';

// Compile the site's sRGB mixes to RGB arithmetic, including custom properties.
// Unlike a preceding fallback declaration, this survives var() substitution in
// Chromium 99. No client-side stylesheet scanning or colour recalculation.
function split(value, separator = ',') {
  let depth = 0, start = 0;
  const result = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    if (value[i] === ')') depth--;
    if (!depth && (separator === ' ' ? /\s/.test(value[i]) : value[i] === separator)) {
      if (value.slice(start, i).trim()) result.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (value.slice(start).trim()) result.push(value.slice(start).trim());
  return result;
}
const number = value => String(Math.round(Number(value) * 1e8) / 1e8);
const calc = value => `calc(${value})`;
const multiply = (a, b) => a === '0' || b === '0' ? '0' : a === '1' ? b : b === '1' ? a : !isNaN(a) && !isNaN(b) ? number(Number(a) * Number(b)) : calc(`${a} * ${b}`);
const sum = (a, b) => a === '0' ? b : b === '0' ? a : !isNaN(a) && !isNaN(b) ? number(Number(a) + Number(b)) : calc(`${a} + ${b}`);
const suffixes = ['r', 'g', 'b', 'a'];
export function colorChannels(value, needed = new Set()) {
  value = value.trim();
  if (/^var\(/.test(value)) {
    const [name, fallback] = split(value.slice(4, -1));
    needed.add(name);
    const channels = fallback ? colorChannels(fallback, needed) : null;
    return suffixes.map((suffix, i) => `var(${name}-${suffix}${channels ? ', ' + channels[i] : ''})`);
  }
  if (/^color-mix\(/.test(value)) {
    const [space, first, second] = split(value.slice(10, -1));
    if (space !== 'in srgb' || !second) throw new Error(`Unsupported colour mix: ${value}`);
    const part = text => {
      const pieces = split(text, ' ');
      const weight = pieces.length > 1 && /%$/.test(pieces.at(-1)) ? parseFloat(pieces.pop()) / 100 : null;
      return [colorChannels(pieces.join(' '), needed), weight];
    };
    const [a, wa] = part(first), [b, wb] = part(second);
    const left = wa ?? (wb == null ? .5 : 1 - wb), right = wb ?? (1 - left);
    const total = left + right;
    if (total <= 0) throw new Error(`Empty colour mix: ${value}`);
    const aw = multiply(a[3], number(left / total)), bw = multiply(b[3], number(right / total));
    const alpha = sum(aw, bw);
    const channels = a.slice(0, 3).map((c, i) => {
      if (aw === '0') return b[i];
      if (bw === '0') return c;
      const weighted = sum(multiply(c, aw), multiply(b[i], bw));
      return alpha === '1' ? weighted : calc(`${weighted} / max(${alpha}, 0.000001)`);
    });
    return [...channels, multiply(alpha, number(Math.min(1, total)))];
  }
  const names = { transparent: '#0000', white: '#fff', black: '#000', red: '#f00', blue: '#00f' };
  value = names[value.toLowerCase()] || value;
  if (/^#[\da-f]{3,8}$/i.test(value)) {
    let hex = value.slice(1);
    if (hex.length <= 4) hex = [...hex].map(c => c + c).join('');
    if (![6, 8].includes(hex.length)) throw new Error(`Invalid colour: ${value}`);
    return [0, 2, 4].map(i => String(parseInt(hex.slice(i, i + 2), 16))).concat(number(hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1));
  }
  if (/^rgba?\(/.test(value)) {
    const body = value.slice(value.indexOf('(') + 1, -1);
    const parts = body.includes(',') ? split(body) : split(body.replace('/', ' '), ' ');
    if (parts.length < 3 || parts.some(p => !/^[\d.]+%?$/.test(p))) throw new Error(`Unsupported RGB colour: ${value}`);
    return parts.slice(0, 3).map(p => number(parseFloat(p) * (p.endsWith('%') ? 2.55 : 1))).concat(parts[3] ? number(parseFloat(parts[3]) / (parts[3].endsWith('%') ? 100 : 1)) : '1');
  }
  throw new Error(`Colour needs an explicit RGB compatibility value: ${value}`);
}
export function lowerColorMix(value, needed = new Set()) {
  let start;
  while ((start = value.indexOf('color-mix(')) !== -1) {
    let depth = 1, end = start + 10;
    while (depth && end < value.length) {
      if (value[end] === '(') depth++;
      if (value[end] === ')') depth--;
      end++;
    }
    const c = colorChannels(value.slice(start, end), needed);
    value = value.slice(0, start) + `rgb(${c[0]} ${c[1]} ${c[2]} / ${c[3]})` + value.slice(end);
  }
  return value;
}
function sourceCss(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'runtime' || entry.name === 'assets' ? [] : sourceCss(path);
    if (!/\.(css|vue)$/.test(entry.name)) return [];
    const content = readFileSync(path, 'utf8');
    return entry.name.endsWith('.css') ? [content] : [...content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]);
  });
}
export function browserCssCompat(projectRoot) {
  const needed = new Set();
  const declarations = [];
  for (const source of [...sourceCss(join(projectRoot, 'src/frontend')), ...sourceCss(join(projectRoot, 'assets/css/vue'))]) {
    postcss.parse(source).walkDecls(decl => {
      declarations.push(decl);
      if (decl.value.includes('color-mix(')) lowerColorMix(decl.value, needed);
    });
  }
  // Follow aliases across route chunks so the token sheet supplies every channel.
  let size;
  do {
    size = needed.size;
    for (const decl of declarations) if (needed.has(decl.prop)) colorChannels(decl.value, needed);
  } while (size !== needed.size);
  return {
    postcssPlugin: 'tsukuyomi-browser-css-compat',
    Once(root) {
      root.walkDecls(decl => {
        if (needed.has(decl.prop)) {
          colorChannels(decl.value).forEach((value, i) => decl.cloneBefore({ prop: `${decl.prop}-${suffixes[i]}`, value }));
        }
        if (decl.value.includes('color-mix(')) decl.value = lowerColorMix(decl.value);
        // All dynamic units have a shared, JS-updated fallback, including those
        // inside var() where an ordinary preceding declaration cannot help.
        if (!/^--ts-[dsl]vh$/.test(decl.prop) && /\b[\d.]+[dsl]vh\b/.test(decl.value)) {
          decl.value = decl.value.replace(/([\d.]+)([dsl])vh\b/g, (_, n, kind) => `calc(var(--ts-${kind}vh, 1vh) * ${n})`);
        }
      });
    }
  };
}
