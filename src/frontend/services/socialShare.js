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

function utf8Base64(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
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
  const qq = new URLSearchParams({
    file_type: 'news',
    src_type: 'web',
    version: '1',
    generalpastboard: '1',
    share_id: '1904951941',
    url: utf8Base64(share.url),
    title: utf8Base64(share.title),
    description: utf8Base64(share.text || share.title),
    callback_type: 'scheme',
    thirdAppDisplayName: utf8Base64('月读空间'),
    app_name: utf8Base64('月读空间'),
    cflag: '0',
    shareType: '0'
  });
  const qzone = new URLSearchParams({ url: share.url, title: share.title, summary: share.text });
  const weibo = new URLSearchParams({ url: share.url, title: [share.title, share.text].filter(Boolean).join(' ') });
  const x = new URLSearchParams({ url: share.url, text: [share.title, share.text].filter(Boolean).join(' ') });
  const telegram = new URLSearchParams({ url: share.url, text: [share.title, share.text].filter(Boolean).join('\n') });
  if (share.imageUrl) {
    qq.set('previewimageUrl', utf8Base64(share.imageUrl));
    qq.set('image_url', utf8Base64(share.imageUrl));
    qzone.set('pics', share.imageUrl);
    weibo.set('pic', share.imageUrl);
  }
  return {
    qq: `mqqapi://share/to_fri?${qq}`,
    qzone: `https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey?${qzone}`,
    weibo: `https://service.weibo.com/share/share.php?${weibo}`,
    x: `https://twitter.com/intent/tweet?${x}`,
    telegram: `https://t.me/share/url?${telegram}`
  };
}
