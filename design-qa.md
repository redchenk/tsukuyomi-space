# Room utility panel glass QA — 2026-09-22

final result: passed

## Target and evidence

The requested change unifies the diary, profile and notes windows with denser frosted glass and readable text. The existing transparent conversation is the visual reference for rounded edges and highlights; these reading/editing tools deliberately use a much stronger tint. The baseline captures are the problem state, not a pixel-perfect target.

- Before: `.codex_tmp/room-panels/before-profile.png`, `before-note.png`, `before-diary.png`, all 393 × 700 CSS/image pixels at 1×.
- Final full-view comparison opened together: `.codex_tmp/room-panels/comparison.png` (baseline profile, updated dark profile, updated light profile).
- The updated profile contains local fixture copy to verify saving and wrapping; the baseline is empty. Model poses differ naturally. The viewport, route and panel state match.
- Further evidence: `dark-diary.png`, `light-diary.png`, `light-diary-end.png`, `dark-note.png`, `light-note.png`, `desktop-light-diary.png`, `desktop-dark-note.png`, `small-diary.png`, and `keyboard-note.png` in the same directory.
- The 393 px panels are readable at native scale in the combined comparison; an additional enlarged crop was not necessary. The keyboard screenshot was opened separately to inspect the input and save control.

## Resolved review findings

1. P1: hard-coded opaque backgrounds and inconsistent inner surfaces made the tools diverge from the conversation design. A shared utility-panel class now supplies dark/light tint, edge highlight, border, 26 px outer radius, compact icon/title header, 44 px close and action controls, and themed inset reading/form surfaces. All three tools use the same treatment.
2. P1: a long diary and multiple entries could squeeze the actual prose to about 38 px high during the first iteration. Mobile entries now use a bounded 120 px list, a compact metadata row, and a non-collapsing reader. The diary body can scroll as needed; at 393 × 700 the prose area is 224 px and can scroll to the final sentence. Desktop gives the diary a 720 px window with distinct list and reading columns, removing unused grid rows and text collisions.
3. P1: keyboard appearance left the old navigation clearance below the note window and clipped the save control. Utility windows now use the visible viewport with an 8 px bottom inset during keyboard mode. The final 393 × 400 simulation shows the editor and complete save button together. Other controls keep their existing bottom offset.
4. P2: disabling blur under the existing reduced-performance profile allowed underlying text to show through. This profile now substitutes 97% dark / 98% light tint. It retains the existing performance policy, with no extra blur layers on individual controls.

No actionable P0/P1/P2 issue remains within this revision's scope.

## Design, accessibility and scope

- Existing fonts, purple accent, icons, artwork and Live2D assets remain. Labels/body text use 14 px; inputs use 16 px to avoid iOS focus zoom. Diary prose has 1.85 line height. Inputs and reading surfaces have 16–18 px rounded corners; primary actions remain site-style pills.
- Dark/light tokens separately define body ink, muted ink, borders and selected states. Conservative calculated contrast over worst-case black/white backdrops is 8.65:1 dark body, 5.75:1 dark muted, 10.18:1 light body, 4.99:1 light muted, and 5.91:1 white save labels on purple. These are token compositing calculations, not screenshot-based measurements of every pixel.
- The standard glass rule uses one 18 px blur per open tool window. The local browser selected the existing reduced-performance profile, whose no-blur fallback was visually verified. Reduced-transparency and forced-colors fallbacks are included.
- Notes now have an accessible textarea name. Focus outlines are visible. Close/save/import/export controls preserve 44 px targets. Existing diary selection, deletion confirmation, persona selection and import/export logic are retained.
- Chat transparency, Live2D rendering/resolution, music, shared navigation appearance and backend behavior are unchanged. The common header icon is opt-in, so the chat title is unaffected.

## Validation

- Reviewed 393 × 700, 320 × 568, desktop 1440 × 900 and a 393 × 400 keyboard simulation. Verified long diary scroll reaches the final sentence and no horizontal document overflow on the tested narrow view.
- Imported a local-only three-entry fixture through the existing file chooser. Saved profile and notes through the UI, then reloaded and verified their values persisted. No production personal data was modified, and no diary was deleted.
- 158 Room/navigation/performance tests passed. Both domestic and overseas production builds succeeded (94 files each). `git diff --check` passed.
- Physical iOS Safari keyboard and device performance were not tested. The keyboard check uses the application's existing viewport/focus detection in a resized browser. Live AI/TTS were not invoked.

## Release

The incremental packages contain six changed hashed assets and the HTML entry, about 144 KB compressed per site. Deployment validates hashes, backs up and atomically replaces the entry, and leaves existing asset files in place. Music, models, backend code and user data are outside this update.
