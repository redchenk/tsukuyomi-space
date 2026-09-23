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
