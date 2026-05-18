const rawAssetBase = (import.meta.env.VITE_PUBLIC_ASSET_BASE_URL || '').trim();
const assetBase = rawAssetBase.replace(/\/+$/, '');

if (typeof window !== 'undefined') {
  window.TSUKUYOMI_ASSET_BASE_URL = assetBase;
}

export function assetUrl(path) {
  const normalizedPath = String(path || '');
  if (!assetBase || !normalizedPath.startsWith('/')) return normalizedPath;
  return `${assetBase}${normalizedPath}`;
}

export function configureAssetCssVars() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--ts-bg-image', `url("${assetUrl('/assets/images/tsukuyomi-bg.png')}")`);
  root.style.setProperty('--ts-room-bg-image', `url("${assetUrl('/assets/images/room-bg.png')}")`);
}

