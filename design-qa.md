# Room mobile layout validation — 2026-09-22

final result: passed

## Target and evidence

- Source visual: `/Users/yxy/Downloads/ChatGPT Image 2026年9月21日 16_47_25.png` (941 × 1672 pixels).
- Comparison target is the requested layout: Live2D at the top, conversation below, Room tools in reachable positions, and the existing global navigation. Existing Yachiyo assets, site colors, typography, icons, and features are intentional product constraints.
- Source screen-content crop: x 104–837, y 119–1584, normalized without stretching to 393 × 785 pixels; device bezel/status bar excluded.
- Implementation: `http://127.0.0.1:5173/room`, 393 × 785 CSS pixels and screenshot pixels (1×), dark theme, local test conversation, scrolled to latest reply.
- Full comparison opened together: `.codex_tmp/room-ui/comparison.png` (786 × 785). Source normalized image: `.codex_tmp/room-ui/reference-content.png`; implementation: `.codex_tmp/room-ui/final-dark.png`.
- Focused controls comparison opened together: `.codex_tmp/room-ui/reference-controls.png` and `.codex_tmp/room-ui/implementation-controls.png`.
- Additional evidence: `.codex_tmp/room-ui/mobile-conversation.png`, `mobile-small.png`, `final-light.png`, `desktop.png`.

## Findings and iteration history

No actionable P0/P1/P2 issues remain in the requested layout scope.

1. P2: music drawer extended beyond the right edge. Fixed the panel to the viewport with a bounded width; rechecked its 61–381 px bounds at 393 px width.
2. P2: auxiliary panels showed distracting underlying chat text, and empty diary occupied unnecessary height. Applied a solid themed surface and content-sized diary; rechecked diary, profile and note panels.
3. P1: fixed sections left only 14 px for messages on a 375 × 667 phone. Added height-aware stage sizing, compact short-screen identity controls, and hid optional suggestions on short screens. Post-fix transcript was 124 px at 375 × 667 and 93 px at 320 × 568, with persistent composer and global navigation fully visible; no horizontal overflow.
4. P2: light-theme weather text inherited dark ink over dark artwork. Explicit light foreground colors now retain contrast in both themes; rechecked computed and rendered colors.
5. P2: shrinking the transcript could leave the latest reply below the visible region. Resize observation now preserves the latest-message position, with cleanup when the panel unmounts, and avoids forcing users reading history to the bottom. Post-fix resize from 393 × 852 to 393 × 785 left less than 1 px to the transcript bottom; final full-view evidence shows the complete latest reply and its actions.
6. P2: overseas input retained a Chinese placeholder and the journal action wrapped awkwardly. Added explicit English input labeling and compact English journal copy; kept the action on one line. Production-build local preview at 393 × 852 confirms a readable single-line composer and journal row in `.codex_tmp/room-ui/english-input-final.png`; no console errors. The local preview does not provide the production dynamic translation endpoint for older labels.

## Fidelity surfaces

- Typography: existing system/CJK font retained; 14 px message text with 1.75 line height and 16 px input text. Titles, timestamps and tool labels have distinct hierarchy. The reference's English serif branding is intentionally replaced by the site's Chinese branding.
- Spacing/layout: same top-to-bottom companion/chat/composer/navigation hierarchy. Existing functional controls need more space than the reference's decorative identity quote. Chat history scrolls independently; 44 px primary touch targets remain accessible. Rounded bubbles and pill controls follow site tokens.
- Colors/tokens: existing moonlit purple palette retained instead of introducing the reference's pink branding. Light theme uses dark text on light conversation surfaces; weather remains readable over the room artwork.
- Images: actual existing Live2D model, room background and Yachiyo avatar retained; no replacement raster or simulated character. Model rendering code, textures and resolution configuration remain unchanged. Stage crop adapts to screen height; full stage can be expanded.
- Copy/content: actual Room features and user-facing labels retained. New welcome copy and starter suggestions are localized for the English site. Reference-only brand, voice-input control, model selector and decorative text were not invented as new functions.

## Verification

- Tested 393 × 852, 393 × 785, 375 × 667, 320 × 568, 844 × 390 and desktop 1440 × 900.
- Simulated focused-input viewport reduction to 375 × 400: `is-keyboard-open` activated, bottom navigation hidden, input visible, transcript 181 px high.
- Checked diary/profile/note open-close, music drawer, global navigation and theme switch, conversation history, sharing dialog, full-stage toggle, and desktop floating layout.
- Final page reload: no new browser console errors. Earlier Vite disconnect messages occurred while the local preview service was stopped and were excluded from the final reload window.
- Project test script checks passed: 180 API/security/etc. tests, 13 mail tests, 198 frontend tests, plus moderation assertions and syntax checks. Room-related 147-test subset repeated after final changes: passed.
- Domestic and overseas production builds: passed.
- Local evidence uses temporary fixture data. Actual AI generation/TTS services and physical iOS keyboard/safe-area behavior were not end-to-end tested; existing automated Room tests cover those transport and session behaviors. No rendering-quality change is made.

## Implementation checklist

- [x] Real Live2D at the top with expandable stage.
- [x] Global bottom navigation reused.
- [x] Chat composer, image upload, session, diary, profile, note, settings, music and per-reply actions remain reachable.
- [x] Small screens, themes, keyboard simulation and desktop regression checked.
- [x] Compared source and final browser render together.
- [x] Built both deployment variants and passed tests.

Physical iOS/Safari verification remains a device-level follow-up, not a claimed completed test.

## Publication

The initial implementation was pushed to `main` as `1998f29` and incrementally published to both existing frontend roots. Each original package contained five new hashed assets and an updated entry, approximately 93 KB compressed. SHA-256 manifests matched both servers, previous entries were backed up, and protected resource metadata matched before and after. The domestic public page rendered the mobile layout; the overseas public page rendered the English layout and live model with no console errors. The final input-label follow-up uses the same incremental publishing procedure.

GitHub Actions currently fails its pre-existing server-configuration validation before tests/deployment. Release validation was performed locally and publication used the existing authorized SSH connections; no server checkout reset, database change, media replacement, or service restart was used.
