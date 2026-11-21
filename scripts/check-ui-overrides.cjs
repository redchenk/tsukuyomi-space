// Inventory the visual declarations on public controls outside the design system.
// Each legacy exception is tied to its file, selector, property and value.
const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');
const { parse } = require('vue/compiler-sfc');

const base = path.resolve(__dirname, '../src/frontend');
const exceptions = path.resolve(__dirname, '../tests/fixtures/ui-style-exceptions.txt');
const relativeFile = file => path.relative(base, file).split(path.sep).join('/');
const legacyClasses = 'primary-btn ghost-btn danger-btn chip filter-btn tab-btn icon-button site-tool-button'.split(' ');
const components = new Set(['TsButton','TsButtonLink','TsFilterChip','TsToggle','TsIconButton']);
const properties = /^(?:color|background(?:-color|-image)?|border(?:-color|-radius)?|border-(?:start|end)-(?:start|end)-radius|font(?:-size|-weight|-family)?|(?:min-|max-)?(?:height|block-size)|white-space|text-overflow|padding(?:-inline|-block)?|--ui-(?:bg|fg|edge|action-height|control-type))$/;
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => {
    const file = path.join(dir, item.name);
    return item.isDirectory() ? files(file) : [file];
  });
}
const classes = new Set(legacyClasses);
const styles = [];
function inspectTemplate(node) {
  if (node.tag) {
    const attr = name => node.props.find(p => p.name === name)?.value?.content;
    const names = (attr('class') || '').split(/\s+/);
    if (!attr('data-ui-part') && (attr('data-ui') || components.has(node.tag) || names.some(c => legacyClasses.includes(c)))) {
      for (const name of names) if (name && !/^(?:active|compact|selected|disabled|is-.+)$/.test(name)) classes.add(name);
    }
  }
  for (const child of node.children || []) inspectTemplate(child);
}
for (const file of [...files(path.join(base, 'pages')), ...files(path.join(base, 'components'))]) {
  if (!file.endsWith('.vue')) continue;
  const { descriptor } = parse(fs.readFileSync(file, 'utf8'), { filename: file });
  if (descriptor.template?.ast) inspectTemplate(descriptor.template.ast);
  for (const style of descriptor.styles) if (style.content.trim()) styles.push([file,style.content]);
}
for (const file of files(path.join(base, 'styles'))) {
  if (file.endsWith('.css') && !relativeFile(file).startsWith('styles/jingyue/')) styles.push([file,fs.readFileSync(file,'utf8')]);
}
function controlsTarget(selector) {
  // Inspect the target compound; a button's icon and label may have their own styles.
  // Collapse functional pseudo classes before finding the last combinator.
  const simplified = selector.replace(/:(?:is|where)\(([^()]*)\)/g, ' $1').replace(/:not\([^()]*\)/g, '');
  const target = simplified.trim().split(/\s+|[>+~]/).at(-1);
  return /^(?:button|input\[type=["']?(?:button|submit))\b/.test(target) || /\[data-ui(?:\]|=)/.test(target) ||
    Array.from(target.matchAll(/\.([\w-]+)/g)).some(match => classes.has(match[1]));
}
// Ordinary page CSS can place controls freely. Register existing literal paint, radius and type values
// separately so new layouts cannot quietly introduce a new palette or typography scale.
const localScales = new Map();
function literalScale(file, declaration) {
  const { prop, value } = declaration;
  if (prop.startsWith('--')) return;
  const type = prop === 'font-size' ? 'type' : /radius$/.test(prop) ? 'radius' :
    /color|background|border|shadow|outline|^fill$|^stroke$/.test(prop) ? 'paint' : '';
  if (!type) return;
  const literal = value.replace(/url\([^)]*\)/gi, '').replace(/var\(\s*--[\w-]+/g, 'var(');
  const matches = type === 'paint'
    ? literal.match(/#[a-f0-9]{3,8}\b|(?:rgb|hsl)a?\([^)]*\)|\b(?:white|black|purple|pink|red|blue|green|yellow|orange|gray|grey)\b/gi)
    : literal.match(/(?:\d*\.)?\d+(?:px|rem|em|vw)\b|(?:\d*\.)?\d+%/g);
  if (!matches) return;
  const key = relativeFile(file) + ' | ' + type;
  if (!localScales.has(key)) localScales.set(key, new Set());
  for (const token of matches) localScales.get(key).add(token.toLowerCase().replace(/\s+/g, ' '));
}
const inventory = new Set();
for (const [file,css] of styles) {
  const sheet = postcss.parse(css,{ from:file });
  sheet.walkDecls(decl => literalScale(file, decl));
  sheet.walkRules(rule => {
    for (const selector of postcss.list.comma(rule.selector)) {
      if (!controlsTarget(selector)) continue;
      const items = rule.nodes.filter(n => n.type === 'decl' && properties.test(n.prop))
        .map(n => n.prop + ':' + n.value.replace(/\s+/g, ' ') + (n.important ? '!important' : ''));
      for (const declaration of items) inventory.add(relativeFile(file) + ' | ' + selector.replace(/\s+/g, ' ') + ' | ' + declaration);
    }
  });
}
const sorted = [...inventory].sort();
const scaleFile = path.resolve(path.dirname(exceptions), 'ui-legacy-scales.json');
const scales = Object.fromEntries([...localScales].sort(([a],[b]) => a.localeCompare(b,'en')).map(([key,values]) => [key,[...values].sort()]));
if (process.argv.includes('--list-scales')) {
  // One record per stylesheet and scale keeps the migration ledger easy to review.
  const rows = Object.entries(scales).map(([key,values]) => '  ' + JSON.stringify(key) + ': ' + JSON.stringify(values));
  process.stdout.write('{\n' + rows.join(',\n') + '\n}\n');
} else if (process.argv.includes('--list')) {
  process.stdout.write(sorted.join('\n') + '\n');
} else {
  const registered = new Set(fs.readFileSync(exceptions,'utf8').trimEnd().split('\n'));
  const added = sorted.filter(line => !registered.has(line));
  const approved = JSON.parse(fs.readFileSync(scaleFile, 'utf8'));
  for (const [key,values] of Object.entries(scales)) {
    for (const value of values) if (!approved[key]?.includes(value)) added.push(key + ' | ' + value);
  }
  if (added.length) {
    console.error('Use the shared control tokens, variants or sizes for these page styles:\n' + added.join('\n'));
    process.exitCode = 1;
  } else console.log('Checked control styles against the registered legacy declarations (' + sorted.length + ' current).');
}
