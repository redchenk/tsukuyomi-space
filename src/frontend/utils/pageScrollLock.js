// Keep the document in normal flow: fixing <body> resets scrollY and removing
// the scrollbar changes the width of every centered/fixed element.
export function lockPageScroll(shouldRestore = () => true) {
  const root = document.documentElement;
  const body = document.body;
  const x = window.scrollX;
  const y = window.scrollY;
  const styles = [[root, 'overflow'], [root, 'scrollbar-gutter'], [body, 'overflow']]
    .map(([element, key]) => [element, key, element.style.getPropertyValue(key), element.style.getPropertyPriority(key)]);
  if (window.innerWidth > root.clientWidth && !getComputedStyle(root).scrollbarGutter.includes('stable')) {
    root.style.setProperty('scrollbar-gutter', 'stable');
  }
  root.style.setProperty('overflow', 'hidden');
  body.style.setProperty('overflow', 'hidden');
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const [element, key, value, priority] of styles) {
      if (value) element.style.setProperty(key, value, priority);
      else element.style.removeProperty(key);
    }
    if (shouldRestore() && (window.scrollX !== x || window.scrollY !== y)) window.scrollTo({ left: x, top: y, behavior: 'instant' });
  };
}
