# Pixel workbench redesign QA — 2026-10-03

final result: passed

## Source and implementation

Source: user-supplied `/Users/yxy/Downloads/pixel-redesign.png` (3840 × 2160)
and `/Users/yxy/Downloads/pixel-redesign.html`, plus the retrieved design
conversation “重绘Pixel界面” (`6ac0a9ad-53fc-83ee-9d44-4433fa9f12a4`).
The supplied files supersede the earlier missing-source preflight.

Implementation: the existing `/pixel` route (`ArenaPage.vue`) and a scoped
workbench stylesheet. Local running app: `http://127.0.0.1:4180/pixel`.
No parallel community, authentication, or navigation system was introduced.

## Visual comparison

The source PNG was normalized to 1920 × 1080, the same viewport as the
implementation capture. Full-view and focused colors/tools comparisons were
captured and inspected in `.codex_tmp/pixel-redesign/`:

- `comparison-desktop.jpg`, `comparison-properties.jpg`, `comparison-tools.jpg`.
- `desktop-light.jpg`, `desktop-dark.jpg`, `desktop-1366.jpg`.
- `tablet-light.jpg` (768 × 1024), `mobile-light.jpg`, `mobile-dark.jpg`
  (390 × 844), `mobile-publish.jpg`, `mobile-gallery-final.jpg`.

The drawing occupies the central workspace; document actions are compact,
left drawing tools remain labeled, colors stay on the right, and secondary
settings collapse. The supplied 192 × 108 moon-house artwork was extracted
from the HTML's raster data as a 4.7 KB, 40-color PNG and is an optional,
fully editable example. Existing artwork palette indices remain compatible.

Intentional deviations requested by the user: retain the existing global TOP
navigation (desktop and mobile), site MiSans typography, purple accent tokens,
light/dark surfaces, pill action buttons, and floating music/companion. The
reference's global side navigation was omitted. Canvas aspect ratio and exact
example artwork were preserved; the canvas fits the space left by the existing
header. No horizontal overflow at 390, 768, or 1366 px was observed.

## Iteration and resolved findings

- P1: legacy grid-row rules separated tools and canvas — explicit workbench
  columns/rows restore one contiguous editor.
- P2: canvas paint containment clipped rulers — containment removed on the
  zoom surface; rulers remain visible around the fitted canvas.
- P2: native hue range appearance was blank in WebKit — functional accessible
  native range now overlays a rendered gradient track and hue cursor.
- P2: global input height made the context bar oversized — brush range height
  scoped to 20 px.
- P2: mobile tool buttons wrapped into four tall rows — independent tool
  classes and a four-column mobile row prevent legacy style collisions.
- P2: icon-only mobile document buttons lost accessible names — explicit
  localized labels retain names when visible text is hidden.
- P2: gallery sort and artwork actions became tall on mobile — compact pill
  controls and non-growing action buttons restore a single usable row.
- Property panels scroll independently, including a bottom reserve so their
  contents can be moved clear of the site's existing floating companion.

No outstanding P0/P1/P2 design finding was identified in the final views.

## Interaction and checks

In-app browser interaction on the local fixture server verified brush strokes,
fill, eraser, exact undo/redo screenshot restoration, refresh restoration,
fit/zoom, focus mode with the global header retained, HEX entry, keyboard hue
adjustment, native image file import, changing canvas dimensions and undoing
that change, guest draft carry-through at login, publication through the real
API with a local synthetic account, gallery preview/close, and mobile dialogs.
No test content was posted to production.

PNG export now provides a generated image preview and explicit download link;
mobile users can long-press the preview to save. The browser-generated PNG was
read from the visible preview and decoded successfully: PNG, 1536 × 864,
41 colors for the test drawing. The in-app browser's download event did not
report a native download, so OS download UI and physical iOS saving remain
real-device acceptance boundaries; the generated file/preview were verified.

Automated checks: `npm run test:frontend` passed 283/283; color conversion
boundary/round-trip tests passed 3/3. Domestic and overseas frontend builds
are performed locally. Existing Playwright regressions were updated for the
new controls and draft/export recovery; Playwright CLI was not run because
this skill requires separate permission, and equivalent browser interactions
were performed through the allowed in-app browser. No console warnings/errors
were observed during the verified interactions.

The draft is bounded, device-local and account-scoped. Restoring a draft never
authorizes updating a previously published artwork. Publishing retains the
existing API authentication and moderation paths. No dependency, database,
secret, server resource limit, Live2D, or music change is included.

---

# Room settings summary card QA — 2026-09-23

Status: **passed**.

## Scope and reference

The user reported square gray backgrounds in “当前设置” on `/room/settings`.
The existing rounded settings cards and site radius tokens are the reference;
this is a focused geometry fix, with no copy or settings behavior changes.

## Findings and resolution

- **Pass 1 — P2:** The global readability rule supplies a background and shadow to
  each `.room-setup-summary-item`, but the page only supplied a top border. The
  three adjoining rows formed a square gray block inside a rounded container.
- **Pass 2 — resolved:** Each status row uses a 12px radius, a full theme-aware
  border, horizontal inset padding, and 8px separation. The form, summary and
  help card share the site's 18px card radius. No open findings in this scope.

## Visual checks

Local route: `http://127.0.0.1:5173/room/settings`.
Desktop: 1280 × 900. Mobile: 393 × 852. Both light and dark themes.
Synthetic model configuration; status rows show model, voice off, memory off.

- Typography: labels and values retain the existing type scale and hierarchy.
- Spacing/geometry: rounded rows remain inside the summary; no horizontal
  overflow on mobile; clear spacing separates all three status rows.
- Colors: existing theme-aware surfaces and text remain readable in both themes.
- Assets: existing settings/status icons retained and aligned.
- Copy: all text, settings values, progress indicator and controls unchanged.

Before and after desktop screenshots were viewed together in `comparison.png`.
Mobile light and dark screenshots were individually inspected.

Evidence (local, ignored artifacts):

- `.codex_tmp/settings-card/desktop-dark-before.png`
- `.codex_tmp/settings-card/desktop-dark-after.png`
- `.codex_tmp/settings-card/comparison.png`
- `.codex_tmp/settings-card/desktop-light-after.png`
- `.codex_tmp/settings-card/mobile-light-after.png`
- `.codex_tmp/settings-card/mobile-dark-after.png`

## Validation and limits

Domestic and overseas production builds pass. `git diff --check` passes.
Responsive checks used the in-app browser; physical iOS was not tested.
No new unit tests were added for this CSS-only geometry change.

# Plaza text containment QA — 2026-09-23

Status: **passed locally**.

## Scope and reference

The user reported that long author names and publication times escaped Plaza
message cards. I checked the message list, nested replies, controls, pagination,
sidebar activity, topics and friend cards at desktop and mobile widths. The
current Plaza card style is the reference; this pass changes only containment.

## Findings and resolution

- **Pass 1 — P2:** At 320px, the message list's implicit grid column kept its
  min-content width (about 361px) inside a 261px container. Cards extended past
  the wall and clipped message text. The author button's unnamed flex child also
  retained its intrinsic width when names were long.
- **Pass 2 — resolved:** The message list explicitly uses a shrinkable column.
  Cards and replies can shrink; author details can shrink within the button;
  names show an ellipsis while publication times wrap and remain complete.
  Long unbroken message and reply text wraps inside the card. No remaining
  unintended overflow was found in the checked Plaza surfaces.

## Visual checks

Route: `http://127.0.0.1:5173/plaza`. Desktop 1280px, tablet 768px,
mobile 390px and narrow mobile 320px. Both light and dark themes. Local
throwaway test data included a long mixed Chinese/Latin username, a full date,
200 continuous letters, a long URL-like reply and a topic.

- Typography: nickname remains prominent; full date, level badge and message
  number remain readable. Long nickname keeps its full accessible button name.
- Spacing/geometry: all message cards remain within the wall; 320/390/768/1280px
  document widths match the viewport. Message bodies, replies and side activity
  fit their containers. The filter row retains its intentional horizontal scroll.
- Colors: existing light/dark surfaces and text contrast are unchanged.
- Assets: avatar size and clipping remain intact.
- Copy: no displayed strings or user content were changed.

Evidence (ignored local files):

- `.codex_tmp/plaza-overflow/mobile-320-before.png` — original live clipping.
- `.codex_tmp/plaza-overflow/mobile-320-dark-after.png` — local narrow layout.
- `.codex_tmp/plaza-overflow/mobile-390-light-after.png` — local light mobile.
- `.codex_tmp/plaza-overflow/desktop-light-after.png` — local desktop.
- `.codex_tmp/plaza-overflow/comparison-mobile.png` — before/after comparison.

The before/after images contain different messages because the after image uses
synthetic data to stress long names and continuous text. They share a 320px
viewport. Physical devices were not tested.

## Validation

`tests/frontend-performance.test.js`: 17 passed. Domestic and overseas Vite
production builds pass. `git diff --check` passes. No new test was added for
this CSS-only fix.

## 2026-09-25 · Room desktop redesign

- Source of truth: user-selected `yachiyo-room-redesign.png` (2880 × 1620), and the supplied “重绘Room页面设计” conversation. Compare at **1440 × 810 CSS px**, with the source normalized from 2× to 1× density; IAB screenshots are 1440 × 810 pixels.
- Preview: http://127.0.0.1:4174/room. Local SQLite test account and explicitly seeded sample conversation; no sample messages or invented growth levels enter the production bundle. Live2D is the actual existing model/runtime. Live model poses vary between captures.
- Visual evidence (local, ignored artifacts): `.codex_tmp/room-redesign/reference-1440.png`, `before-desktop.png`, `iteration-1.png`, `desktop-light-1440.png`, `desktop-dark-1440.png`, `desktop-dark-1920.png`, `desktop-profile-1440.png`, `mobile-note-390.png`.
- Compared source and implementation together at the same size. Checked full composition, navigation/header, scene title/model framing, bottom controls, chat identity/tabs, message bubbles and composer. Desktop scene/chat occupy approximately 58%/42%, with 17px separation, 21px corners, and a 52px command bar. Chat never covers the stage; each workspace owns its scrolling.
- Iteration 1 found legacy heading colors, collapsed rail labels, conflicting assistant bubble rules and a Teleport target mounted too early. Fixed by scoped desktop overrides, restoring label height and rail alignment, and mounting the utility Teleport only after its host exists.
- Iteration 2 found dark-theme input/greeting contrast and narrow toolbar buttons losing accessible labels. Fixed theme variables, explicit scene text colors, and persistent accessible names. The existing material role stays intact; Room supplies flatter surface variables.
- Preserved deliberate product differences from the static study: real account/growth status; existing short-message presentation and Mem0 context; live illustrated avatar from the existing asset; current-session history navigation; voice settings opens the existing TTS configuration. Scene menu shows real room weather/settings. No fake voice-call or scene-switching service is presented.
- Interaction checks in IAB: desktop chat draft survives tab changes; profile editing/saving; saved desktop note survives reload and is readable on phone; diary empty/sync state; keyboard-accessible tab semantics; copy reply matches clipboard; expression and motion controls; full-screen entry/exit; screenshot download feedback; existing music drawer opens/closes; article search opens `/stage?q=…`. Full-screen music action exits full screen before opening the shared drawer.
- Responsive checks: 1440 × 810, 1024 × 720, 1920 × 1080 and 390 × 844. No horizontal document overflow; a single Live2D canvas; phone tools and saved data remain available. Both light and dark themes reviewed. Local checkout intentionally lacks server-only FLAC files, so audio loading is verified against production resources separately; no audio assets are replaced.
- Automated verification: full existing `npm test` passed (207 API/security, 16 mail, 235 frontend, 5 Mem0); subsequent frontend run passed 235/235. Production Vite build passed. Added three CI browser regressions for pending replies/drafts during tab changes, saved notes after phone resize/reload, keyboard tabs, stale floating positions, and 1024/1920 desktop bounds.
- Resource safeguard: fresh domestic/overseas protected manifests are stored under `.codex_tmp/room-redesign/*-before.json`; deployment uses the existing allowlist and manifest checks. Only frontend source, browser tests and this report are changed.

**Final result: passed — desktop visual and local interaction QA.** Production rollout and the new CI browser cases are verified as part of the release, after this report's commit.

- First release CI passed 58/59 browser cases, including all three new workspace tests. The existing direct-TTS test selected the first generic action and clicked the new copy button; it now selects the explicit playback label and still asserts the provider request/auth/payload. Reply actions also place playback before copy. Legacy-position fixtures use real CSS `left`/`top` values.
- Follow-up CI passed all 59 browser cases and deployed both sites. Production resource audit verified all 433 protected files unchanged (content and metadata). Overseas visual review found the new search placeholder was untranslated and automatic translations misnamed several controls; fixed the desktop UI strings in the existing static English dictionary and shortened English rail labels while preserving full accessible names and tooltips.

## 2026-09-25 · Room palette alignment

- Updated target: retain the selected Room layout, but match the established website palette, as explicitly requested after the redesign. `/stage` is the color reference; its light/dark screenshots and Room were compared together at 1280 × 720 CSS pixels, DPR 1. These are different routes and content; the comparison concerns shared color roles, not identical geometry.
- **P2 found and resolved:** Room had a separate blue-gray palette, blue primary controls, and a pale stage toolbar/greeting even in dark mode. It now consumes the existing editorial surface, text, border, accent and primary-button tokens. The site's existing moonlit background is shared through one theme token; no image or runtime asset was changed.
- Evidence: `.codex_tmp/room-redesign/palette-site-light.png`, `palette-site-dark.png`, `palette-room-light-1280.png`, `palette-room-dark-1280.png`. Earlier full-layout screenshots document the separate palette before this correction. Post-fix screenshots were compared together for each theme. Header, tabs, chat bubbles and stage toolbar are readable at this size, so no additional cropped image is needed for this focused color pass; profile fields and the expression menu were also visually checked.
- Required surfaces: fonts and hierarchy unchanged; layout rhythm retained (only theme-colored 1px boundaries added); colors now resolve to the same public-site values (light ink `#292738`, accent `#60439f`, white cards; dark card `#1b1e2c`, lavender accent); existing image crops and Live2D remain intact; copy/content unchanged. Both themes have coherent selected, hover and focus colors. No horizontal document overflow at 1280px.
- Validation: 235/235 frontend tests and domestic production build pass. No new tests added for this CSS-only refinement. Existing CI browser/deployment checks continue to gate release.

**Final result: passed — website palette aligned in both themes.**

### Follow-up: shared button geometry

- User requested the same button corners as the rest of the site. Room now uses `--ts-radius-button` for all desktop buttons and rail controls. Workspace tabs use the site's pill-shaped selected state; icon-only header and stage controls have equal width and height.
- Compared the Stage reference and `.codex_tmp/room-redesign/buttons-room-dark.png` together at 1280 × 720. All visible chat controls, profile controls and expanded expression-menu buttons resolve to `999px`; no remaining square-button exceptions were found. Keyboard Home still switches and focuses the first workspace tab.
- Typography, copy, palette and assets remain unchanged. Tab spacing was tightened to preserve room for all four tabs and settings on smaller desktop widths. Existing frontend checks pass 235/235; production build passes.

**Final result: passed — button geometry follows the shared site token.**

# Mobile Room floating conversation — 2026-09-25

Source visual truth: `/Users/yxy/Downloads/ChatGPT 图像 2026年9月25日 15_44_09.png`.
Implementation: `http://127.0.0.1:4174/room`, authenticated local fixture, latest reply, light theme.
Reference is 941 × 1672 pixels, normalized to 393 × 698; browser capture is 393 × 698 CSS/pixels at density 1. The reference's OS status bar is not app UI and is not reproduced. This is an adaptation using the site's existing Yachiyo model, scene, theme tokens and bottom navigation, as requested.

## Initial comparison

Full view: `.codex_tmp/room-redesign/mobile-scene-comparison.png`.
Focused header/chat/composer: `.codex_tmp/room-redesign/mobile-scene-details.png`.

- P2: The character occupied too little of the scene compared with the reference. Increase the mobile canvas's height and move it upward while keeping the face clear of the header and transcript.
- P2, already corrected during rendering checks: global strong-text styling made the mobile title dark on the scene; a scoped text token now keeps it readable in both themes.
- P2, already corrected: inherited diary body height left a large empty sheet; restored content-driven height with bounded internal scrolling.
- P2, already corrected: the empty conversation's title could scroll into the fade due to redundant Live2D-ready system text. Hide that technical startup notice on phones and keep the welcome compact.

final result: blocked

## Final comparison and resolution

The second combined comparison was opened and reviewed after enlarging the character:
`.codex_tmp/room-redesign/mobile-scene-comparison-final.png` (full view) and
`.codex_tmp/room-redesign/mobile-scene-details-final.png` (header, bubbles and composer).
The larger canvas now gives the character the intended presence, with the face clear of the conversation. No actionable P0/P1/P2 findings remain.

Required surfaces:
- Typography: site serif heading, inherited UI/body font, 14px chat with 1.75 line height, 16px editable input. No compressed controls or unintended vertical wrapping; heading contrast corrected in both themes. Larger chat type than the reference is intentional for phone readability.
- Layout: no conversation card/background/border/blur; only message bubbles and composer have surfaces. Transcript begins around the center, fades over 40–56px, scrolls independently, and leaves the newest reply above the composer. Header actions and composer buttons are 44–46px. Bottom site navigation remains reachable with a 6px minimum composer gap.
- Color/tokens: existing `--ts-*` surfaces, accent, text and `--ts-radius-button`; no separate blue palette. Light/dark checked. The single small blur strip softens fading history; reduced-transparency/performance modes retain opacity fading without costly blur.
- Assets: existing protected room background, live Yachiyo model and source character portrait. No artwork/model/music files changed or generated; the reference's brown-haired illustration and OS chrome are deliberately not substituted into this existing site. Existing icon system retained.
- Copy/content: real Room actions, familiar labels and current short-reply presentation; left menu contains new chat, history, diary, profile, notes, end/journal, music, growth and quiet company. Right settings link uses the existing route. New labels also included in the overseas static translation map.

Interaction checks in the in-app browser: history-to-start and return-to-latest; bubble action menu; diary and note panels; music open/close; settings navigation; site navigation and theme switch; empty conversation; multi-line draft with independent send button. New conversation uses the existing reset path; long-term memory logic is unchanged. Existing diary-after-send and keyboard tests are retained with updated mobile entry points. Added a regression for reading older messages while a new reply arrives.

Responsive evidence: 360×640, 393×698, 390×844, 740×390 landscape, and 1440×810 desktop. No horizontal overflow or composer/navigation overlap. Physical iOS keyboard not exercised here; the existing visual-viewport keyboard regression remains in CI.
- `.codex_tmp/room-redesign/mobile-scene-light-360.png`
- `.codex_tmp/room-redesign/mobile-scene-light-reference-size-final.png`
- `.codex_tmp/room-redesign/mobile-scene-light-390-final.png`
- `.codex_tmp/room-redesign/mobile-scene-dark-390-final.png`
- `.codex_tmp/room-redesign/mobile-scene-diary-final.png`
- `.codex_tmp/room-redesign/mobile-change-desktop-regression.png`

Browser console: no errors in the checked Room state. Both frontend variants build, 235 frontend tests pass, `git diff --check` passes. Full browser regressions and protected-resource release verification run in the existing deployment workflow.

Follow-up polish: none required for this scope.

final result: passed

---

## Gallery redesign QA — 2026-10-02

Scope: `/gallery` and `/gallery/manage`. The selected ChatGPT conversation is
`6abfb12f-0ac4-83e8-b427-81a81e30079b` (重新设计Gallery页面). Its supplied visual
is the source of truth for compact heading, consolidated discovery controls,
four-column cards and preview actions. Existing website colors, backgrounds,
fonts and pill buttons take precedence over the reference's alternate palette.

Source: `/Users/yxy/Downloads/gallery-redesign.png` (3200 × 2276, 2× visual).
Implementation evidence: `.codex_tmp/gallery-redesign/desktop-final-1600.png`,
`mobile-light-final.png`, `mobile-dark-final.png`, `tablet-dark-final.png` and
`lightbox-desktop-v2.png` in the same directory. Desktop browser viewport was
1600 × 1138 at 1×; screenshot export contains 1600 × 1078 visible pixels. The
reference was normalized to 1600 × 1138, with the shorter implementation capture
padded rather than stretched. Mobile viewport: 390 × 844; additional overflow
checks at 320px and 820px. Local content and login are isolated test fixtures;
image titles, dates, counts, avatars and artwork are dynamic, not source copy.

Combined full-frame comparison: `comparison-final.jpg` (source left, current
implementation right). Focused toolbar/card comparison:
`comparison-focused-final.jpg`. Both combined inputs were visually inspected.

### Iterations and resolved findings

1. P2, spacing: inherited select and button minimum heights enlarged the toolbar;
   inherited grid margins widened the toolbar-to-card gap. Scoped heights and
   grid margin restore the compact hierarchy.
2. P2, typography/layout: the inherited card layout shrank metadata tracks and
   a title button's minimum height inflated card bodies. Explicit grid tracks,
   a semantic title heading and single-line metadata restore alignment.
3. P1, preview: the original image could overflow and push preview actions out
   of view. The image now fits a constrained container; the dialog scrolls and
   its actions wrap on mobile.
4. P2, mobile density: component-level badge styles defeated a layered hide
   rule. Narrow cards now omit the level badge while preserving uploader name,
   avatar and upload date. Full details remain in the preview.
5. Evidence refresh: one screenshot captured failed local fixture image loads.
   After reload all first-row images had nonzero natural dimensions; both final
   desktop/mobile evidence and combined comparisons were recaptured. No broken
   image capture is used as final acceptance evidence.

### Final comparison and interaction acceptance

- Fonts: existing MiSans/site fallbacks; compact 13px desktop card titles,
  readable one-line uploader/date metadata, clear heading and control hierarchy.
- Layout: four columns by default, optional three-column desktop view,
  automatic three columns on tablet and two on mobile. No horizontal overflow
  at 320/390/820/1600px. Cards use the site's 18px radius; buttons use pill tokens.
- Colors: existing editorial surface/ink/border and purple primary tokens;
  both themes reviewed. The site's background and global navigation remain.
- Images: real existing media displayed with lazy loading and cropped thumbnails;
  original aspect ratios remain intact in preview. No generated replacements,
  fake assets or invented image categories are shipped. Filter categories match
  real filename/metadata keywords; only existing metadata tags appear on cards.
- Icons: existing TsIcon library, consistent sizes and visible controls for
  upload, search, random browse, layout, paging, original view and download.
- Copy: clear public/manage separation, matching-filter explanation, loading,
  empty, retry and upload feedback. Counts and author credit use actual API data.
- Accessibility: labelled search/sort/buttons, pressed filter states, focus
  outlines, native modal focus handling, Escape/arrow navigation and focus return.
  Reduced-motion overrides and 16px mobile search prevent unnecessary motion
  and iOS input zoom. Physical iOS hardware was not exercised.

Verified with the real isolated backend: pagination, chronological sorting,
category/tag/search, empty reset, random preview, keyboard close/navigation,
login gate, upload and Markdown clipboard copy. Existing owner/admin permissions
are preserved; no production account writes were used for QA. Browser console
inspection returned no warnings/errors. Random browsing is user-triggered;
the previous background image polling was removed.

Automated checks: 198 frontend/API regression tests passed; the focused
frontend/security/upload run passed 85 tests, including after template formatting.
These counts overlap and are not added together. Domestic and overseas builds
passed. Release uses prebuilt assets and the existing memory-bounded safe release
helper, with protected resource hashes required before accepting activation.

Open actionable findings in this scope: none.

final result: passed

# Room settings redesign QA — 2026-09-25

final result: **passed** (design and local interaction review).

## Scope and source

Rebuild `/room/settings` around the supplied desktop, mobile and all-sections
references, while retaining the site's purple palette, pill buttons and existing
navigation. Source: `/Users/yxy/Downloads/yachiyo-room-settings.html` and the three
`yachiyo-room-settings-*.png` files in that directory. The linked “重新设计设置页面”
conversation was read for context. Its demonstration handlers and fabricated
configuration states were not used in the production implementation.

## Comparison method and evidence

The supplied HTML was rendered at the same CSS viewport as the implementation.
Source and implementation screenshots were opened together in one comparison
input for desktop (1280 × 720) and mobile (390 × 844), both in light mode. These
are viewport captures at equal CSS scale; no stretched images or full-page
stitching were used for the comparisons. Additional views cover mobile form
fields, dark memory management and the 768 × 1024 tablet breakpoint. Browser
screenshots were normalized by the screenshot API to CSS pixels; the source PNGs
were also inspected for the full-page section order.

Local evidence, under `.codex_tmp/settings-redesign/`:

- `reference-desktop.png` / `implementation-desktop.png`
- `reference-mobile.png` / `implementation-mobile.png`
- `implementation-mobile-fields.png`
- `implementation-mobile-dark-memory.png`
- `implementation-tablet-dark.png`

State differences are intentional: the source shows a fabricated configured
model and unsaved state; the implementation shows the actual unconfigured model
and real saved state. The memory view uses disposable local test data. No
production user data or API credentials appear in the captures.

## Required comparison surfaces

- **Typography:** Site typography and readable text colors replace the source's
  pale blue-gray styling. Headings, field labels, secondary English labels and
  helper text have distinct hierarchy. Model and key fields use 16px text on
  mobile to avoid iOS focus zoom. The previously stacked English labels are now
  inline; button labels do not wrap into vertical characters.
- **Spacing and layout:** Desktop has category navigation, one active form and
  contextual status. Mobile has a collapsed category selector and one form.
  Advanced fields are disclosed only when needed. The fixed save bar clears the
  site's bottom navigation; at 768px its bottom is 940px and navigation starts at
  948px. No horizontal overflow was found at 390, 768 or 1280px.
- **Colors and shapes:** Existing theme tokens supply the purple accent, surfaces,
  borders and text in both themes. Actions use the site's 999px button radius;
  form cards retain 18px corners. Selected states, switches, errors, muted helper
  text and disabled actions are visually distinct.
- **Assets and icons:** Existing site background, branding and icon component are
  retained. Six missing utility icons use upstream Lucide paths with its license
  in `docs/licenses/lucide.txt`. No illustrative placeholder or custom image substitute
  was introduced. The prototype's fake global rail is intentionally replaced by
  the real site's header and mobile navigation.
- **Copy and content:** Eight categories preserve all existing configuration
  areas. Model setup is required for chat; voice, knowledge and tools are optional.
  Status and storage wording describe actual browser/account behavior. Test
  results come from the real request; testing the LLM does not save its draft.

## Iterations and resolved findings

- **P2, cascade:** Global button/readability rules overrode selected navigation,
  input surfaces and switches. Put route styling in the existing editorial layer
  and supplied local input background tokens; recaptured both themes.
- **P2, navigation alignment:** Global button centering displaced category labels.
  Added explicit start alignment and flexible label width.
- **P2, mobile controls:** Global input minimum height expanded switches to 46px.
  Set switch height/min-height to 22px and removed inherited padding.
- **P2, mobile overlap:** The floating music control collided with the save bar.
  Place the closed control in the settings header, retain its expanded drawer,
  and keep the save bar above the existing bottom navigation.
- **P2, field labels:** A general label selector stacked bilingual field labels.
  Scoped an inline layout to the LLM labels and recaptured the mobile fields.
- **P2, memory edit state:** A saved expanded memory kept a stale expanded flag,
  leaving its unloaded content displaying a loading message. Collapse that entry
  after successful save before refreshing the list.
- **P2, dialog keyboard use:** Focus now enters the connection result dialog,
  stays within its controls, supports Escape and returns to the triggering button.

No remaining P0, P1 or P2 design findings in the reviewed scope.

## Functional validation and limits

- Production frontend build passed using the project's Node 20 environment.
- All 243 frontend tests passed, including 15 settings tests. Added checks cover
  independent category saving, invalid hidden section selection, draft-aware
  connection status and settings search.
- Local browser checks covered category switching, light/dark layouts, knowledge
  editor opening/focus/cancel, mobile fields and validation-dialog focus/Escape.
- An authenticated local memory was edited through the real backend, saved,
  reloaded and verified. No mocked save handler was used for that check.
- Browser console inspection returned no error entries.
- Existing end-to-end tests were adapted to the new category navigation. New
  Chromium and WebKit cases cover cross-category saving, intercepted connection
  responses, state invalidation, all eight sections and mobile footer geometry.
  Their final results are recorded by the release pipeline, separately from this
  visual review. No live paid model/TTS provider request or physical iOS device
  test was performed for this redesign.

### Release regression follow-up

The first pipeline run passed 70 of 72 browser cases. Two failures identified an
outdated save-button selector in a memory test and an ambiguous accessible name
on the voice-provider select. Updated the selector to the unified save bar and
added the select's explicit `aria-label`. The voice draft was then configured in
the local browser, saved from the memory category, and returned to Room
successfully. The 243 frontend tests and production build passed again; the full
pipeline is rerun before deployment.


# Unified navigation — 2026-09-26

final result: passed

## Scope and visual references

Applied the supplied navigation conversation and
`/Users/yxy/Downloads/tsukuyomi-navigation-demo.html` to the existing Vue shell.
The scope is shared navigation and search, not the reference's replacement home
page or its blue-gray palette. The site's purple accent, serif brand, pill
buttons, backgrounds and Room assets remain the intended visual system.

Reference and implementation were opened together in paired image comparisons:

- Desktop, 1280 × 800 CSS pixels / 1280 × 800 image pixels: `.codex_tmp/navigation-design/reference-desktop-light.png` with `hub-desktop-light.png`; `reference-desktop-menu.png` with `desktop-menu-light.png`.
- Mobile, 390 × 844 CSS pixels / 390 × 844 image pixels: `reference-mobile-menu.png` with `mobile-menu-light.png` in the same evidence directory.
- Additional implementation evidence: `room-desktop-light.png`, `room-mobile-dark.png`, `mobile-menu-dark.png`, `desktop-search-light.png`, `english-861.png` and `english-320.png`.

All captures are unframed browser content at 1:1 pixel density. Primary paired
comparisons use the signed-out, light-theme state. Supplementary Room and
narrow English captures use the isolated local test account. Existing home
content and the brand/color differences are deliberate, user-requested
adaptations; only navigation regions are compared for structural fidelity.
Header labels, controls and menu spacing are readable at native capture size,
so no additional crop was required.

## Findings and completed fixes

- **P1, readability:** A global reduced-performance material fallback made the
  navigation sheet translucent over high-contrast page content. Pin the material
  background token to the site's opaque surface. Both light and dark sheets
  were recaptured; the computed light surface is `rgb(255, 255, 255)`.
- **P2, hierarchy:** A duplicate desktop Wiki group left a mostly empty third
  column. Keep Wiki in the primary desktop bar and use two balanced Explore
  groups. On mobile, keep Wiki in the sheet and arrange entries in compact pairs.
- **P2, responsive width:** Signed-in Japanese navigation overflowed at 861px.
  Use short visible primary labels, preserve full accessible names, and allow
  the brand to truncate at intermediate widths. The English signed-in header
  was then checked at 861px and 320px with no horizontal overflow.
- **P2, Room overlap:** Remove the separate global side rail and place Room's
  local tools below the shared header. Desktop stage and chat reclaim the rail
  space. Mobile composer and five-item bottom navigation remain usable.

No remaining P0, P1 or P2 findings in this navigation scope.

## Required visual surfaces

- Typography: existing serif wordmark and body fonts retained; compact menu copy
  remains legible. Full control names are exposed to assistive technology.
- Spacing: shared 44px controls, 68px desktop / 60px mobile header, two-column
  desktop Explore, stacked mobile groups and safe-area spacing verified.
- Colors: existing light/dark purple tokens and notification red dot retained.
- Images: existing TsIcon, account avatars, backgrounds and Live2D reused;
  no new raster images or replacement media assets are introduced.
- Content: real route names and public article results, with loading, empty,
  error and retry states. No mock navigation target is shipped.

## Functional checks

- Local production frontend build and 247 frontend tests passed.
- CUA checks verified real article search and detail navigation, account login
  and account actions, Chinese/Japanese switching, English build widths,
  light/dark themes, modal focus/escape/scroll locking, and Room draft retention.
- Shared search supports page aliases, Ctrl/Cmd+K, arrow-key selection and
  ordinary links. Agent OS remains a native document navigation.
- Chromium and WebKit release regression cases cover shared search, API failure
  recovery, mobile/desktop bounds, Room tool clearance and signed-in Japanese
  navigation. Release CI is the authoritative record for their automated run.
- No external AI provider was called. No physical iPhone keyboard test was
  performed; existing mobile keyboard behavior and the WebKit regression suite
  are retained.


### Unified navigation release regression follow-up

The first release run passed 92 of 96 browser cases. The login assertion still
expected a permanently visible user-center link; it now opens the account menu.
The search failure fixture did not match the existing `/api/live/<nonce>/articles`
URL, so both browsers received real empty results instead of the injected error;
its route matcher now covers both public article paths. The WebKit settings test
exceeded the shared 30-second budget while checking sixteen transitions across
two themes. Each theme now has its own eight-category test with named steps;
all visibility, geometry, scroll and button-shape assertions remain in place.
The complete release pipeline is rerun before activation.


# Account menu alignment correction — 2026-09-26

final result: passed

The user screenshot showed the inbox row displaced from the other account rows.
The target is the existing left-aligned icon and label columns already used by
User Center, Bond Growth, Attachments and Sign Out. This is a scoped correction;
font, purple tokens, pill radii, labels and notification-dot behavior remain.

The fault was the generic `.site-menu-link > span` flex rule applying to the
NotificationBell wrapper as well as the label. Labels now have an explicit
`.site-menu-label` class; icons retain intrinsic width and a shared accent color.

Paired before/after captures were opened together from
`.codex_tmp/account-menu-fix/before-desktop.png` and `after-desktop.png`:
1280 × 800 CSS/image pixels, signed-in test account, dark theme, open account
menu. The screenshot supplied by the user is a cropped, differently scaled
production view; the local before image reproduces its same inbox displacement.
The post-fix mobile capture is `after-mobile.png`, 390 × 844 CSS/image pixels.
All local captures are at 1:1 density, with no browser frame. At native size the
menu's typography and alignment remain readable without further cropping.

**P2 fixed:** At 1280px, the inbox label previously began at x=1092 while all
other rows began at x=984. All five labels now begin at x=984, with all five
20px icons at x=952. At 390px, all labels begin at x=71 and icons at x=43.
No remaining P0/P1/P2 findings in the requested scope.

The five fidelity surfaces were checked: existing typography and copy remain;
row spacing and icon/label columns align; existing color tokens are retained;
existing vector icons remain sharp, with no new images. The actual inbox link
was clicked and opened `/notifications`. The 247 existing frontend tests and
production frontend build passed. No new test suite is needed for this limited
style correction; the normal release pipeline still runs before deployment.

# Mobile navigation keyboard recovery — 2026-09-26

final result: passed

The source is the user's IMG_5783.png attachment (1206 × 2622 including
iOS browser chrome), showing missing navigation labels after input and the
mobile character heading covering Live2D. The target is the existing Room
with all five navigation labels restored and that heading removed.

Local before/after images were opened together:
`.codex_tmp/mobile-nav-keyboard/before.png` and `after.png`, both 402 × 714
CSS/image pixels at 1:1 density, dark theme, guest Room. The local before
reproduces the heading overlap; desktop Chromium does not reproduce the
physical iOS text-paint failure. The after image contains an unsent test draft.
This comparison excludes native browser chrome, signed-in account controls,
chat-history differences and Live2D's changing animation pose. Labels and
heading region are readable at native size without additional cropping.

**P2 fixed:** The fixed navigation now leaves the paint/layout tree while the
keyboard is open, instead of only switching visibility, so restoration
rebuilds its text surfaces. Two local viewport contraction/recovery cycles
kept all five labels and the site title visible, preserved the unsent draft,
and the More menu opened successfully afterward. The existing WebKit and
Chromium keyboard regression now covers a second cycle, restored labels,
the site title and menu interaction. Physical iOS repaint verification remains
a device-specific coverage limit; simulated viewport checks cannot prove it.

**P2 fixed:** Removed the mobile-only character name and subtitle. A two-column
header keeps the 46px function and settings controls at the left/right edges.
Desktop character headings remain. No actionable visual findings remain in scope.

Fidelity surfaces: remaining font family/weight/size are unchanged; navigation
spacing and pill radii are unchanged; dark/light colors continue to use site
tokens; existing live model/background/vector assets are unchanged; only the
requested mobile heading copy was removed. `after-light.png` confirms the
same layout in light mode. No console errors were captured. Frontend build
and all 247 frontend tests passed; full release checks run before activation.

The first release run passed both keyboard cases and 97/98 browser cases.
The remaining WebKit settings case called `isVisible()` before the lazy page
mounted, skipped opening its category drawer and timed out. Its helper now
waits for the menu to be attached before checking the desktop/mobile layout;
all category, geometry and save assertions remain. The pipeline is rerun.

# Music, companion and menu polish — 2026-09-27

final result: passed

The visual target is the existing site with the four corrections requested by
its owner: an unobstructed desktop music entry, aligned mobile floating controls,
animated Explore/Account menus, and centered Stage category labels. Existing
purple tokens, pill buttons, typography and assets are retained.

Before/after captures were opened together in one comparison input:
`.codex_tmp/site-polish/before-desktop.png` and `after-desktop.png` at 1280 × 800;
`before-mobile.png` and `after-mobile.png` at 390 × 844. All are guest Stage,
dark theme, collapsed player, 1:1 CSS/image pixels, without browser chrome.
The mobile captures differ by about 1px in page scroll and the companion's
animation pose; neither affects the fixed-control comparison. Small category
labels are readable at native size and were additionally checked against their
rendered flex alignment; a separate magnified crop was not needed.

- **P2 fixed — desktop overlap:** The music control was behind the companion at
  the lower right. It now occupies the lower left; its expanded panel stays
  within the viewport and clear of the companion. Room's existing player
  placement remains intact.
- **P2 fixed — mobile alignment:** The music control was approximately 50px
  below the companion's center. Both now share a vertical anchor. At 390px,
  Stage centers are both y=689.305; Hub centers are y=711.000 and y=711.008.
  The smaller Hub sprite is accounted for. Both controls remain clickable and
  the expanded player leaves the companion available.
- **P2 fixed — menu motion:** Explore and Account now fade and translate in
  over 240ms and out over 170ms. Initial QA found the automatic low-power
  profile shortening the transition to 0.01ms. After the scoped correction,
  both menus report 240ms even in that profile. The system reduced-motion
  preference still disables these animations. Exit waits for completion before
  closing the native dialog and releasing its scroll lock. Escape restores the
  trigger focus; menu-to-search handoff transfers the lock correctly. Navigating
  to Gallery from a scrolled page restored normal body positioning at scroll 0.
- **P2 fixed — category label alignment:** Stage's category and author pills
  now use centered inline flex content with a 28px minimum height. The category
  text sits at the center of its background instead of near its top.

`after-mobile-light.png`, `after-hub-mobile.png` and `menu-mobile.png` additionally
verify the light theme, smaller Hub companion and mobile bottom sheet. The five
fidelity surfaces pass: fonts/weights/copy remain unchanged; spacing changes are
limited to the requested alignment; colors and radii continue to use site tokens;
existing illustrations, sprite and icons retain their quality and identity.
No actionable P0/P1/P2 findings remain in this scope.

The local production build and 247 frontend tests pass. No browser console errors
were captured. Chromium and WebKit release regressions now cover music/guide
access, mobile center alignment, actual menu animation completion, focus/scroll
restoration, search handoff, reduced motion and navigation after scrolling.
The full release pipeline must pass before activation. No physical iPhone test
was performed. Server Live2D, music and other persistent resources are excluded
from this code-only release.

Release regression follow-up: the first full run passed 103/106 cases. One
landscape check caught the mobile menu's initial 16px translation extending
4px below a 390px viewport. The translation is now 8px, inside the existing
12px bottom inset throughout the animation; the original strict bounds check
is retained. A fresh 740 × 390 capture (`menu-landscape.png`) was inspected and
an in-progress entrance measured bottom=379.56 with viewport height=390.
The two WebKit motion checks counted backdrop events because that engine omitted
`pseudoElement` metadata. They now select the menu's actual animation names,
keeping completion, duration, focus, scroll, search and reduced-motion assertions.
The complete release checks are rerun before activation.

## Plaza layout refinement — 2026-10-02

Reference: the selected conversation “重新设计Plaza页面”
(`6abf385d-f004-83e9-b2c9-a63c7a590de9`) and the current production Plaza.
The conversation's written layout decisions were readable; its sandbox mockup
attachments were not exposed. This is an adaptation of that layout to the
existing production design system, not a claim of pixel fidelity to those images.
The user's current palette, pill buttons, top mobile navigation and persistent
music/companion placement take precedence over the reference's alternate colors
and bottom navigation.

Evidence is in `.codex_tmp/plaza-redesign/`: `source-desktop-dark.png` and
`desktop-dark-guest.png` were opened together at 1440×1000, guest/default-feed
state. Production and isolated fixture content differ; counts, authors and
background availability are not compared as layout drift. Additional inspected
views cover 1280px desktop, 390×844 mobile in both themes, 320px narrow mobile,
and the authenticated composer. Screenshots use CSS-pixel dimensions at 1×.

Resolved findings:
- P2: the original hero/status/statistics consumed the first screen. The short
  intro and composer now precede the feed; statistics, rules and recent activity
  remain available in “关于广场”.
- P2: the first preview inherited the old panel's fixed width and a button-like
  author frame. The composer now fills its grid track and author/level/time have
  one shared alignment without an extra frame.
- P2: three expanded mobile support panels pushed the feed down. Their closed
  controls share one row; each opens on demand as a native disclosure.
- P2: query navigation remounted the page and discarded an unpublished draft.
  Plaza now owns topic-query changes without a remount. Selecting a topic and
  clearing it preserves the draft while correctly updating the URL.
- P2: legacy important dark-surface styles created a second composer background.
  A Plaza-only cascade bridge removes the inner frame and retains site tokens.

Required surfaces checked:
- Typography: existing MiSans/PingFang/system family; smaller heading and clear
  author/body/meta hierarchy. Long content wraps; levels stay adjacent to names.
- Spacing/layout: 24px desktop gutter, 300px support rail, single mobile column,
  rounded site cards and pill controls. No horizontal overflow at 320/390px.
- Colors: existing editorial surface/text/border/accent tokens and brand button
  gradient; light and dark states inspected. No new palette introduced.
- Images/icons: existing user avatars, music and companion retained; established
  TsIcon library used. No generated art, replacement illustrations or resource
  changes. Local fixture background differs from live settings, intentionally.
- Copy/content: focused Chinese/English/Japanese labels; explicit guest action,
  empty-search recovery, character count and real friend-link destinations.

The isolated local website was used for all writes. Verified login, publication,
like state, reply to a message, reply to a reply, latest-reply preview/full
expansion, topic filtering, draft retention, clear search, empty recovery and
8-item pagination (13 roots: eight on page one, five on page two). Support panels
and account/top navigation remain usable. Inputs have labels, copy has an
accessible icon-only label, filter state uses aria-pressed and disclosure state
is native. Reduced-motion removes the new chevron transition. Browser console
inspection returned no warnings/errors. All 283 frontend checks pass; build and
production asset/health/resource verification accompany release.

No actionable P0/P1/P2 issues remain in this scope. Physical iOS hardware was
not exercised; responsive checks used the in-app browser. Existing production
resource hashes must pass deployment verification before the release is accepted.

final result: passed


## User center workspace refinement — 2026-10-02

Reference: the selected conversation “重新设计用户中心页面”
(`6abf503e-b178-83e8-a6a1-d4133a99dc25`) and captures of the existing user center.
The conversation describes compact identity, grouped navigation, a focused
profile editor and real growth/security/Room support. Its sandbox mockup images
were not exposed. This implements the described structure using current site
tokens; it does not claim pixel fidelity to unavailable images.

Evidence is in `.codex_tmp/user-center-redesign/`. Source and revised desktop
light captures were opened together at 1440×1000; source and revised mobile
light captures were opened together at 390×844, authenticated/profile state.
The same fixture user is used; additional seeded articles/bookmarks/pixel art
change counts from the baseline. The built preview loads the existing site
background while the initial Vite capture did not. Those content/runtime
differences are excluded from fidelity judgments. Screenshots are at 1×.
Readable form/navigation details are inspected at mobile scale in addition to
the overall desktop comparison.

Resolved findings:
- P2: oversized identity/stat panels pushed editing below the first screen.
  Identity and statistics now share one compact header; immutable account
  information is a native disclosure below nickname/bio/save.
- P2: mixed labels and a horizontal mobile tab strip concealed destinations.
  Desktop navigation is grouped and searchable; mobile uses a labelled native
  section selector and a materials disclosure with real gallery/assets links.
- P2: tiny pixel canvases and squeezed mobile search hid useful content.
  Pixel previews now scale without smoothing; searches use a full mobile row.
- P2: no-match searches claimed that no content existed. Article, message,
  bookmark and pixel collections distinguish no matches and provide recovery.
- P2: the support security action changed content above the mobile viewport.
  It now scrolls to and focuses the selected section, respecting the top bar.
- P2: the bottom-right companion occupied the mobile primary save position.
  The primary save button is placed first on the left; persistent widgets keep
  their existing bottom positions and page content remains scrollable.

Required surfaces:
- Typography: existing MiSans/PingFang/system fonts and token colors; compact
  heading, name/level alignment, readable labels and meta. Long titles wrap;
  action labels keep their full horizontal text.
- Spacing/layout: 210/main/250 desktop grid; intermediate two-column layout;
  single mobile column. Inspected 1440, 1024, 390 and 320px. No horizontal
  overflow at 320/1024px; cards use site radii and controls retain pill shapes.
- Colors: existing editorial surface/border/ink and purple primary tokens.
  Light and dark previews inspected; no alternate reference palette introduced.
- Images/icons: existing avatars, music, Yachiyo companion and TsIcon preserved.
  PixelCanvasCells remains the real artwork renderer; no generated replacements.
- Copy/content: grouped Chinese/English/Japanese navigation and support labels;
  real XP and binding status. The growth link opens existing tasks rather than
  pretending a click performs check-in. Username and ID stay read-only.

Isolated local UI writes verified nickname/bio save and refresh persistence,
reset, draft retention across section changes, message editing and moderation
feedback. Verified section/search recovery, readonly disclosure, password-field
labels and missing-field feedback (no password changed), materials disclosure,
gallery and attachment destinations, and the article editor with seeded content.
The Vite preview twice failed to fetch the editor's lazy module; the production
build successfully loaded the same edit route and content. Built-preview console
inspection returned no warnings/errors. This development-preview limitation
is recorded separately from shipped route acceptance.

All 283 frontend checks pass. Build and release health/asset/resource checks
accompany activation. Physical iOS hardware and production account writes were
not exercised. Production resources are excluded from the release and hash
verification is required before accepting deployment. Unrelated in-progress
Fushi files are excluded from the commit and clean release builds.

Implementation checklist: compact header, grouped/mobile navigation, working
profile form and reset, read-only identity, real support state, readable content
actions, theme/viewport review, bounded prebuilt release.

final result: passed
