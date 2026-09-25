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
versioned r11 runtime under `src/frontend/runtime`, without compressing models or
writing to the protected `lib` directory. The frontend imports r11 as a Vite URL asset, so `npm run build:web` and
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

## Mobile keyboard and render budget (2026-09-25, r11)

The mobile scene now retains its pre-keyboard height and compensates
`visualViewport.offsetTop`. Only the conversation area contracts above the
keyboard. The page cannot scroll underneath it; focus/blur, delayed viewport
scroll events and keyboard dismissal preserve the scene size. A restored viewport
clears stale offsets. Pinch zoom does not activate keyboard compensation.
This follows the distinction between the layout and visual viewports in the
[Visual Viewport API](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport).

Unlike the r10 resolution policy above, r11 caps the dedicated touch-device
canvas at DPR 2 and approximately 2 million pixels. A 585 × 940 CSS-pixel canvas
on a DPR 3 phone therefore draws about 60% fewer pixels. This is a render-buffer
budget, not a reduction of model textures, mesh detail, expressions or physics.
Desktop and shared SDK canvases retain native DPR. Unchanged backing dimensions
are no longer assigned again, avoiding redundant WebGL allocation/clearing.

Both performance profiles start from a 60 fps target, including idle motion;
the measured render-cost budget still lowers it under load. This removes the
unconditional 24 fps mobile idle ceiling and 45 fps balanced idle cadence. The
target is not a measured or guaranteed physical-device frame rate.

Validation: 237 frontend tests pass. The keyboard pan/dismissal and history
regressions pass in Chromium and WebKit with an iPhone 13 viewport. They cover
a 176px pan, unchanged scene/canvas layout height, input visibility, locked
document scrolling and restoration after dismissal. No physical iPhone was
available; real iOS keyboard animation and device frame rate remain to be checked
on hardware. CI repeats these cases before deployment.

The r11 runtime is stored in `src/frontend/runtime` and imported into hashed frontend assets. Existing server `/lib`,
Live2D model, texture and music resources remain outside the release allowlist.
