const $ = selector => document.querySelector(selector);
let report;
function detect() {
  const sheet = document.createElement('style'); sheet.textContent = '@layer probe {}'; document.head.append(sheet);
  const layers = Boolean(sheet.sheet?.cssRules.length); sheet.remove();
  const video = document.createElement('video');
  const features = {
    'CSS 级联层（基础要求）': layers,
    '动态视口 dvh': CSS.supports('height', '100dvh'),
    '颜色混合 color-mix': CSS.supports('color', 'color-mix(in srgb, red, blue)'),
    '父级选择器 :has': CSS.supports('selector(:has(*))'),
    '独立 translate': CSS.supports('translate', '1px'),
    '背景滤镜': CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)'),
    '原生 dialog': typeof HTMLDialogElement !== 'undefined' && 'showModal' in HTMLDialogElement.prototype,
    'inert': 'inert' in HTMLElement.prototype,
    'AbortSignal.timeout': typeof AbortSignal.timeout === 'function',
    'AbortSignal.any': typeof AbortSignal.any === 'function',
    'Visual Viewport': Boolean(window.visualViewport),
    'Virtual Keyboard': Boolean(navigator.virtualKeyboard),
    'View Transition（可选）': typeof document.startViewTransition === 'function',
    '触摸 Pointer Events': 'PointerEvent' in window,
    '麦克风接口（未请求权限）': Boolean(navigator.mediaDevices?.getUserMedia),
    'H.264 / MP4（声明支持）': Boolean(video.canPlayType('video/mp4; codecs="avc1.42E01E"')),
    'WebM / VP9（声明支持）': Boolean(video.canPlayType('video/webm; codecs="vp9"')),
  };
  report = { checkedAt: new Date().toISOString(), userAgent: navigator.userAgent, secureContext: window.isSecureContext, features };
  $('#features').replaceChildren(...Object.entries(features).flatMap(([name, supported]) => {
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = name; dd.textContent = supported ? '支持' : '不支持'; return [dt, dd];
  }));
  $('#summary').textContent = layers && features['原生 dialog'] ? '具备基础界面能力；缺失的部分现代特性由网站回退处理，请继续核验实际操作。' : '缺少基础界面能力，建议更新浏览器。';
  measure();
}
function measure() {
  if (!report) return;
  const vv = window.visualViewport;
  report.viewport = { width: innerWidth, height: innerHeight, visualWidth: vv?.width ?? null, visualHeight: vv?.height ?? null, offsetTop: vv?.offsetTop ?? null, scale: vv?.scale ?? null, virtualKeyboardHeight: navigator.virtualKeyboard?.boundingRect?.height ?? null, dpr: devicePixelRatio };
  $('#viewport').textContent = `布局 ${innerWidth} × ${innerHeight}；可视高度 ${vv ? Math.round(vv.height) : '不可读取'}；顶部偏移 ${vv?.offsetTop ?? '不可读取'}`;
  $('#report').value = JSON.stringify(report, null, 2);
}
$('#refresh').addEventListener('click', detect);
$('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#report').value); $('#copy-status').textContent = '已复制，可自行发送给维护者。'; }
  catch { $('#report').focus(); $('#report').select(); $('#copy-status').textContent = '浏览器未允许自动复制，请长按检测结果手动复制。'; }
});
addEventListener('resize', measure, { passive: true });
window.visualViewport?.addEventListener('resize', measure, { passive: true });
window.visualViewport?.addEventListener('scroll', measure, { passive: true });
navigator.virtualKeyboard?.addEventListener('geometrychange', measure);
detect();
