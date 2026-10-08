const { parse, babelParse } = require('@vue/compiler-sfc');
const { parse: parseTemplate } = require('@vue/compiler-dom');

const CHINESE = /[\u3400-\u9fff]/u;
const KANA = /[\u3040-\u30ff]/u;
const DISPLAY_ATTRIBUTES = new Set(['title', 'alt', 'placeholder', 'aria-label', 'aria-description', 'label', 'description', 'hint', 'empty-text', 'item-label']);
const DISPLAY_PROPERTIES = /^(?:label|title|subtitle|description|desc|hint|detail|caption|keywords|badge|empty|emptyHint|emptyTitle|loadingText|nameLabel|actionLabel|statusLabel|tooltip)$/;
const MESSAGE_CALLS = /^(?:Error|alert|confirm|prompt|showToast|showModelSaveNotice|openTestDialog|setToast|showMessage|setMessage|notify|announce|toast|error|success|warn)$/;
const MESSAGE_TARGET = /(?:message|error|toast|notice|hint|status|progressText|loadingText|feedback|tip|summaryStatus|catalogStatus)/i;

function walk(node, visit, parents = []) {
  if (!node || typeof node !== 'object') return;
  visit(node, parents);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'comments', 'tokens', 'extra', 'errors'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit, [node, ...parents]));
    else if (value && typeof value === 'object' && typeof value.type === 'string') walk(value, visit, [node, ...parents]);
  }
}

function humanText(value) { return CHINESE.test(value) && !KANA.test(value) && !/^\//.test(value.trim()); }
function literalSource(node) {
  if (node.type === 'StringLiteral') return { source: node.value, parameters: [] };
  if (node.type === 'TemplateLiteral') return {
    source: node.quasis.map((part, index) => (part.value.cooked ?? part.value.raw) + (index < node.expressions.length ? `{${index}}` : '')).join(''),
    parameters: node.expressions
  };
  return null;
}
function propertyName(node) { return node?.name || node?.value || ''; }
function targetName(node) {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') return targetName(node.object) + '.' + propertyName(node.property);
  return '';
}
function isDataLiteral(node, parents) {
  // Chinese values can be protocol tokens or data comparison operands too.
  // Only displayed alternatives are localized, never their branch conditions.
  return parents.some(parent =>
    (parent.type === 'BinaryExpression' && /^(?:===|!==|==|!=|<|>|<=|>=|in|instanceof)$/.test(parent.operator))
    || (parent.type === 'ConditionalExpression' && node.start >= parent.test.start && node.end <= parent.test.end)
    || (parent.type === 'MemberExpression' && node.start >= parent.property.start && node.end <= parent.property.end)
    || (parent.type === 'CallExpression' && !/^(?:t|uiText|\$ui)$/.test(targetName(parent.callee)))
  );
}

// Only author-supplied UI text is transformed. Data bindings, form values,
// API IDs, URLs, user content and AI prompts never go through this compiler.
function transformInterface(source, filename) {
  const edits = [], entries = new Set();
  let needsScriptImport = false;
  const add = (start, end, replacement, text) => {
    edits.push({ start, end, replacement });
    if (text) entries.add(text);
  };
  const encodeLiteral = (node, code, fn) => {
    const value = literalSource(node);
    if (!value || !humanText(value.source)) return code.slice(node.start, node.end);
    entries.add(value.source);
    const args = value.parameters.map(parameter => {
      let text = code.slice(parameter.start, parameter.end);
      const nested = [];
      walk(parameter, (child, parents) => {
        if (parents.some(parent => ['TemplateLiteral', 'StringLiteral'].includes(parent.type))) return;
        if (isDataLiteral(child, parents)) return;
        const parent = parents[0];
        if (parent?.type === 'ObjectProperty' && parent.key === child) return;
        if (parent?.type === 'MemberExpression' && parent.property === child) return;
        const literal = literalSource(child);
        if (literal && humanText(literal.source)) nested.push({ start: child.start - parameter.start, end: child.end - parameter.start, replacement: encodeLiteral(child, code, fn) });
      });
      for (const edit of nested.sort((a,b) => b.start-a.start)) text=text.slice(0,edit.start)+edit.replacement+text.slice(edit.end);
      return text;
    });
    return `${fn}(${JSON.stringify(value.source)}${args.length ? ', [' + args.join(', ') + ']' : ''})`;
  };
  const wrapLiteral = (node, code, offset, fn, attribute = false) => {
    const value = literalSource(node);
    if (!value || !humanText(value.source)) return;
    let replacement = encodeLiteral(node, code, fn);
    if (attribute) replacement = replacement.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    add(offset + node.start, offset + node.end, replacement, value.source);
  };
  const expression = (code, offset, attribute = false) => {
    let ast;
    try { ast = babelParse('(' + code + ')', { sourceType: 'module', plugins: ['typescript'] }); }
    catch (_) { return; }
    walk(ast, (node, parents) => {
      if (parents.some(parent => ['StringLiteral', 'TemplateLiteral'].includes(parent.type))) return;
      if (isDataLiteral(node, parents)) return;
      // Do not turn a property name (or a data lookup key) into a function call.
      const parent = parents[0];
      if (parent?.type === 'ObjectProperty' && parent.key === node && !parent.computed) return;
      if (parent?.type === 'MemberExpression' && parent.property === node) return;
      wrapLiteral(node, '(' + code + ')', offset - 1, '$ui', attribute);
    });
  };
  const script = (code, offset, module = false) => {
    const ast = babelParse(code, { sourceType: 'module', plugins: ['typescript'] });
    walk(ast, (node, parents) => {
      const value = literalSource(node);
      if (!value || !humanText(value.source) || parents.some(parent => ['TemplateLiteral', 'StringLiteral'].includes(parent.type))) return;
      if (parents.some(parent => parent.type === 'BinaryExpression' && /^(?:===|!==|==|!=|<|>|<=|>=|in|instanceof)$/.test(parent.operator))) return;
      const parent = parents[0];
      if (parent?.type === 'ObjectProperty' && parent.key === node) return;
      if (parents.some(parent => ['CallExpression', 'NewExpression'].includes(parent.type) && /^(?:uiText|\$ui)$/.test(targetName(parent.callee)))) return;
      const property = parent?.type === 'ObjectProperty' && parent.value === node && DISPLAY_PROPERTIES.test(propertyName(parent.key));
      const call = parents.find(parent => ['CallExpression', 'NewExpression'].includes(parent.type));
      const isMessageCall = call && MESSAGE_CALLS.test(targetName(call.callee).split('.').pop());
      const assignment = parents.find(parent => parent.type === 'AssignmentExpression');
      const isMessageAssignment = assignment && MESSAGE_TARGET.test(targetName(assignment.left));
      const returning = !module && (parent?.type === 'ReturnStatement' || parent?.type === 'ConditionalExpression');
      // Return values in component functions are displayed UI labels; skip
      // protocol/prompt builders explicitly, including their nested callbacks.
      const functionNode = parents.find(parent => /Function/.test(parent.type));
      const functionName = functionNode?.id?.name || parents.find(parent => parent.type === 'VariableDeclarator')?.id?.name || '';
      const unsafeFunction = /prompt|payload|instruction|request|markdown|fileName|serialize|export|knowledge|persona|archive|context/i.test(functionName);
      const callArguments = call && /^(?:t|copyText|text|uiText)$/.test(targetName(call.callee));
      if (unsafeFunction && !isMessageCall && !isMessageAssignment) return;
      if (!(property || isMessageCall || isMessageAssignment || (returning && !unsafeFunction) || callArguments)) return;
      needsScriptImport = true;
      if (property && !value.parameters.length && parent.shorthand === false && !parent.computed) {
        add(offset + parent.start, offset + parent.end, `get ${code.slice(parent.key.start, parent.key.end)}() { return uiText(${JSON.stringify(value.source)}); }`, value.source);
      } else wrapLiteral(node, code, offset, 'uiText');
    });
  };
  if (filename.endsWith('.vue')) {
    const { descriptor, errors } = parse(source, { filename });
    if (errors.length) throw errors[0];
    if (descriptor.template) {
      const template = descriptor.template;
      const root = parseTemplate(template.content);
      function visit(node, excluded = false) {
        excluded ||= node.type === 1 && ['script', 'style', 'code', 'pre'].includes(node.tag);
        if (excluded) return;
        if (node.type === 2 && humanText(node.content)) {
          const trimmed = node.content.trim();
          if (trimmed) add(template.loc.start.offset + node.loc.start.offset, template.loc.start.offset + node.loc.end.offset,
            '{{ $ui(' + JSON.stringify(node.content).replaceAll('<', '\\u003c') + ') }}', node.content);
        }
        if (node.type === 5) expression(node.content.content, template.loc.start.offset + node.content.loc.start.offset);
        if (node.type === 1) for (const prop of node.props) {
          if (prop.type === 6 && prop.value && DISPLAY_ATTRIBUTES.has(prop.name) && humanText(prop.value.content)) {
            add(template.loc.start.offset + prop.loc.start.offset, template.loc.start.offset + prop.loc.end.offset,
              ':' + prop.name + '="$ui(' + JSON.stringify(prop.value.content).replaceAll('&', '&amp;').replaceAll('"', '&quot;') + ')"', prop.value.content);
          }
          if (prop.type === 7 && prop.exp && prop.name === 'bind' && DISPLAY_ATTRIBUTES.has(prop.arg?.content)) {
            expression(prop.exp.content, template.loc.start.offset + prop.exp.loc.start.offset, true);
          }
        }
        if (node.type !== 1 || node.tag !== 'textarea') for (const child of node.children || []) visit(child, excluded);
      }
      visit(root);
    }
    for (const block of [descriptor.script, descriptor.scriptSetup]) if (block) script(block.content, block.loc.start.offset);
    if (needsScriptImport) {
      const block = descriptor.scriptSetup || descriptor.script;
      if (block && !/import\s*\{[^}]*\buiText\b/.test(block.content)) add(block.loc.start.offset, block.loc.start.offset, "\nimport { uiText } from '@frontend/i18n/runtime.js';\n");
    }
  }
  if (/\.(?:js|mjs)$/.test(filename)) {
    script(source, 0, true);
    if (needsScriptImport && !/import\s*\{[^}]*\buiText\b/.test(source)) add(0, 0, "import { uiText } from '@frontend/i18n/runtime.js';\n");
  }
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let end = Infinity, output = source;
  for (const edit of edits) {
    if (edit.end > end) continue; // A getter/call owns its nested expression.
    output = output.slice(0, edit.start) + edit.replacement + output.slice(edit.end);
    end = edit.start;
  }
  return { code: output, entries: [...entries], changed: edits.length > 0 };
}

module.exports = { transformInterface, walk, literalSource, humanText };
