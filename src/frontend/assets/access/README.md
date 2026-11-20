# Sea shrine entrance

The first five seconds use the optical tunnel from the shrine artwork. At five seconds the camera breaks the water surface. A cut at eight seconds shows the side braces and nearby lanterns. The side camera tracks laterally until the cut at ten seconds. The next shot opens directly on the frontal dusk composition from the reference film. The editable approach is in `services/shrine/approach.js` under the frontend root.

The film, live hold and ending all use the same physical timber, sunset lighting, shadows, reflection, focus and film grade. The landscape and portrait shots are rendered separately. On the opening’s ended event, the frontal camera takes over. A still from that same frontal camera covers the cut when the live scene is loading. At dusk the water keeps moving and the camera drifts gently. Clicking Enter carries that movement into a 2.3-second pullback, followed by the dissolve into Hub. Devices without WebGL2 hold the frontal still and play the matching ending. Reduced-motion and data-saving preferences use the still.

To regenerate both openings, both endings and both posters, run this command from the repository root with Chrome and an FFmpeg build with libx264 available.

```sh
node scripts/render-access-shrine.mjs /path/to/tsukuyomi-shrine
```

The artwork directory supplies `assets/entry-tunnel.mp4` and its optical shader in `src/crossing.js`. The rest comes from the site's scene in `src/frontend/services/shrine/` and its textures in `shrine/materials/`. Set `FFMPEG` or `PW_CHANNEL` to override the encoder executable or Chromium channel.

Capture uses the canvas drawing buffer at 1440 × 810 or 576 × 1024, at 30 frames per second. Each opening has 300 frames and each ending has 69. Both H.264 and the MP4 container use BT.709 primaries, sRGB transfer and the limited-range BT.709 matrix so video and canvas present the same dusk exposure.
