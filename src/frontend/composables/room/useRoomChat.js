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

function stripLeadingActionHints(text) {
  let value = String(text || '').trim();
  const actionHintPattern = /^(?:\s*(?:[\(（][^()（）\n]{1,100}[\)）]|[\[【][^[\]【】\n]{1,100}[\]】]|\*[^*\n]{1,100}\*|(?:动作|表情|姿态|语气|神态|动作提示)\s*[:：][^\n]{1,140})\s*)+/u;
  let previous = '';
  while (value && value !== previous) {
    previous = value;
    value = value.replace(actionHintPattern, '').trimStart();
  }
  return value.trim();
}

function isActionHint(value) {
  return /(?:\u52a8\u4f5c|\u8868\u60c5|\u59ff\u6001|\u8bed\u6c14|\u795e\u6001|\u63d0\u793a|\u5fae\u7b11|\u8f7b\u7b11|\u7b11|\u70b9\u5934|\u6447\u5934|\u7728\u773c|\u4f4e\u5934|\u62ac\u5934|\u53f9\u6c14|\u9760\u8fd1|\u6c89\u9ed8|\u505c\u987f|\u51dd\u89c6|\u4f38\u624b|\u6325\u624b|\u6b6a\u5934|\u8138\u7ea2|\u8f7b\u58f0|\u5c0f\u58f0|\u6e29\u67d4\u5730|\u770b\u5411)/u.test(String(value || ''));
}

function stripActionHints(text) {
  let value = String(text || '').trim();
  const leadingActionHintPattern = /^(?:\s*(?:[\(\uFF08][^()\uFF08\uFF09\n]{1,100}[\)\uFF09]|[\[\u3010][^[\]\u3010\u3011\n]{1,100}[\]\u3011]|\*[^*\n]{1,100}\*|(?:\u52a8\u4f5c|\u8868\u60c5|\u59ff\u6001|\u8bed\u6c14|\u795e\u6001|\u52a8\u4f5c\u63d0\u793a)\s*[:\uFF1A][^\n]{1,140})\s*)+/u;
  let previous = '';
  while (value && value !== previous) {
    previous = value;
    value = value.replace(leadingActionHintPattern, '').trimStart();
  }

  return value
    .replace(/(?:^|\n)\s*(?:\u52a8\u4f5c|\u8868\u60c5|\u59ff\u6001|\u8bed\u6c14|\u795e\u6001|\u52a8\u4f5c\u63d0\u793a)\s*[:\uFF1A][^\n]{1,140}(?=\n|$)/gu, '\n')
    .replace(/[\(\uFF08]([^()\uFF08\uFF09\n]{1,80})[\)\uFF09]/gu, (match, cue) => (isActionHint(cue) ? '' : match))
    .replace(/[\[\u3010]([^[\]\u3010\u3011\n]{1,80})[\]\u3011]/gu, (match, cue) => (isActionHint(cue) ? '' : match))
    .replace(/\*([^*\n]{1,80})\*/gu, (match, cue) => (isActionHint(cue) ? '' : match))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanReply(text) {
  const cleaned = stripActionHints(stripControlTags(text));
  return cleaned || '\u55ef\uff0c\u6211\u5728\u3002';
}

function roomSystemPrompt() {
  return [
    '你是月见八千代，回复应保持温柔、清澈、带一点神秘感。',
    '不要把动作提示词、表情提示词或舞台指令直接写进给用户看的正文，例如不要输出“（微笑）”“【轻轻点头】”“动作：靠近”。',
    '如果确实需要驱动 Live2D 动作，只能使用 <|ACT:动作名|> 这样的控制标签；这些标签会被系统隐藏，正文只保留自然对话。'
  ].join('\n');
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
  const ttsState = ref({ messageId: '', status: 'idle' });
  let ttsUrl = '';
  let currentAudio = null;
  let ttsRequestId = 0;

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
          systemPrompt: settings.systemPrompt || roomSystemPrompt(),
          image
        });
      } else if (settings.apiKey && settings.apiUrl) {
        const response = await fetch(settings.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
          body: JSON.stringify({
            model: settings.model || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: settings.systemPrompt || roomSystemPrompt() },
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

  function stopTTS() {
    ttsRequestId += 1;
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.onplay = null;
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio = null;
    }
    ttsState.value = { messageId: '', status: 'idle' };
  }

  async function playTTS(text, messageId = '') {
    const settings = readJson('roomTTSSettings', {});
    if (!settings.enabled) {
      addMessage('system', '\u8bf7\u5148\u5728 TTS \u8bbe\u7f6e\u4e2d\u542f\u7528\u8bed\u97f3\u5408\u6210');
      return;
    }
    if (!settings.useProxy) {
      addMessage('system', '\u5f53\u524d Vue \u7248 TTS \u5efa\u8bae\u5148\u5f00\u542f\u670d\u52a1\u5668\u4ee3\u7406\u4ee5\u89c4\u907f CORS');
      return;
    }
    stopTTS();
    const requestId = ttsRequestId + 1;
    ttsRequestId = requestId;
    ttsState.value = { messageId, status: 'loading' };
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, text: cleanReply(text) })
      });
      if (!response.ok) throw new Error(`TTS ${response.status}`);
      if (requestId !== ttsRequestId) return;
      if (ttsUrl) URL.revokeObjectURL(ttsUrl);
      ttsUrl = URL.createObjectURL(await response.blob());
      if (requestId !== ttsRequestId) {
        URL.revokeObjectURL(ttsUrl);
        ttsUrl = '';
        return;
      }
      const audio = new Audio(ttsUrl);
      currentAudio = audio;
      audio.onplay = () => {
        ttsState.value = { messageId, status: 'playing' };
        live2d?.speak?.();
      };
      audio.onended = () => {
        if (currentAudio === audio) stopTTS();
      };
      audio.onerror = () => {
        if (currentAudio === audio) stopTTS();
      };
      await audio.play();
    } catch (error) {
      if (requestId !== ttsRequestId) return;
      stopTTS();
      addMessage('system', `TTS \u64ad\u653e\u5931\u8d25\uff1a${error.message}`);
    }
  }

  function onDrop(event) {
    const file = [...event.dataTransfer?.files || []].find((item) => /^image\//.test(item.type));
    if (!file) return;
    event.preventDefault();
    attachImage(file);
  }

  function destroy() {
    stopTTS();
    if (ttsUrl) URL.revokeObjectURL(ttsUrl);
    ttsUrl = '';
  }

  loadHistory();

  return {
    messages,
    input,
    sending,
    ttsState,
    imageAttachment,
    messageListRef,
    addMessage,
    attachImage,
    clearImage,
    send,
    playTTS,
    stopTTS,
    onDrop,
    destroy,
    world
  };
}
