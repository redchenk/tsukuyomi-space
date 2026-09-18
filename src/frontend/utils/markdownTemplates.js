export function markdownTemplates(english = false) {
  const item = (id, zh, en, source) => ({ id, label: english ? en : zh, source });
  return [
    item('table', '表格', 'Table', '| 项目 | 说明 |\n| :--- | :--- |\n| 月读空间 | 写下你的内容 |'),
    item('task', '任务清单', 'Task list', '- [ ] 待完成的事项\n- [x] 已完成的事项'),
    item('callout', '提示框', 'Callout', '::: tip 小提示\n这里可以使用 **加粗**、列表和链接。\n:::'),
    item('alert', 'GitHub 提示', 'GitHub alert', '> [!IMPORTANT]\n> 请注意这条信息。'),
    item('details', '折叠内容', 'Collapsible content', '::: details 点击展开\n这里是可折叠的正文。\n:::'),
    item('codeblock', '代码块', 'Code block', '```javascript title="example.js"\nconst message = "Hello, Tsukuyomi!";\nconsole.log(message);\n```'),
    item('math', '数学公式', 'Math formula', '$$\nE = mc^2\n$$'),
    item('footnote', '脚注', 'Footnote', '需要说明的内容[^note]\n\n[^note]: 写下补充说明或资料来源。'),
    item('gallery', '图片画廊', 'Image gallery', '::: gallery\n![图片说明](https://example.com/image-1.jpg)\n\n![图片说明](https://example.com/image-2.jpg)\n:::'),
    item('abbr', '缩写释义', 'Abbreviation', '*[SSR]: Server-Side Rendering\n\nSSR 可以让正文更早呈现。'),
    item('sub', '下标', 'Subscript', 'H~2~O'),
    item('sup', '上标', 'Superscript', 'x^2^')
  ];
}

// Continue the current list while writing; an empty item exits the list.
export function continueMarkdownList(source, start, end) {
  if (start !== end) return null;
  const lineStart = source.lastIndexOf('\n', start - 1) + 1;
  let fence = null;
  for (const previous of source.slice(0, lineStart).split('\n')) {
    const delimiter = previous.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!delimiter) continue;
    if (!fence) fence = delimiter[1];
    else if (delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length && !delimiter[2].trim()) fence = null;
  }
  if (fence) return null;
  const line = source.slice(lineStart, start);
  const match = line.match(/^(\s*)(?:([-+*])\s+(\[[ xX]\]\s+)?|(\d+)([.)])\s+|([>])\s+)(.*)$/);
  if (!match) return null;
  const [, indent, bullet, task, number, delimiter, quote, content] = match;
  if (!content.trim()) return { start: lineStart, end: start, text: '' };
  const prefix = bullet ? `${bullet} ${task ? '[ ] ' : ''}` : number ? `${Number(number) + 1}${delimiter} ` : `${quote} `;
  return { start, end, text: `\n${indent}${prefix}` };
}
