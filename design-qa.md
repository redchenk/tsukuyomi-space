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
