import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { musicRequest, useMusicLibrary } from './useMusicLibrary';
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
  const drawer = reactive({ volume: false, playlist: false, open: false });
  let coverObjectUrl = '';
  let coverRequestId = 0;
  let loadedTrackIndex = -1;
  let loadEpoch = 0;
  let remoteExpiresAt = 0;
  let coverController;
  const source = ref('local');
  const loading = ref(false);
  const playbackError = ref('');
  const preview = ref(false);

  const tracks = reactive([...MUSIC_TRACKS]);
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
    coverController?.abort();
    if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
    coverObjectUrl = '';
    coverUrl.value = track.source === 'netease' ? track.cover || '' : '';
    if (track.source === 'netease') return;
    const controller = new AbortController();
    coverController = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(trackUrl(track), { headers: { Range: 'bytes=0-4194303' }, cache: 'force-cache', signal: controller.signal });
      if (!response.ok || !response.body) return;
      const reader = response.body.getReader();
      const chunks = []; let size = 0;
      try {
        while (size < 4194304) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = value.subarray(0, 4194304 - size);
          chunks.push(chunk); size += chunk.byteLength;
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const blob = parseFlacPicture(bytes.buffer);
      if (!blob || requestId !== coverRequestId) return;
      coverObjectUrl = URL.createObjectURL(blob);
      coverUrl.value = coverObjectUrl;
    } catch (_) {
      if (requestId === coverRequestId) coverUrl.value = '';
    } finally { clearTimeout(timeout); }
  }

  function startPlayback() {
    return audio.play().catch((error) => {
      playing.value = false;
      playbackError.value = error.name === 'NotAllowedError' ? '曲目已准备好，请再点一下播放' : '暂时无法播放，请重试或换一首';
    });
  }

  async function loadTrack(index, options = {}) {
    if (!tracks.length) return;
    const wasPlaying = playing.value;
    const epoch = ++loadEpoch;
    audio.pause();
    playbackError.value = ''; preview.value = false;
    trackIndex.value = (index + tracks.length) % tracks.length;
    loadedTrackIndex = -1;
    duration.value = 0; currentTime.value = 0;
    const track = currentTrack.value;
    loadCover(track, ++coverRequestId);
    if (source.value === 'local') {
      localStorage.setItem('roomMusicTrackIndex', String(trackIndex.value));
      audio.src = trackUrl(track);
      loadedTrackIndex = trackIndex.value;
      audio.preload = 'metadata';
      if (options.play || wasPlaying) await startPlayback();
      return;
    }
    audio.removeAttribute('src'); audio.load(); loading.value = true;
    try {
      const result = await musicRequest(`/tracks/${encodeURIComponent(track.id)}/playback`);
      if (epoch !== loadEpoch) return;
      audio.src = result.url; audio.preload = 'metadata';
      remoteExpiresAt = Date.now() + (result.expiresIn - 10) * 1000;
      loadedTrackIndex = trackIndex.value;
      preview.value = result.preview;
      if (options.play || wasPlaying) await startPlayback();
    } catch (error) {
      if (epoch !== loadEpoch) return;
      playbackError.value = error.message || '音乐连接暂时失败';
      cloud.failed(error);
    } finally { if (epoch === loadEpoch) loading.value = false; }
  }

  async function ensureTrackLoaded() {
    if (loadedTrackIndex === trackIndex.value && audio.src && (source.value === 'local' || Date.now() < remoteExpiresAt)) return;
    await loadTrack(trackIndex.value);
  }

  async function togglePlay() {
    if (loading.value) return;
    if (audio.paused) {
      await ensureTrackLoaded();
      if (loadedTrackIndex === trackIndex.value) await startPlayback();
    } else audio.pause();
  }

  function next() { return loadTrack(trackIndex.value + 1, { play: playing.value }); }
  function prev() { return loadTrack(trackIndex.value - 1, { play: playing.value }); }
  function useLocal() {
    if (source.value === 'local') return;
    ++loadEpoch; loading.value = false;
    audio.pause(); audio.removeAttribute('src'); audio.load();
    source.value = 'local'; tracks.splice(0, tracks.length, ...MUSIC_TRACKS);
    trackIndex.value = Math.max(0, Math.min(MUSIC_TRACKS.length - 1, Number(localStorage.getItem('roomMusicTrackIndex')) || 0));
    loadedTrackIndex = -1;
    preview.value = false; duration.value = 0; currentTime.value = 0;
    loadCover(currentTrack.value, ++coverRequestId);
  }
  const cloud = useMusicLibrary({ useLocal, selectTrack: async (track) => {
    if (source.value !== 'netease') { tracks.splice(0); source.value = 'netease'; }
    let index = tracks.findIndex(item => item.id === track.id);
    if (index < 0) {
      if (tracks.length >= 100) tracks.splice(0, 1);
      tracks.push(track); index = tracks.length - 1;
    }
    await loadTrack(index, { play: true });
  } });

  function setVolume(value) {
    volume.value = Math.max(0, Math.min(1, Number(value)));
    audio.volume = volume.value;
    localStorage.setItem('roomMusicVolume', String(volume.value));
  }

  function toggleDrawer(name) {
    drawer[name] = !drawer[name];
    if (drawer[name]) ensureTrackLoaded();
    Object.keys(drawer).forEach((key) => {
      if (key !== name && key !== 'open') drawer[key] = false;
    });
  }

  function toggleShell() {
    drawer.open = !drawer.open;
    if (drawer.open) ensureTrackLoaded();
    cloud.setOpen(drawer.open);
    if (!drawer.open) {
      drawer.volume = false;
      drawer.playlist = false;
    }
  }

  function destroy() {
    ++loadEpoch;
    cloud.destroy();
    coverController?.abort();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    loadedTrackIndex = -1;
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
  audio.addEventListener('error', () => {
    playing.value = false;
    loadedTrackIndex = -1;
    playbackError.value = '音频暂时无法加载，请点播放重试或换一首';
  });
  audio.addEventListener('ended', next);
  onBeforeUnmount(destroy);

  return {
    source, loading, playbackError, preview, useLocal, cloud, resetAccount: cloud.resetAccount,
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
    toggleShell,
    destroy
  };
}
