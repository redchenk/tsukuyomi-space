const storedAssetBase = typeof localStorage !== 'undefined'
  ? localStorage.getItem('tsukuyomi_public_asset_base_url') || ''
  : '';
const rawAssetBase = (import.meta.env.VITE_PUBLIC_ASSET_BASE_URL || storedAssetBase || '').trim();
let assetBase = rawAssetBase.replace(/\/+$/, '');

if (typeof window !== 'undefined') {
  window.TSUKUYOMI_ASSET_BASE_URL = assetBase;
}

export function assetUrl(path) {
  const normalizedPath = String(path || '');
  if (!assetBase || !normalizedPath.startsWith('/')) return normalizedPath;
  return `${assetBase}${normalizedPath}`;
}

export function setPublicAssetBaseUrl(value) {
  assetBase = String(value || '').trim().replace(/\/+$/, '');
  if (typeof window !== 'undefined') {
    window.TSUKUYOMI_ASSET_BASE_URL = assetBase;
  }
  if (typeof localStorage !== 'undefined') {
    if (assetBase) localStorage.setItem('tsukuyomi_public_asset_base_url', assetBase);
    else localStorage.removeItem('tsukuyomi_public_asset_base_url');
  }
  configureAssetCssVars();
}

export function configureAssetCssVars() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--ts-bg-image', `url("${assetUrl('/assets/images/tsukuyomi-bg.png')}")`);
  root.style.setProperty('--ts-room-bg-image', `url("${assetUrl('/assets/images/room-bg.png')}")`);
}
