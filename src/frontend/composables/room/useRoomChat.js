import { nextTick, ref } from 'vue';
import { readJson, writeJson } from '../../services/room/roomStorage';

function uid() {
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function stripControlTags(text) {
  return String(text || '')
    .replace(/<\|ACT:[\s\S]*?\|>/g, '')
    .replace(/<\|DELAY:\d+(?:\.\d+)?\|>/g, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
}

function cleanReply(text) {
  const cleaned = stripControlTags(text).replace(/^(?:\s*(?:\([^()\n]{1,80}\)|\[[^[\]\n]{1,80}\])\s*)+/, '').trim();
  return cleaned || '\u55ef\uff0c\u6211\u5728\u3002';
}

function applyActCues(text) {
  const tags = String(text || '').match(/<\|(?:ACT:[\s\S]*?|DELAY:\d+(?:\.\d+)?)\|>/g) || [];
  if (tags.length) window.dispatchEvent(new CustomEvent('tsukuyomi:room-act', { detail: { tags } }));
}

function pickReply(data) {
  return data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || data?.reply || '';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Image read failed'));
    reader.readAsDataURL(file);
  });
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
  return result.data || {};
}

function fallbackReply(message, image) {
  if (image) return '\u6211\u6536\u5230\u56fe\u7247\u4e86\u3002\u5982\u679c\u5f53\u524d\u6a21\u578b\u6216 MCP \u8fd8\u4e0d\u80fd\u89e3\u6790\u5b83\uff0c\u6211\u4f1a\u5148\u628a\u8fd9\u6b21\u753b\u9762\u8bb0\u5728\u5bf9\u8bdd\u91cc\u3002';
  return message ? `\u6211\u542c\u89c1\u4e86\uff1a${message}` : '\u6211\u5728\u8fd9\u91cc\u3002';
}

export function useRoomChat({ live2d, world }) {
  const messages = ref([]);
  const input = ref('');
  const sending = ref(false);
  const imageAttachment = ref(null);
  const messageListRef = ref(null);
  let ttsUrl = '';

  function addMessage(role, content, options = {}) {
    messages.value.push({ id: uid(), role, content: String(content || ''), image: options.image || null, createdAt: Date.now() });
    nextTick(() => {
      if (messageListRef.value) messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
    });
  }

  function loadHistory() {
    const history = readJson('roomChatHistory', []);
    messages.value = [];
    addMessage('system', 'Live2D is ready');
    history.forEach((message) => addMessage(message.role, message.content));
  }

  async function attachImage(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      addMessage('system', '\u8bf7\u9009\u62e9\u56fe\u7247\u6587\u4ef6');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      addMessage('system', '\u56fe\u7247\u4e0d\u80fd\u8d85\u8fc7 4MB');
      return;
    }
    imageAttachment.value = { name: file.name || 'image', type: file.type, size: file.size, dataUrl: await fileToDataUrl(file) };
  }

  function clearImage() {
    imageAttachment.value = null;
  }

  async function send() {
    const message = input.value.trim();
    const image = imageAttachment.value;
    if (!message && !image) return;
    addMessage('user', message || '\u8bf7\u770b\u8fd9\u5f20\u56fe\u7247\u3002', { image });
    input.value = '';
    imageAttachment.value = null;
    sending.value = true;
    const typingId = uid();
    messages.value.push({ id: typingId, role: 'assistant', content: '\u6b63\u5728\u56de\u5e94...', pending: true, createdAt: Date.now() });

    try {
      const settings = readJson('roomLLMSettings', {});
      const conversation = readJson('roomChatHistory', []).slice(-12);
      let result;
      if (settings.useProxy) {
        result = await postJson('/api/chat', {
          message: message || (image ? '\u8bf7\u770b\u8fd9\u5f20\u56fe\u7247\u3002' : ''),
          conversation,
          apiKey: settings.apiKey,
          apiUrl: settings.apiUrl,
          model: settings.model,
          image
        });
      } else if (settings.apiKey && settings.apiUrl) {
        const response = await fetch(settings.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
          body: JSON.stringify({
            model: settings.model || 'gpt-4o-mini',
            messages: [
              ...conversation.map((item) => ({ role: item.role, content: String(item.content || '') })),
              { role: 'user', content: message || (image ? '\u8bf7\u63cf\u8ff0\u8fd9\u5f20\u56fe\u7247\u3002' : '') }
            ]
          })
        });
        if (!response.ok) throw new Error(`LLM ${response.status}`);
        result = { reply: pickReply(await response.json()) };
      } else {
        result = { reply: fallbackReply(message, image) };
      }
      const raw = result.reply || fallbackReply(message, image);
      applyActCues(raw);
      const reply = cleanReply(raw);
      messages.value = messages.value.filter((item) => item.id !== typingId);
      addMessage('assistant', reply);
      const userContent = image ? `${message || '\u8bf7\u770b\u8fd9\u5f20\u56fe\u7247\u3002'}\n[image: ${image.name}]` : message;
      const nextHistory = [...conversation, { role: 'user', content: userContent }, { role: 'assistant', content: reply }].slice(-24);
      writeJson('roomChatHistory', nextHistory);
      remember(userContent, reply).catch(() => {});
    } catch (error) {
      messages.value = messages.value.filter((item) => item.id !== typingId);
      addMessage('system', `\u53d1\u9001\u5931\u8d25\uff1a${error.message}`);
    } finally {
      sending.value = false;
    }
  }

  async function remember(userMessage, assistantReply) {
    const token = localStorage.getItem('tsukuyomi_token') || '';
    if (!token) return;
    await fetch('/api/room/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userMessage, assistantReply })
    });
  }

  async function playTTS(text) {
    const settings = readJson('roomTTSSettings', {});
    if (!settings.enabled) {
      addMessage('system', '\u8bf7\u5148\u5728 TTS \u8bbe\u7f6e\u4e2d\u542f\u7528\u8bed\u97f3\u5408\u6210');
      return;
    }
    if (!settings.useProxy) {
      addMessage('system', '\u5f53\u524d Vue \u7248 TTS \u5efa\u8bae\u5148\u5f00\u542f\u670d\u52a1\u5668\u4ee3\u7406\u4ee5\u89c4\u907f CORS');
      return;
    }
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settings, text: cleanReply(text) })
    });
    if (!response.ok) throw new Error(`TTS ${response.status}`);
    if (ttsUrl) URL.revokeObjectURL(ttsUrl);
    ttsUrl = URL.createObjectURL(await response.blob());
    const audio = new Audio(ttsUrl);
    audio.onplay = () => live2d?.speak?.();
    await audio.play();
  }

  function onDrop(event) {
    const file = [...event.dataTransfer?.files || []].find((item) => /^image\//.test(item.type));
    if (!file) return;
    event.preventDefault();
    attachImage(file);
  }

  function destroy() {
    if (ttsUrl) URL.revokeObjectURL(ttsUrl);
    ttsUrl = '';
  }

  loadHistory();

  return {
    messages,
    input,
    sending,
    imageAttachment,
    messageListRef,
    addMessage,
    attachImage,
    clearImage,
    send,
    playTTS,
    onDrop,
    destroy,
    world
  };
}
