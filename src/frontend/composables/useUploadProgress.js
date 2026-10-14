import { reactive } from 'vue';

export function useUploadProgress() {
  const state = reactive({ stage: 'idle', active: false, fileName: '', fileSize: 0, progress: null, loaded: 0, total: 0, label: '' });
  const start = (file, label = '正在准备文件…') => Object.assign(state, { stage: 'preparing', active: true, fileName: file?.name || '', fileSize: file?.size || 0, progress: null, loaded: 0, total: 0, label });
  const update = (progress, label, details = {}) => {
    state.progress = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : null;
    state.label = label;
    state.stage = details.stage || 'uploading';
    if (Number.isFinite(details.loaded)) state.loaded = details.loaded;
    if (Number.isFinite(details.total)) state.total = details.total;
  };
  const complete = (label = '上传完成') => Object.assign(state, { active: false, stage: 'complete', progress: 100, label });
  const fail = error => Object.assign(state, { active: false, stage: error?.name === 'AbortError' ? 'paused' : 'error', label: error?.message || '上传失败' });
  return { state, start, update, complete, fail, clear: () => Object.assign(state, { stage: 'idle', active: false, fileName: '', fileSize: 0, progress: null, loaded: 0, total: 0, label: '' }) };
}
