# Terminal style alignment — design QA

Date: 2026-09-15. Earlier community/Room QA remains in Git history.

## Visual target and evidence

The requested target is the current site's visual language, applied to the existing Terminal management workspace. The Stage reference supplies palette, typography, surfaces and controls; Terminal retains its navigation and tables. Different route content and density are intentional.

- Source visual truth: `/Users/yxy/.codex/visualizations/2026/09/15/terminal-style/reference-stage-dark.png`.
- Original Terminal: `before-dashboard-dark.png`, `before-login-dark.png` in the same directory.
- Final desktop implementation: `dashboard-dark.png`, `dashboard-light.png`, `login-dark.png`, `login-light.png`, `settings-dark.png`, `settings-light.png` in the same directory.
- Mobile implementation: `settings-mobile-light.png`, `articles-mobile-light.png`, `login-mobile-dark.png` in the same directory.
- Browser-rendered local implementation: `http://127.0.0.1:4175/terminal`, using a disposable test database.
- Desktop captures: 1280 × 720 image pixels and CSS viewport, 1:1 density, no frame or rescaling. Mobile: 390 × 844 pixels and CSS viewport, 1:1 density. The 1024 × 768 breakpoint was also inspected.
- States: authenticated dashboard, article list, settings, users; unauthenticated Terminal login. Test account data only. Theme transition frames were excluded from the final dark login capture.

## Comparison and findings

The Stage source and final dark Terminal dashboard were opened together in one comparison input. Original and revised Terminal login captures were also opened together at the same desktop viewport. The reference is a cross-screen design-system reference; its article layout is not the intended Terminal layout.

1. Fonts and typography: existing MiSans/system stack retained. The 26 px workspace/login heading, 14 px controls, 13 px table body and 28 px statistics give a readable management hierarchy. Mobile text inputs use 16 px; labels and long settings descriptions wrap inside their fields.
2. Spacing and layout: 20 px outer cards, shared 12 px controls, 16 px gaps, a 224 px desktop sidebar and bounded table scroll regions match the site's rounded treatment. The sidebar becomes a horizontal strip below 1081 px, and phone controls reflow into grids. Page width stayed within 390, 1024 and 1280 px viewports.
3. Colors and tokens: surfaces, text, muted text, accent, borders and shadows reference editorial tokens. Both themes were inspected. Status colors have readable light/dark values; filled destructive controls keep a dark red background with white text. Nested backdrop filters remain disabled.
4. Image quality and assets: the original fixed moonlit background and existing TsIcon library are reused. No replacement artwork, fonts, media, music or Live2D assets were added.
5. Copy and content: existing management wording, permissions, data and routes are preserved. Four tables gain descriptive accessible region names and keyboard focus targets.

Focused checks covered login fields, article filters/status badges, row actions, settings labels/checkboxes and mobile navigation at native screenshot size. No unresolved P0/P1/P2 visual findings remain.

## Iteration history

- Initial mismatch: separate blue/black Ant-style palette, small radii and 10–12 px controls. Replaced with site tokens, rounded surfaces, larger controls and readable typography. Evidence: original dashboard/login versus `dashboard-dark.png` and `login-dark.png`.
- P2 found during settings review: the checkbox inherited grid layout and separated from its label (`settings-light-v1.png`). Set its label to flex and checkbox to a fixed 18 px size. Rechecked in desktop light/dark and mobile: `settings-light.png`, `settings-dark.png`, `settings-mobile-light.png`; text is adjacent and aligned. Captures use different scroll offsets to expose the control; no pixel-position equivalence is claimed.
- Fixed dark filled-danger contrast and bounded the desktop sidebar against short viewports. Reviewed final states and responsive geometry after rebuilding.

## Verification

- Logged in to the temporary admin environment; logout returned to Terminal login.
- Opened dashboard, articles, users and settings. Search narrowed to one match; draft filtering showed the expected empty state; returning to all restored the list.
- Toggled a local checkbox without saving configuration and verified its checked state and alignment.
- Table width remains local: 338 px container for a 900 px table on mobile. Table focus is exposed; ArrowRight did not produce a reliable scroll measurement in automation and is not counted as a verified keyboard-scroll interaction.
- Zero browser console errors. 61 navigation/performance checks and both domestic/overseas production builds passed.
- Backend authorization, destructive actions, credentials and storage operations were not modified or invoked during visual QA.

final result: passed
