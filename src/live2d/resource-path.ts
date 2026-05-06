const LOCAL_LIVE2D_RESOURCE_BASE = '/models/';

function normalizeBase(value: unknown): string {
  const base = String(value || '').trim();
  if (!base) return LOCAL_LIVE2D_RESOURCE_BASE;
  return base.endsWith('/') ? base : `${base}/`;
}

function configuredBase(): string {
  if (typeof window === 'undefined') return LOCAL_LIVE2D_RESOURCE_BASE;
  return normalizeBase((window as any).TSUKUYOMI_LIVE2D_RESOURCE_BASE);
}

export function getLive2DResourceBase(): string {
  return configuredBase();
}

export function resolveLive2DResourcePath(path: string): string {
  if (/^https?:\/\//i.test(path) || path.startsWith('//')) return path;
  return `${getLive2DResourceBase()}${path.replace(/^\/+/, '')}`;
}

export function resolveLive2DFallbackPath(path: string): string {
  const raw = String(path || '');
  const cdnBase = getLive2DResourceBase();
  if (cdnBase !== LOCAL_LIVE2D_RESOURCE_BASE && raw.startsWith(cdnBase)) {
    return `${LOCAL_LIVE2D_RESOURCE_BASE}${raw.slice(cdnBase.length)}`;
  }
  return raw;
}

export async function fetchLive2DResource(path: string): Promise<ArrayBuffer> {
  const primary = resolveLive2DResourcePath(path);
  const fallback = resolveLive2DFallbackPath(primary);

  try {
    const response = await fetch(primary);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.arrayBuffer();
  } catch (error) {
    if (fallback === primary) throw error;
    const response = await fetch(fallback);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.arrayBuffer();
  }
}
