const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('vue/compiler-sfc');

const frontend = path.resolve(__dirname, '../src/frontend');
const variants = new Set('primary secondary accent quiet danger choice icon'.split(' '));
const legacy = new Set('primary-btn ghost-btn danger-btn chip filter-btn tab-btn stage-new-btn stage-page-btn icon-button site-tool-button'.split(' '));
const widgetParts = new Set('navigation disclosure row canvas media overlay tool'.split(' '));
function vueFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? vueFiles(file) : entry.name.endsWith('.vue') ? [file] : [];
  });
}
function inspect(node, file, issues) {
  if (node.tag) {
    const attr = name => node.props.find(p => p.name === name)?.value?.content;
    const role = attr('data-ui'), part = attr('data-ui-part');
    const classes = (attr('class') || '').split(/\s+/);
    const issue = message => issues.push(path.relative(frontend, file) + ':' + node.loc.start.line + ' ' + message);
    if (role !== undefined && !variants.has(role)) issue('Unknown data-ui variant: ' + role);
    if (part !== undefined && !widgetParts.has(part)) issue('Unknown data-ui-part: ' + part);
    const variant = node.tag === 'TsButton' ? attr('variant') : role;
    if (variant && !variants.has(variant)) issue('Unknown button variant: ' + variant);
    if (variant === 'icon') {
      const labelled = node.props.some(p => ['aria-label', 'aria-labelledby', 'title'].includes(p.name) ||
        ['aria-label', 'aria-labelledby', 'title'].includes(p.arg?.content));
      if (!labelled) issue('Give the icon button an accessible name.');
    }
    if ((variant || node.tag === 'TsButton') && /(?:^|;)\s*(?:background(?:-color)?|border-radius|font(?:-size)?|white-space|height)\s*:/.test(attr('style') || '')) {
      issue('Use design tokens and control variants for the button appearance.');
    }
    if (role && part) issue('Choose one control contract.');
    if (node.tag === 'button' && file !== path.join(frontend, 'components/TsButton.vue') &&
        !role && !part && !classes.some(cls => legacy.has(cls))) {
      issue('Use TsButton, a native data-ui action or a named interactive widget part.');
    }
  }
  for (const child of node.children || []) inspect(child, file, issues);
}
test('Vue controls declare a shared action or the role of a specialized widget', () => {
  const issues = [];
  for (const file of vueFiles(frontend)) {
    const result = parse(fs.readFileSync(file, 'utf8'), { filename: file });
    assert.equal(result.errors.length, 0, file);
    const ast = result.descriptor.template?.ast;
    if (!ast) continue;
    if (path.dirname(file) === path.join(frontend, 'pages')) {
      const root = ast.children.find(node => node.type === 1);
      const layout = root?.props?.find(prop => prop.name === 'data-ui-layout')?.value?.content;
      if (!['content', 'scene', 'workspace'].includes(layout)) {
        issues.push(path.basename(file) + ': declare the page layout on its root.');
      }
    }
    inspect(ast, file, issues);
  }
  assert.deepEqual(issues, []);
});
