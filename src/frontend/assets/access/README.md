# Room opening — Moonlit garden

The background comes from the video supplied and approved by the site owner.
The original upload is preserved outside the repository; the website uses
these small, self-contained derivatives, without changing existing shared
video, music or Live2D resources.

- Desktop: H.264 Main, 1600 × 900, 30 fps, approximately 3 MB.
- Mobile: H.264 Main, 960 × 540, 30 fps, approximately 1.2 MB.
- Poster: first video frame, WebP, 1600 × 900, approximately 234 KB.
- Duration: about 7 seconds. Both clips are silent and optimized for initial
  playback with the MP4 metadata at the beginning (`faststart`).
- `manifest.json` records byte sizes and SHA-256 checksums.

`RoomEntrySplash.vue` imports these assets so Vite fingerprints them for immutable
caching. The browser selects one clip while Room loads. Reduced-motion and
data-saving preferences, or autoplay failure, leave the poster visible. The
Room reveal is driven by room readiness and never waits for the clip.

The homepage uses the separate [1080p Water Mirror assets](water-mirror/prompts.md).
