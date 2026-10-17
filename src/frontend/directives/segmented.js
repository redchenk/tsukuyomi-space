const controls = new WeakMap();

export const segmented = {
  mounted(element) {
    const indicator = document.createElement('span');
    indicator.className = 'ts-segmented-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    element.prepend(indicator);
    element.classList.add('ts-segmented');
    let frame;
    function measure() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const selected = element.querySelector('button[aria-selected="true"], button[aria-pressed="true"]');
        const buttons = [...element.querySelectorAll(':scope > button')];
        const singleRow = buttons.length && buttons.every(button => Math.abs(button.offsetTop - buttons[0].offsetTop) < 2);
        element.classList.toggle('ts-segmented-ready', Boolean(selected?.offsetWidth && singleRow));
        if (!selected || !singleRow) return;
        indicator.style.width = `${selected.offsetWidth}px`;
        indicator.style.height = `${selected.offsetHeight}px`;
        indicator.style.transform = `translate(${selected.offsetLeft}px, ${selected.offsetTop}px)`;
      });
    }
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    const mutation = new MutationObserver(measure);
    // Observe the actual controls only; our own indicator must not trigger a loop.
    for (const button of element.querySelectorAll(':scope > button')) {
      resize.observe(button);
      mutation.observe(button, { attributes: true, attributeFilter: ['aria-selected', 'aria-pressed'] });
    }
    measure();
    controls.set(element, () => { cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect(); indicator.remove(); });
  },
  beforeUnmount(element) { controls.get(element)?.(); controls.delete(element); }
};
