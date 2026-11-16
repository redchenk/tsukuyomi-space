// Keep browser chrome in the selected season and appearance, without forcing
// the OS theme or any vendor-specific night/data-saver setting.
export function syncThemeColor() {
  requestAnimationFrame(() => {
    const color = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
    if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  });
}
