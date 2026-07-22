function clean(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch (_) {
    return '';
  }
}

export function normalizedSharePayload(payload = {}) {
  return {
    title: clean(payload.title, 140) || '月读空间',
    text: clean(payload.text, 280),
    url: safeHttpUrl(payload.url),
    imageUrl: safeHttpUrl(payload.imageUrl)
  };
}

export function buildSocialShareLinks(payload = {}) {
  const share = normalizedSharePayload(payload);
  const qq = new URLSearchParams({ url: share.url, title: share.title, summary: share.text });
  const qzone = new URLSearchParams({ url: share.url, title: share.title, summary: share.text });
  const weibo = new URLSearchParams({ url: share.url, title: [share.title, share.text].filter(Boolean).join(' ') });
  const x = new URLSearchParams({ url: share.url, text: [share.title, share.text].filter(Boolean).join(' ') });
  const telegram = new URLSearchParams({ url: share.url, text: [share.title, share.text].filter(Boolean).join('\n') });
  if (share.imageUrl) {
    qq.set('pics', share.imageUrl);
    qzone.set('pics', share.imageUrl);
    weibo.set('pic', share.imageUrl);
  }
  return {
    qq: `https://connect.qq.com/widget/shareqq/index.html?${qq}`,
    qzone: `https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey?${qzone}`,
    weibo: `https://service.weibo.com/share/share.php?${weibo}`,
    x: `https://twitter.com/intent/tweet?${x}`,
    telegram: `https://t.me/share/url?${telegram}`
  };
}
