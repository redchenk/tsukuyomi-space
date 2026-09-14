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


## Fixed site artwork follow-up — 2026-09-14

The supplied 1672 × 941 moonlit lake PNG is reused without pixel changes or compression. Desktop uses a centered cover crop; portrait mobile uses an 85% horizontal focal point to retain the right-hand moon and lake. A fixed, pointer-transparent viewport layer with a stable large-viewport height avoids scroll-driven movement and mobile browser chrome resizing. Light and dark overlays maintain readable content. Login, registration and other content routes share the image. Access and its alias retain the existing autoplay video; Room and shared Room retain their scene.

Validation: 60 navigation/performance checks and 18 Chromium browser scenarios passed; both Chinese and overseas production builds succeeded. Browser checks assert identical background bounds before and after scrolling at 1280 × 720 and 390 × 844, verify shared artwork on account/content routes, and verify Access video and Room exclusions. Desktop/mobile light and dark visuals were inspected locally. Physical iOS Safari was not tested in this follow-up.

Unedited visual evidence: `/Users/yxy/.codex/visualizations/2026/09/14/tsukuyomi-fixed-background/` (`desktop-dark.png`, `desktop-light.png`, `mobile-dark.png`, `mobile-light.png`, `entry-video-preserved.png`). Source and bundled PNG SHA-256: `6f9fd45b601f75c88b7a148c7dab106240ebd86d0ae2322ae600b0a22cbeabaf`.

## Room background follow-up — 2026-09-14

Source visual truth: `/Users/yxy/Downloads/ChatGPT Image 2026年9月14日 21_38_38.png`, 1672 × 941. Implementation asset: `assets/images/room-night-apartment-38e66dfa.webp`, 1672 × 941, SHA-256 `c49fddc6a4fc59760fc8bdf36632f858b20ecbacdd2098f4be80072966721922`. The WebP keeps the supplied composition at full resolution while reducing transfer size to 125 KB.

Required fidelity surfaces were the Room background artwork, desktop full-room composition, portrait focal crop, foreground floor for Live2D, existing dark readability overlay, and the relationship between the scene and Room controls. The Live2D model, canvas resolution, music, chat, diary, profile, notes, settings, and the separate `/live2d` page were outside the artwork change and remained intact.

Desktop source and implementation were opened together in `/Users/yxy/.codex/visualizations/2026/09/14/tsukuyomi-room-background/08-comparison-desktop.png`. The implementation state is anonymous Chinese Room, chat closed, dark theme, at a 1440 × 900 CSS viewport. Mobile source crop and implementation were opened together in `/Users/yxy/.codex/visualizations/2026/09/14/tsukuyomi-room-background/09-comparison-mobile.png`; the implementation is the same state at 390 × 844, using a 72% horizontal focal point to retain the window, moon, bed, and clear floor behind Live2D. Captures use the same browser viewport dimensions without density normalization.

Comparison history:

1. Desktop centered cover preserved the complete room hierarchy and placed Live2D over the door and open floor without obscuring the window or bed. No correction was needed.
2. The previous mobile center/bottom rule would overemphasize the central door. A 72% horizontal focal point now retains the supplied night window, bed, and reflective floor while keeping the character readable.
3. The mobile Room tools drawer was expanded and the chat panel reopened after the background change. Both states remain usable, and the drawer defaults to the compact upper-right trigger.

Validation: both Chinese and overseas production builds succeeded; 60 navigation/performance tests passed. The local browser reported zero console errors. Its single warning was the expected unauthenticated conversation-sync response in fixture mode. Evidence files `03-local-desktop-panel.png`, `04-local-desktop.png`, `05-local-mobile.png`, `06-local-mobile-drawer.png`, and `07-local-mobile-chat.png` are in `/Users/yxy/.codex/visualizations/2026/09/14/tsukuyomi-room-background/`. No actionable P0/P1/P2 fidelity or interaction findings remain.

final result: passed
