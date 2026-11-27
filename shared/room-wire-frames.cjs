/*!
MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
// Adapted from deepseek-ai/chat-demo src/services/api/sse.ts at cdf9617.
// A CR ends a line immediately. Suppress its LF even when it arrives in the next chunk.
async function* readRoomFrames(stream, { signal, ndjson = false, maxEventBytes = 1048576, maxWireBytes = 16 * 1048576 } = {}) {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const encoder = new TextEncoder();
  let skipLF = false, line = '', data = [], event = '', size = 0, wire = 0;
  const tooLarge = () => Object.assign(new Error('模型响应过大，请缩短请求后重试'), { code: 'LLM_SIZE_LIMIT' });
  const abort = () => { reader.cancel(signal.reason).catch(() => {}); };

  function* lines(text) {
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (skipLF) {
        skipLF = false;
        if (ch === '\n') { start = i + 1; continue; }
      }
      if (ch !== '\r' && ch !== '\n') continue;
      line += text.slice(start, i);
      size += encoder.encode(text.slice(start, i)).length + 1;
      if (size > maxEventBytes) throw tooLarge();
      const current = line;
      line = '';
      start = i + 1;
      skipLF = ch === '\r';
      if (ndjson || current === '') {
        const frame = ndjson ? current.trim() : data.join('\n');
        if (ndjson ? frame : data.length) yield { event: event || 'message', data: frame };
        data = []; event = ''; size = 0;
      } else if (!current.startsWith(':')) {
        const colon = current.indexOf(':');
        const field = colon < 0 ? current : current.slice(0, colon);
        const value = colon < 0 ? '' : current.slice(colon + 1).replace(/^ /, '');
        if (field === 'event') event = value;
        if (field === 'data') data.push(value);
      }
    }
    line += text.slice(start);
    size += encoder.encode(text.slice(start)).length;
    if (size > maxEventBytes) throw tooLarge();
  }

  signal?.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      wire += value.byteLength;
      if (wire > maxWireBytes) throw tooLarge();
      for (let offset = 0; offset < value.length; offset += 16384) {
        yield* lines(decoder.decode(value.subarray(offset, offset + 16384), { stream: true }));
      }
    }
    yield* lines(decoder.decode());
    if (ndjson && line.trim()) yield { event: 'message', data: line.trim() };
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
module.exports = { readRoomFrames };
