import { onBeforeUnmount, ref } from 'vue';

// Browser dictation for the Room composer. Recognised words are written into
// the draft as they arrive, so the reader can correct them before sending;
// nothing is sent on their behalf.
function joinDictation(base, addition) {
  if (!addition) return base;
  if (!base) return addition;
  const needsSpace = /[A-Za-z0-9]$/.test(base) && /^[A-Za-z0-9]/.test(addition);
  return base + (needsSpace ? ' ' : '') + addition;
}

export function useSpeechInput({ getText, setText, lang = 'zh-CN', onError } = {}) {
  const Recognition = typeof window === 'undefined' ? null : (window.SpeechRecognition || window.webkitSpeechRecognition || null);
  const supported = Boolean(Recognition);
  const listening = ref(false);
  let recognition = null;
  let base = '';
  let heard = '';

  function release() {
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition = null;
  }

  function start() {
    if (!supported) {
      onError?.('unsupported');
      return false;
    }
    if (listening.value) return true;
    const session = new Recognition();
    session.lang = lang;
    session.continuous = true;
    session.interimResults = true;
    session.maxAlternatives = 1;
    base = String(getText?.() || '').trimEnd();
    heard = '';
    session.onresult = (event) => {
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) heard += result[0].transcript;
        else interim += result[0].transcript;
      }
      setText?.(joinDictation(base, (heard + interim).trim()));
    };
    session.onerror = (event) => {
      if (event.error !== 'aborted') onError?.(event.error || 'unknown');
    };
    session.onend = () => {
      if (recognition !== session) return;
      listening.value = false;
      release();
    };
    recognition = session;
    try {
      session.start();
      listening.value = true;
      return true;
    } catch (_) {
      release();
      onError?.('start-failed');
      return false;
    }
  }

  // Stop keeps what was heard; cancel (used on unmount) discards the session.
  function stop() {
    if (!recognition) return;
    try { recognition.stop(); } catch (_) { /* already stopping */ }
  }

  function cancel() {
    const session = recognition;
    release();
    listening.value = false;
    try { session?.abort(); } catch (_) { /* already stopped */ }
  }

  function toggle() {
    return listening.value ? stop() : start();
  }

  onBeforeUnmount(cancel);
  return { supported, listening, start, stop, cancel, toggle };
}
