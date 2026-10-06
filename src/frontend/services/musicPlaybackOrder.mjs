export const PLAYBACK_MODES = ['sequence', 'loop', 'shuffle', 'single'];
export function playbackMode(value) { return PLAYBACK_MODES.includes(value) ? value : 'loop'; }

// A bounded shuffle bag visits each song once per cycle. History makes Previous
// return to the song actually heard, rather than drawing another random song.
export function createPlaybackOrder(random = Math.random) {
  let bag = []; let history = []; let position = -1; let queueSize = 0;
  function reset(current, count) {
    bag = []; history = count ? [current] : []; position = history.length - 1; queueSize = count;
  }
  function prepare(current, count) {
    if (queueSize !== count || history[position] !== current) reset(current, count);
  }
  function remember(index) {
    history.splice(position + 1); history.push(index);
    if (history.length > 100) history.shift();
    position = history.length - 1;
    return index;
  }
  return {
    reset,
    next(current, count, mode, automatic = false) {
      if (!count) return null;
      prepare(current, count);
      if (automatic && mode === 'single') return current;
      if (mode !== 'shuffle') {
        if (automatic && mode === 'sequence' && current === count - 1) return null;
        return remember((current + 1) % count);
      }
      if (position < history.length - 1) return history[++position];
      if (!bag.length) {
        bag = Array.from({ length: count }, (_, index) => index).filter(index => index !== current);
        for (let index = bag.length - 1; index > 0; index--) {
          const other = Math.floor(random() * (index + 1));
          [bag[index], bag[other]] = [bag[other], bag[index]];
        }
      }
      return remember(bag.length ? bag.pop() : current);
    },
    previous(current, count, mode) {
      if (!count) return null;
      prepare(current, count);
      if (mode === 'shuffle') return position > 0 ? history[--position] : current;
      return remember((current - 1 + count) % count);
    }
  };
}
