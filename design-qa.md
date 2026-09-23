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
