import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

/** Index the sanitized, rendered article so block, HTML and Markdown posts share one reader. */
export function useArticleReading(contentRef, renderedContent) {
  const headings = ref([]);
  const activeHeading = ref('');
  const progress = ref(0);
  const plainText = ref('');
  const tocOpen = ref(false);
  let frame = 0;
  let resizeObserver;
  let alive = true;
  let nodes = [];
  let headingOffsets = [];
  let layoutChanged = true;

  function measure() {
    frame = 0;
    const content = contentRef.value;
    if (!content) return;
    const box = content.getBoundingClientRect();
    const distance = box.height - window.innerHeight + 160;
    progress.value = distance > 0 ? Math.min(1, Math.max(0, (112 - box.top) / distance)) : (box.bottom <= window.innerHeight ? 1 : 0);
    if (layoutChanged) {
      headingOffsets = nodes.map((node) => node.getBoundingClientRect().top - box.top);
      layoutChanged = false;
    }
    let index = headingOffsets.length - 1;
    while (index > 0 && headingOffsets[index] + box.top > 150) index -= 1;
    activeHeading.value = nodes[index]?.id || '';
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(measure);
  }

  function onLayoutChange() {
    layoutChanged = true;
    schedule();
  }

  async function indexHeadings() {
    await nextTick();
    if (!alive) return;
    resizeObserver?.disconnect();
    const content = contentRef.value;
    nodes = content ? [...content.querySelectorAll('h2, h3')] : [];
    headings.value = nodes.map((node, index) => {
      node.id = `article-section-${index + 1}`;
      node.tabIndex = -1;
      return { id: node.id, text: node.textContent.trim(), level: Number(node.tagName.slice(1)) };
    }).filter((heading) => heading.text);
    plainText.value = content?.textContent || '';
    if (content) resizeObserver?.observe(content);
    onLayoutChange();
  }

  function goToHeading(id) {
    const node = nodes.find((heading) => heading.id === id);
    if (!node) return;
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }

  watch([contentRef, renderedContent], indexHeadings, { flush: 'post' });
  onMounted(() => {
    tocOpen.value = window.matchMedia('(min-width: 1100px)').matches;
    resizeObserver = new ResizeObserver(onLayoutChange);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', onLayoutChange, { passive: true });
    indexHeadings();
  });
  onBeforeUnmount(() => {
    alive = false;
    if (frame) cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', onLayoutChange);
  });
  return { headings, activeHeading, progress, plainText, tocOpen, goToHeading };
}
