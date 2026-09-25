/** A reply is still one conversation turn. These pieces are presentation only. */
export function splitRoomReply(value) {
  const text = String(value || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  const parts = [];
  let start = 0;
  let inlineCode = false;
  let fencedCode = false;
  const brackets = [];
  const closing = { '(': ')', '（': '）', '[': ']', '【': '】', '「': '」', '『': '』', '“': '”' };
  const push = end => {
    const part = text.slice(start, end).trim();
    if (part) parts.push(part);
    start = end;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (text.slice(i, i + 3) === '```') {
      fencedCode = !fencedCode;
      i += 2;
      continue;
    }
    if (fencedCode) continue;
    if (char === '`') inlineCode = !inlineCode;
    if (inlineCode) continue;
    if (closing[char]) brackets.push(closing[char]);
    else if (char === brackets.at(-1)) brackets.pop();
    if (brackets.length) continue;
    // Preserve URLs, decimal numbers and common English abbreviations.
    const token = /[.!?]/u.test(char) ? text.slice(start, i + 1).match(/\S+$/u)?.[0] || '' : '';
    const url = /(?:https?:\/\/|www\.)/iu.test(token);
    const period = char === '.' && (i + 1 === text.length || /\s/u.test(text[i + 1]))
      && !url
      && !/^(?:Mr|Mrs|Ms|Dr|Prof|St|vs|etc|e\.g|i\.e|[A-Z])\.$/iu.test(token);
    const sentence = /[。！？]/u.test(char) || (/[!?]/u.test(char) && !url) || period
      || (/[」』”]/u.test(char) && /[。！？!?]/u.test(text[i - 1] || ''));
    if (sentence) {
      while (/[。！？!?.…～~」』”’]/u.test(text[i + 1] || '\0')) i++;
      push(i + 1);
    } else if (char === '\n' && text[i + 1] === '\n') {
      push(i);
      while (text[i + 1] === '\n') i++;
      start = i + 1;
    } else if ((i - start >= 140 && /[，,；;]/u.test(char))
      || (i - start >= 240 && /\s/u.test(char))) {
      // A model may ignore the short-message instruction. Break a run-on at
      // a readable boundary, never at an arbitrary character/token limit.
      const word = text.slice(start, i + 1).match(/\S+$/u)?.[0] || '';
      if (!/(?:https?:\/\/|www\.)/iu.test(word)) push(i + 1);
    }
  }
  push(text.length);
  return parts;
}

/** Reveal short messages in order without delaying the first readable piece.
 * Streaming edits update the current piece; all persisted text stays intact.
 * The bounded final drain also handles providers that return everything at once.
 */
export function createRoomReplyPresenter({ onUpdate, signal, immediate = false, schedule = setTimeout, unschedule = clearTimeout } = {}) {
  let target = [];
  let visible = 0;
  let timer = null;
  let finished = false;
  let cancelled = false;
  let resolveDone;
  let rejectDone;
  let drainBudget = 1800;

  const abortError = () => Object.assign(new Error('Reply presentation stopped'), { name: 'AbortError' });
  const clearTimer = () => {
    if (timer !== null) unschedule(timer);
    timer = null;
  };
  const publish = () => onUpdate?.(target.slice(0, visible));
  const settle = () => {
    if (finished && visible >= target.length) {
      clearTimer();
      signal?.removeEventListener('abort', cancel);
      resolveDone?.();
      resolveDone = rejectDone = null;
    }
  };
  function advance() {
    if (cancelled) return;
    if (immediate) visible = target.length;
    if (!visible && target.length) visible = 1;
    publish();
    settle();
    if (visible >= target.length || timer !== null) return;
    let delay = Math.min(700, 280 + (target[visible - 1]?.length || 0) * 8);
    if (finished) delay = Math.min(delay, drainBudget / (target.length - visible));
    timer = schedule(() => {
      timer = null;
      if (cancelled) return;
      if (finished) drainBudget = Math.max(0, drainBudget - delay);
      visible++;
      advance();
    }, delay);
  }
  function cancel() {
    cancelled = true;
    clearTimer();
    signal?.removeEventListener('abort', cancel);
    rejectDone?.(abortError());
    resolveDone = rejectDone = null;
  }
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  return {
    update(text) {
      if (cancelled || finished) return;
      target = splitRoomReply(text);
      advance();
    },
    finish(text) {
      if (cancelled) return Promise.reject(abortError());
      finished = true;
      target = splitRoomReply(text);
      clearTimer();
      return new Promise((resolve, reject) => {
        resolveDone = resolve;
        rejectDone = reject;
        advance();
      });
    },
    cancel
  };
}
