const START_TIMEOUT_MS = 4500;
const PLAYBACK_TIMEOUT_MS = 9000;

export function playWaterMirrorEntry(gate) {
  const video = gate?.querySelector('.access-film-intro');
  const idle = gate?.querySelector('.access-film-idle');
  const mist = gate?.querySelector('.access-film-mist');
  const portrait = window.matchMedia('(max-aspect-ratio: 5/6)').matches;
  let resolve;
  let settled = false;
  let presented = false;
  let frameId;
  let deadline;
  let veilTimer;
  const animations = [];
  const finished = new Promise(done => { resolve = done; });

  function animate(target, frames, duration, easing = 'ease-out') {
    if (target) animations.push(target.animate(frames, { duration, easing, fill: 'forwards' }));
  }

  function finish(success) {
    if (settled) return;
    settled = true;
    clearTimeout(deadline);
    clearTimeout(veilTimer);
    if (frameId !== undefined) video?.cancelVideoFrameCallback?.(frameId);
    video?.removeEventListener('playing', onPlaying);
    video?.removeEventListener('timeupdate', onTimeUpdate);
    video?.removeEventListener('ended', onEnded);
    video?.removeEventListener('error', onError);
    video?.pause();
    resolve(success);
  }

  function onError() {
    if (video?.error && presented) video.getAnimations().forEach(animation => animation.cancel());
    finish(false);
  }

  function show() {
    if (settled || presented) return;
    presented = true;
    if (!portrait) video.removeEventListener('timeupdate', onTimeUpdate);
    idle?.pause();
    clearTimeout(deadline);
    deadline = setTimeout(onError, PLAYBACK_TIMEOUT_MS);
    // Keep the last visible idle pose underneath the new film until the
    // decoder has actually presented it. Both films use the same framing.
    animate(video, [{ opacity: 0 }, { opacity: 1 }], 240, 'ease-in-out');
    animate(gate.querySelector('.access-content'), [{ opacity: 1 }, { opacity: 0 }], 330);
    animate(gate.querySelector('.access-film-shade'), [{ opacity: 1 }, { opacity: 0 }], 400);
  }

  function onPlaying() {
    if (settled || presented || frameId !== undefined || typeof video.requestVideoFrameCallback !== 'function') return;
    const mark = (_, metadata) => {
      if (settled || presented) return;
      if (metadata.mediaTime < .035) frameId = video.requestVideoFrameCallback(mark);
      else show();
    };
    frameId = video.requestVideoFrameCallback(mark);
  }

  function onTimeUpdate() {
    // Some browsers do not report presented frames until the video is visible.
    if (!presented && !video.paused && !video.seeking && video.currentTime >= .04
      && video.readyState >= video.HAVE_CURRENT_DATA) show();
    const remaining = video.duration - video.currentTime;
    if (!portrait || !presented || !Number.isFinite(remaining) || remaining > 1.55) return;
    video.removeEventListener('timeupdate', onTimeUpdate);
    animate(video, [
      { objectPosition: getComputedStyle(video).objectPosition },
      { objectPosition: '50% 50%' }
    ], remaining * 1000, 'ease-out');
  }

  function onEnded() {
    if (!presented) return onError();
    clearTimeout(deadline);
    animate(mist, [{ opacity: 0 }, { opacity: 1 }], 260, 'ease-in-out');
    veilTimer = setTimeout(() => finish(true), 275);
  }

  if (!video || video.error || !mist) finish(false);
  else {
    video.muted = true;
    video.addEventListener('playing', onPlaying);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);
    deadline = setTimeout(onError, START_TIMEOUT_MS);
    try {
      if (video.currentTime > 0) video.currentTime = 0;
      video.play()?.catch(onError);
    } catch (_) { onError(); }
  }

  return {
    finished,
    stop() { finish(false); },
    dispose() {
      finish(false);
      for (const animation of animations) animation.cancel();
    }
  };
}
