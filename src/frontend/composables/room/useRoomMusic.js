import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { MUSIC_BASE_PATH, MUSIC_TRACKS } from '../../constants/room/musicTracks';

function trackUrl(track) {
  return `${MUSIC_BASE_PATH}/${track.file.split('/').map(encodeURIComponent).join('/')}`;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

function readUint24(view, offset) {
  return (view.getUint8(offset) << 16) | (view.getUint8(offset + 1) << 8) | view.getUint8(offset + 2);
}

function parseFlacPicture(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 8) return null;
  if (String.fromCharCode(...new Uint8Array(buffer, 0, 4)) !== 'fLaC') return null;
  let offset = 4;
  while (offset + 4 <= view.byteLength) {
    const blockHeader = view.getUint8(offset);
    const isLast = Boolean(blockHeader & 0x80);
    const blockType = blockHeader & 0x7f;
    const blockLength = readUint24(view, offset + 1);
    offset += 4;
    if (offset + blockLength > view.byteLength) return null;
    if (blockType === 6) {
      let cursor = offset + 4;
      const mimeLength = view.getUint32(cursor);
      cursor += 4;
      if (cursor + mimeLength + 4 > offset + blockLength) return null;
      const mime = new TextDecoder('ascii').decode(new Uint8Array(buffer, cursor, mimeLength)) || 'image/jpeg';
      cursor += mimeLength;
      const descriptionLength = view.getUint32(cursor);
      cursor += 4 + descriptionLength + 16;
      if (cursor + 4 > offset + blockLength) return null;
      const imageLength = view.getUint32(cursor);
      cursor += 4;
      if (imageLength <= 0 || cursor + imageLength > offset + blockLength) return null;
      return new Blob([buffer.slice(cursor, cursor + imageLength)], { type: mime });
    }
    offset += blockLength;
    if (isLast) break;
  }
  return null;
}

export function useRoomMusic() {
  const audio = new Audio();
  const trackIndex = ref(Math.max(0, Math.min(MUSIC_TRACKS.length - 1, Number.parseInt(localStorage.getItem('roomMusicTrackIndex') || '0', 10) || 0)));
  const playing = ref(false);
  const duration = ref(0);
  const currentTime = ref(0);
  const volume = ref(Math.max(0, Math.min(1, Number.parseFloat(localStorage.getItem('roomMusicVolume') || '0.72') || 0.72)));
  const coverUrl = ref('');
  const drawer = reactive({ volume: false, playlist: false });
  let coverObjectUrl = '';
  let coverRequestId = 0;

  const tracks = MUSIC_TRACKS;
  const currentTrack = computed(() => tracks[trackIndex.value] || tracks[0]);
  const progress = computed({
    get: () => (duration.value > 0 ? Math.round((currentTime.value / duration.value) * 1000) : 0),
    set: (value) => {
      if (!duration.value) return;
      audio.currentTime = (Number(value) / 1000) * duration.value;
      currentTime.value = audio.currentTime;
    }
  });

  async function loadCover(track, requestId) {
    if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
    coverObjectUrl = '';
    coverUrl.value = '';
    try {
      const response = await fetch(trackUrl(track), { headers: { Range: 'bytes=0-4194303' }, cache: 'force-cache' });
      if (!response.ok && response.status !== 206) return;
      const blob = parseFlacPicture(await response.arrayBuffer());
      if (!blob || requestId !== coverRequestId) return;
      coverObjectUrl = URL.createObjectURL(blob);
      coverUrl.value = coverObjectUrl;
    } catch (_) {
      coverUrl.value = '';
    }
  }

  function loadTrack(index, options = {}) {
    if (!tracks.length) return;
    const wasPlaying = playing.value;
    trackIndex.value = (index + tracks.length) % tracks.length;
    localStorage.setItem('roomMusicTrackIndex', String(trackIndex.value));
    audio.src = trackUrl(currentTrack.value);
    audio.preload = 'metadata';
    loadCover(currentTrack.value, ++coverRequestId);
    if (options.play || wasPlaying) audio.play().catch(() => {});
  }

  function togglePlay() {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }

  function next() {
    loadTrack(trackIndex.value + 1, { play: playing.value });
  }

  function prev() {
    loadTrack(trackIndex.value - 1, { play: playing.value });
  }

  function setVolume(value) {
    volume.value = Math.max(0, Math.min(1, Number(value)));
    audio.volume = volume.value;
    localStorage.setItem('roomMusicVolume', String(volume.value));
  }

  function toggleDrawer(name) {
    drawer[name] = !drawer[name];
    Object.keys(drawer).forEach((key) => {
      if (key !== name) drawer[key] = false;
    });
  }

  function destroy() {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
    coverRequestId += 1;
  }

  audio.volume = volume.value;
  audio.addEventListener('loadedmetadata', () => {
    duration.value = Number.isFinite(audio.duration) ? audio.duration : 0;
  });
  audio.addEventListener('timeupdate', () => {
    currentTime.value = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  });
  audio.addEventListener('play', () => {
    playing.value = true;
  });
  audio.addEventListener('pause', () => {
    playing.value = false;
  });
  audio.addEventListener('ended', next);
  loadTrack(trackIndex.value);
  onBeforeUnmount(destroy);

  return {
    tracks,
    trackIndex,
    currentTrack,
    playing,
    duration,
    currentTime,
    currentLabel: computed(() => formatTime(currentTime.value)),
    durationLabel: computed(() => formatTime(duration.value)),
    progress,
    volume,
    coverUrl,
    drawer,
    loadTrack,
    togglePlay,
    next,
    prev,
    setVolume,
    toggleDrawer,
    destroy
  };
}
