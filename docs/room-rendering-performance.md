# Room rendering performance

The Room canvas owns its WebGL context. Its dedicated drawing path sets the
framebuffer, viewport, active texture and clear state explicitly, then runs the
same Cubism mesh/mask drawing code without saving and restoring a shared GL
context. Other canvases retain the SDK's shared-context path.

Each drawable retains its own vertex, UV and index buffers. UVs and indices are
immutable model data and are uploaded once; deformed vertices are uploaded once
per model frame and reused by its mask and color passes. Renderer teardown frees
all buffers. Behavior parameters are prepared immediately before an actual model
draw, with an independent animation-frame fallback for older runtimes.

No model assets, textures, shaders, mask resolution, device pixel ratio, animation
intensity or target frame rates are reduced by this change.

## Rebuild and deployment

Run `npm run build:room-runtime` after changing the renderer. It creates the new
versioned r10 runtime without compressing models or overwriting the existing r9
runtime. The frontend imports r10 as a Vite URL asset, so `npm run build:web` and
`npm run build:web:overseas` include it in their hashed frontend assets.

Deploy only the generated frontend assets and switch `index.html` last. Retain
old assets for open tabs and rollback. Music, `/models*`, Cubism Core and existing
`/lib` resources do not need to be uploaded, replaced or deleted.

## Validation (2026-09-13)

- 144 frontend tests passed, including real buffer-write/release and render
  subscription/fallback tests.
- 11 browser regressions passed in local Chrome: mobile keyboard, drawer,
  navigation, diary generation/export and persona memory.
- Mac in-app Chromium benchmark, same local model, 600 × 650 CSS pixels at DPR 2,
  5-second warm-up followed by 15 seconds of idle rendering:

  | Metric | r9 | r10 |
  | --- | ---: | ---: |
  | Mean render callback cost | 111.46 ms | 3.95 ms |
  | Mean actual draw interval | 111.57 ms | 22.22 ms |
  | GL state queries per draw | 23 | 0 |
  | Mesh/mask draw calls | about 400 | about 400 |

  These are measurements on one Mac/browser, not a guarantee for every device.
  A fixed-time 1200 × 1300 canvas comparison differed at 49 of 1,560,000 pixels,
  with maximum channel error 4/255 and no visible detail loss.
- Native Safari was unavailable while the Mac was locked; no physical iOS
  device was available for verification.
