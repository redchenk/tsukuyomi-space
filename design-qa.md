# Community UI and Room archive — design QA

Date: 2026-09-14. This replaces the earlier friend-link-only report, preserved in Git history.

## Visual reference and state

The approved direction is a moonlit anime community with readable surfaces, text navigation, a shorter illustrated hero, and visible recent creations. This is an intentional redesign, not a pixel clone.

- Approved brief: `/Users/yxy/.codex/visualizations/2026/09/13/tsukuyomi-ui-proposal/proposal.md`.
- Source visual truth: `/Users/yxy/.codex/visualizations/2026/09/13/tsukuyomi-ui-proposal/01-hub-desktop.png`.
- Final dark implementation: `/Users/yxy/.codex/visualizations/2026/09/13/tsukuyomi-ui-local/hub-desktop-dark.png`.
- Final light implementation: `/Users/yxy/.codex/visualizations/2026/09/13/tsukuyomi-ui-local/hub-desktop-light.png`.
- Local production previews: `http://127.0.0.1:4175` (Chinese), `http://127.0.0.1:4176` (overseas English build).

Source and final dark captures were opened together in one comparison input. Both are 1280 × 720 pixels at a 1280 × 720 CSS viewport, without frames or density normalization, showing the anonymous home page at the top in dark mode. The source has live statistics; local fixture counts and article text are not fidelity targets.

## Full-view comparison

- Typography: the serif display heading retains the site's identity. System sans-serif navigation and body copy, shorter heading, and measured line lengths improve hierarchy. Chinese, Japanese, and English layouts were inspected.
- Spacing and layout: content pages use text navigation. The hero is approximately 366 px tall, exposing the announcement and recent-content section. Room retains its rail and compact mobile drawer. Controls and surfaces share rounded geometry.
- Color and tokens: midnight and moon-white surfaces use lilac actions and restrained cyan accents. Layered glass filters and background breathing are removed on content pages.
- Image quality: existing Yachiyo illustration, background, icons, and assets are reused. Cropping and masking preserve the subject and readable copy. No Live2D resolution, texture, model, or music changes are included.
- Copy and content: recent articles precede statistics. Announcements, categories, search, account links, and secondary features remain accessible. Public copy contains no implementation notes.

## Focused and responsive evidence

Evidence directory: `/Users/yxy/.codex/visualizations/2026/09/13/tsukuyomi-ui-local/`.

- `hub-mobile-cards-light.png`, 390 × 844: readable card labels and contained bounds.
- `hub-mobile-english.png`, 390 × 844: translated heading, actions, and bottom navigation.
- `hub-900-english.png`, 900 × 900: navigation no longer overlaps account actions. Navigation right edge 564.75 px, actions left edge 574.75 px; no document overflow.
- `article-desktop-reading.png`, 1440 × 900: readable article measure, heading hierarchy, and sticky contents. Article text differs from the source; this checks reading hierarchy, not line-for-line fidelity.
- `room-mobile-tools-collapsed.png`, 390 × 844: tools start folded at the upper right, leaving Live2D visible.
- `room-mobile-diary.png`, 390 × 844: rounded diary surfaces and empty state.

These unedited captures expose readable focused regions without artificial image crops.

## Comparison history

1. P2: inherited styles left square white grid backgrounds, clipped the hero eyebrow, and used white labels on light cards. Removed conflicting material attributes and corrected colors, label positioning, and clipping. Final home and mobile-card captures show the fixes.
2. P2: entry animations could leave content transparent in an inactive window. Removed entry animations on redesigned content. Final dark/light captures show full opacity.
3. P2: article excerpts collapsed inside flex cards; mobile actions inherited full-width stacking. Gave excerpts natural height and grouped actions in a wrapping flex row. Article interaction checks pass.
4. P2: translated navigation collided with theme/account actions near tablet width. Reserved action width and tightened spacing at 861–1099 px. The 900 px English capture and geometry verify the fix.
5. P2: diary deletion risked nested interactive controls. Separated entry-select and delete buttons, retained confirmation, and sized mobile controls appropriately. Browser tests cover deleting one entry and retaining the selected persona.

6. P2, production smoke check: the inactive-window rule missed two parent wrappers, allowing their paused reveal animations to hide the hero and content grid. Included `.hub-showcase` and `.hub-grid-wrap` and strengthened the regression test to verify animation names as well as opacity. The post-fix production capture verifies the hero and grid in a background tab.

No actionable P0/P1/P2 findings remain. Existing floating guide artwork can overlap some lower-right content at certain desktop heights; the duplicated creation link remains available in the hero. Compacting this optional guide is P3 follow-up polish.

## Interaction checks and limitations

- Exercised home links, desktop/mobile navigation, themes, English/Japanese labels, Stage search/category/sort state, direct articles, contents/progress, bookmark/share controls, Wiki, and the Room drawer.
- Integrated PR #21 selectively: diary deletion, active persona, character opening line, current time/weather, and ten recent diary summaries. Main's sharing, growth, memory, English site, security, and WebGL changes remain intact.
- Opening turns persist after reload and are idempotent, without synthetic user messages or growth rewards. Tests cover authorization, validation, revision races, persona selection, and deletion.
- Syntax, API/SEO, frontend, and mail checks: 357 tests passed, zero failures. Both production builds succeeded.
- Visual checks use Chromium and the embedded browser. Physical iOS Safari and real-device GPU profiling were not performed. Room render-quality settings are unchanged. Embedded-browser console access is limited; interaction failures were checked through browser tests and rendered states.

## Implementation checklist

- [x] Source and final dark home compared together; desktop/mobile evidence reviewed.
- [x] Existing artwork and functionality preserved; no new runtime dependencies.
- [x] Room features integrated without unrelated PR deletions.
- [x] API/frontend checks and both production builds.
- [x] Full Chromium browser suite: 38/38 passed after isolating localhost client identities per test. Production rate limits are unchanged.
- Incremental deployment verification is recorded separately after publishing.

## PC More menu alignment follow-up — 2026-09-14

Source: `/Users/yxy/.codex/visualizations/2026/09/14/tsukuyomi-more-alignment/before-desktop.png`.
Implementation: `/Users/yxy/.codex/visualizations/2026/09/14/tsukuyomi-more-alignment/after-desktop.png`.
Both unedited 1280 × 720 pixels / CSS px, anonymous Chinese dark home, More dialog open. Opened together in one comparison input; no density normalization. Local fixture content behind the scrim differs from production; dialog content is the same.

P2 reproduced: legacy `justify-content: flex-end` shrank the single dialog grid column to 266 px and moved it right inside a 430 px panel. Fix: one explicit `minmax(0, 1fr)` track and stretched content at the desktop breakpoint. A second focused check found inherited auto margins on icons separating them from their text; reset margins only on desktop menu item icons.

Final evidence: header and all sections are 384 px wide with equal 23 px left/right gaps at both 1280 px and 900 px viewport widths. First button center is 943 px; icon/text group center is 942.996 px with a 10 px gap. The paired screenshots show symmetrical internal spacing and centered icon/text groups. Typography, labels, colors, artwork, menu anchoring, focus and mobile behavior retain the existing design. No actionable P0/P1/P2 findings remain for this correction.

Validation: 43 existing navigation-related checks and four browser navigation scenarios passed, covering focus trapping/restoration, route changes, landscape fit, mobile controls and account navigation. Both locale production builds passed. No new test was added for this small CSS correction.

final result: passed
