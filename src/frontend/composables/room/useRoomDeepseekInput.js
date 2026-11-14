import { ref } from 'vue';
import { deepseek, deepseekTool, filePurpose } from '../../services/room/roomDeepseek.mjs';
import { startRecording } from '../../services/room/roomVoiceRecorder.mjs';
import { readJson, writeJson } from '../../services/room/roomStorage';
import { getSession } from '../../api/client';

export function useRoomDeepseekInput({ input, busy }) {
  const settings = () => readJson('roomLLMSettings', {});
  const features = ref(deepseek.options(readJson('roomDeepseekOptions', {})));
  const files = ref([]), status = ref(''), error = ref(''), recording = ref(false), working = ref(false);
  let recorder, controller, disposed = false, epoch = 0;
  const owner = () => String(getSession()?.user?.id || 'guest');
  const supported = () => deepseek.supported(settings());
  function toggle(name) { features.value = { ...features.value, [name]: !features.value[name] }; writeJson('roomDeepseekOptions', features.value); }
  function reset() {
    epoch++; controller?.abort(); recorder?.cancel(); recorder = null;
    recording.value = false; working.value = false; files.value = []; status.value = ''; error.value = '';
  }
  async function job(label, task) {
    if (disposed || working.value || recording.value || busy() || !supported()) return;
    const revision = epoch, account = owner(); controller = new AbortController();
    const signal = controller.signal, config = settings();
    working.value = true; error.value = ''; status.value = label;
    const current = () => !disposed && epoch === revision && owner() === account && !signal.aborted;
    try { await task(config, signal, current); }
    catch (e) { if (current()) error.value = e.message || '处理失败，请重试。'; }
    finally { if (epoch === revision) { working.value = false; status.value = ''; } }
  }
  async function attach(file, ocr = false) {
    if (!file) return;
    if (files.value.length >= 5) { error.value = '每次最多附加 5 个文件。'; return; }
    await job(ocr ? '正在提取文字…' : `正在解析 ${file.name}…`, async (config, signal, current) => {
      if (!ocr && file.size > 100 * 1024 * 1024) throw new Error('文件不能超过 100 MB。');
      const result = await deepseekTool(config, ocr ? '/v1/tools/ocr' : '/files', { file, purpose: ocr ? 'text_recognition' : filePurpose(file), signal });
      if (!current()) return;
      if (ocr) {
        if (!Array.isArray(result.pages)) throw new Error('OCR 未返回可读取的页面。');
        const text = result.pages.map(p => p.text || '').join('\n\n');
        input.value = [input.value, text].filter(Boolean).join('\n\n');
        if (result.pages.some(p => p.finish_reason === 'length')) error.value = '部分页面文字被截断，请分段识别。';
      } else {
        if (!result.id) throw new Error('文件上传未完成，请重试。');
        files.value.push({ id: result.id, name: file.name, size: file.size, purpose: filePurpose(file), endpoint: deepseek.endpoint(config) });
      }
    });
  }
  async function voice() {
    if (recording.value) {
      const source = recorder; recorder = null; recording.value = false;
      const revision = epoch, account = owner();
      const blob = await source?.stop();
      if (disposed || revision !== epoch || owner() !== account) return;
      if (!blob) { error.value = '没有录到声音，请重试。'; return; }
      await job('正在识别语音…', async (config, signal, current) => {
        const result = await deepseekTool(config, '/v1/tools/asr', { file: blob, signal });
        if (typeof result.text !== 'string') throw new Error('语音接口没有返回文字。');
        if (current()) input.value = [input.value, result.text].filter(Boolean).join(' ');
      });
      return;
    }
    if (busy() || working.value || disposed || !supported()) return;
    const revision = epoch, account = owner();
    working.value = true; error.value = '';
    try {
      const source = await startRecording(() => { void voice(); });
      if (disposed || revision !== epoch || owner() !== account) { source.cancel(); return; }
      recorder = source; recording.value = true;
    } catch { if (epoch === revision) error.value = '无法使用麦克风，请检查浏览器权限和 HTTPS 连接。'; }
    finally { if (epoch === revision) working.value = false; }
  }
  return { supported, features, files, working, recording, error, status, toggle, attach, voice, reset,
    remove(id) { files.value = files.value.filter(f => f.id !== id); },
    destroy() { disposed = true; reset(); } };
}
