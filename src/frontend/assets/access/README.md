# Sea shrine entrance

The opening plays once from 0 to 10 seconds. Both versions retain the optical tunnel and render the water arrival in their own aspect ratio. From 7.05 seconds the approaching camera settles into the frontal dusk pose. Its position, rotation and field of view reach the live camera's values with zero velocity at the handoff.

The editable opening track is `src/frontend/services/shrine/approach.js`. To render seconds 5–10, use the source film's scene, splash optics and lighting at 30 fps. Pass its original `shotAt` sampler to `approachPose` and apply the returned perspective pose directly. Join the first 150 tunnel frames to arrival frames 150 through 299. Use the canvas drawing buffer for the full frame in either aspect ratio.

The WebGL drawing buffer outputs sRGB. Encode the clips from that buffer using a limited-range BT.709 Y′CbCr matrix. Mark both the H.264 stream and the MP4 `nclx` container with BT.709 primaries (1), sRGB transfer (13) and BT.709 matrix (1). This lets the browser present the video and canvas at the same brightness. The opening's last decoded frame stays visible until the renderer paints the waiting pose. Devices without WebGL keep that video frame on screen.

After encoding these sRGB frames, write the matching tags to each opening and nightfall clip.

```sh
ffmpeg -i encoded.mp4 -map 0:v:0 -map_metadata -1 -c:v copy \
  -bsf:v 'h264_metadata=colour_primaries=1:transfer_characteristics=13:matrix_coefficients=1:video_full_range_flag=0' \
  -color_range tv -color_primaries bt709 -color_trc iec61966-2-1 -colorspace bt709 \
  -movflags +faststart+write_colr web.mp4
```

At 10 seconds `AccessShrine.vue` holds the time of day at dusk. It uses the original gate meshes, instanced lanterns, sky textures, water reflection pass and lantern bloom from `tsukuyomi-shrine`. The editable scene is in `src/frontend/services/shrine/`, with its textures in `shrine/materials/`. A real perspective camera drifts gently sideways and turns. Water has a separate clock and continues to ripple while waiting.

Clicking Enter starts the 2.3-second pullback and night lighting. The camera continues the current head movement and eases it out over the first 1.35 seconds. The measured gate widths of the original shot shape the dolly curve. The scene keeps drawing during the dissolve into the mounted Hub. Pausing the background freezes the hold in its current pose. Hidden tabs suspend drawing and leaving Access releases the WebGL context and its resources.

The H.264 ending and WebP stills support early clicks, reduced motion and devices without WebGL2. To reproduce the still or fallback ending, use the same `createShrineRenderer` at 1440 × 810 or 576 × 1024. Draw with zero held time and sample travel and water time together at 30 fps from 0 through 68/30 seconds. Capture the canvas drawing buffer at its native dimensions. The first frame supplies the still. Reduced-motion and data-saving preferences use only the still.
