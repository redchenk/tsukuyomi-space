export function nameInitial(name, fallback = '月') {
  return ([...String(name || fallback).trim()][0] || fallback).toUpperCase();
}

export function encodedAvatarInitial(name) {
  const xml = nameInitial(name).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[character]);
  return encodeURIComponent(xml);
}
