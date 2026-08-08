const SILENT_WAV_URL = 'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function configureInlinePlayback(audio) {
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');
  audio.setAttribute('webkit-playsinline', '');
  return audio;
}

export function primeAsyncAudioPlayback() {
  const audio = configureInlinePlayback(new Audio(SILENT_WAV_URL));
  audio.loop = true;
  audio.volume = 1;

  let primePromise;
  try {
    primePromise = Promise.resolve(audio.play()).then(() => true).catch(() => false);
  } catch (_) {
    primePromise = Promise.resolve(false);
  }

  return { audio, primePromise, released: false };
}

export async function prepareAsyncAudioSource(playback, sourceUrl) {
  if (!playback?.audio) throw new Error('Audio playback session is unavailable');
  await playback.primePromise;
  if (playback.released) throw new DOMException('Audio playback was cancelled', 'AbortError');

  const audio = playback.audio;
  audio.pause();
  audio.loop = false;
  audio.volume = 1;
  audio.src = String(sourceUrl || '');
  audio.load?.();
  return audio;
}

export function releaseAsyncAudioPlayback(playback) {
  if (!playback?.audio || playback.released) return;
  playback.released = true;
  const audio = playback.audio;
  audio.pause();
  audio.loop = false;
  audio.removeAttribute('src');
  audio.load?.();
}

export function describeAudioPlaybackError(error) {
  const message = String(error?.message || error || '').trim();
  if (error?.name === 'NotAllowedError'
    || /not allowed|user gesture|denied permission|current context/i.test(message)) {
    return '\u79fb\u52a8\u6d4f\u89c8\u5668\u963b\u6b62\u4e86\u97f3\u9891\u64ad\u653e\uff0c\u8bf7\u518d\u70b9\u4e00\u6b21\u64ad\u653e\u8bed\u97f3';
  }
  return message || 'Audio playback failed';
}
