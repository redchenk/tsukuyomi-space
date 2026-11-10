export function playWaterMirrorEntry(gate) {
  const video = gate?.querySelector('.access-film-intro');
  const idle = gate?.querySelector('.access-film-idle');
  const mist = gate?.querySelector('.access-film-mist');
  let resolve;
  let settled = false;
  let presented = false;
  let frameId;
  let paintId;
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
    if (paintId !== undefined) cancelAnimationFrame(paintId);
    video?.removeEventListener('playing', onPlaying);
    video?.removeEventListener('timeupdate', centerMoon);
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
    idle?.pause();
    clearTimeout(deadline);
    deadline = setTimeout(onError, 7200);
    // Keep the last visible idle pose underneath the new film until the
    // decoder has actually presented it. Both films use the same framing.
    animate(video, [{ opacity: 0 }, { opacity: 1 }], 240, 'ease-in-out');
    animate(gate.querySelector('.access-content'), [{ opacity: 1 }, { opacity: 0 }], 330);
    animate(gate.querySelector('.access-film-shade'), [{ opacity: 1 }, { opacity: 0 }], 400);
  }

  function onPlaying() {
    if (settled || presented || frameId !== undefined || paintId !== undefined) return;
    if (typeof video.requestVideoFrameCallback === 'function') {
      const mark = (_, metadata) => {
        if (settled) return;
        if (metadata.mediaTime < .035) frameId = video.requestVideoFrameCallback(mark);
        else show();
      };
      frameId = video.requestVideoFrameCallback(mark);
    } else paintId = requestAnimationFrame(() => { paintId = requestAnimationFrame(show); });
  }

  function centerMoon() {
    const remaining = video.duration - video.currentTime;
    if (!presented || !Number.isFinite(remaining) || remaining > 1.55) return;
    video.removeEventListener('timeupdate', centerMoon);
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
    if (window.matchMedia('(max-aspect-ratio: 5/6)').matches) {
      video.addEventListener('timeupdate', centerMoon);
    }
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);
    deadline = setTimeout(onError, 1700);
    try { video.play()?.catch(onError); } catch (_) { onError(); }
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
