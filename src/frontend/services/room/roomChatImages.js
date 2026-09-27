import { authFetch, authHeaders, getSession, parseResponse } from '../../api/client';

const MAX_BYTES = 512 * 1024;
const DATABASE = 'tsukuyomi-room-images';

export function normalizeRoomImage(image) {
  if (!image || typeof image !== 'object') return null;
  const name = String(image.name || 'image').slice(0, 160);
  if (typeof image.id === 'string' && /^[a-f0-9-]{36}$/.test(image.id)) {
    return { id: image.id, name, type: image.type, url: `/api/room/chat/images/${image.id}` };
  }
  if (typeof image.localId === 'string' && /^guest:[A-Za-z0-9._:-]{8,128}$/.test(image.localId)) {
    return { localId: image.localId, name, type: image.type };
  }
  return null;
}

async function localStore(mode, operation) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('images', mode);
      const request = operation(transaction.objectStore('images'));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('图片保存失败'));
    });
  } finally { db.close(); }
}

export async function readLocalRoomImage(localId) {
  return (await localStore('readonly', store => store.get(localId)))?.dataUrl || '';
}

export function clearLocalRoomImages() {
  return localStore('readwrite', store => store.clear());
}

export async function prepareRoomImage(file) {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('请选择 JPEG、PNG、WebP 或 GIF 图片');
  if (file.size > 20 * 1024 * 1024) throw new Error('图片不能超过 20MB');
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('无法读取图片，请选择其他图片'));
      image.src = source;
    });
    let edge = 1600;
    // Re-encoding strips EXIF/location metadata and limits memory/storage cost.
    while (edge >= 400) {
      const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
      canvas.width = canvas.height = 1;
      if (blob && blob.size <= MAX_BYTES) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('图片读取失败'));
          reader.readAsDataURL(blob);
        });
        return { name: file.name || 'image', type: blob.type, size: blob.size, dataUrl };
      }
      edge = Math.floor(edge * 0.75);
    }
    throw new Error('图片压缩失败，请选择较小的图片');
  } finally { URL.revokeObjectURL(source); }
}

export async function persistRoomImage(image, turnId, signal) {
  const userId = String(getSession()?.user?.id || '');
  if (!userId) {
    const localId = `guest:${turnId}`;
    await localStore('readwrite', store => {
      const request = store.put({ dataUrl: image.dataUrl, createdAt: Date.now() }, localId);
      const all = store.getAllKeys();
      all.onsuccess = () => {
        const entries = [];
        for (const key of all.result) {
          const item = store.get(key);
          item.onsuccess = () => {
            entries.push({ key, createdAt: item.result?.createdAt || 0 });
            if (entries.length === all.result.length) {
              entries.sort((a, b) => b.createdAt - a.createdAt).slice(24).forEach(entry => store.delete(entry.key));
            }
          };
        }
      };
      return request;
    });
    if (getSession()?.user?.id) throw new Error('登录账号已切换，请重试');
    return { localId, name: image.name, type: image.type };
  }
  const response = await authFetch('/api/room/chat/images', {
    method: 'POST', signal,
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ turnId, name: image.name, dataUrl: image.dataUrl })
  });
  const result = await parseResponse(response);
  if (String(getSession()?.user?.id || '') !== userId) throw new Error('登录账号已切换，请重试');
  if (!response.ok || !result.success) throw new Error(result.message || '图片云同步失败，请重试');
  const reference = normalizeRoomImage(result.data);
  if (!reference) throw new Error('图片同步结果无效，请重试');
  return reference;
}
