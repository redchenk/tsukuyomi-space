# Access — Moonlit garden

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

`AccessPage.vue` imports assets so Vite fingerprints them for immutable caching.
The browser selects one clip on entry. Reduced-motion and data-saving preferences
use only the poster. Autoplay failure also leaves the poster visible; entering
the website never waits for video. Hidden tabs pause playback, and leaving
releases the video. The animation control can pause and resume it manually.

Text, logo, button, copyright and configured registration links are real HTML,
not burned into the video. They support the existing Chinese/Japanese/English
interfaces. Existing website theme preferences are preserved; the entry scene
keeps the owner's approved moon-white and dusty-rose art direction.
