/** Delegated actions remain valid when v-html refreshes or the router changes pages. */
export async function handleMarkdownClick(event) {
  const root = event.currentTarget;
  const chinese = document.documentElement.lang.startsWith('zh');
  const spoiler = event.target.closest?.('.markdown-spoiler');
  if (spoiler && root.contains(spoiler)) {
    const open = spoiler.getAttribute('aria-expanded') !== 'true';
    spoiler.setAttribute('aria-expanded', String(open));
    spoiler.setAttribute('aria-label', open ? `${chinese ? '点击隐藏' : 'Hide spoiler'}: ${spoiler.textContent}` : chinese ? '点击显示剧透内容' : 'Reveal spoiler');
    spoiler.firstElementChild?.setAttribute('aria-hidden', String(!open));
    return;
  }
  const button = event.target.closest?.('[data-md-copy]');
  if (!button || !root.contains(button)) return;
  const code = button.closest('.markdown-code')?.querySelector('code');
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code.textContent);
    button.textContent = chinese ? '已复制' : 'Copied';
  } catch (_) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(code);
    selection.removeAllRanges(); selection.addRange(range);
    button.textContent = chinese ? '已选中，按复制快捷键' : 'Selected — press Copy';
  }
  button.setAttribute('aria-label', button.textContent);
}
