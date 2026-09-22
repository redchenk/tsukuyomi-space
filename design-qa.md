# Mobile Room glass conversation QA — 2026-09-22

final result: passed

## Target and comparison evidence

The requested revision restores a transparent Liquid Glass conversation surface, exposes the actual Live2D model behind it, and shows more chat text without reducing the font size. The supplied screenshot is the problem state, not a pixel-for-pixel target.

- Source: `e63c2b44a1583943b8ed81407e2b2d56.png`, 1206 × 2622. The content crop (0, 187)–(1206, 2328) excludes iOS/Safari chrome and is normalized proportionally to 393 × 698.
- Implementation: local `/room`, dark theme, a long local test conversation at 393 × 700 CSS pixels; screenshots are 1×. Test copy and weather differ from the user's private conversation, and the source contains a growth prompt absent from this test account.
- Opened together: `.codex_tmp/room-glass/comparison.png`, containing the normalized source and `final-dark-393x700.png`.
- Focused controls/text comparison opened together: `source-chat.png` and `final-chat.png` in the same directory.
- Additional captures: `light-393x700.png`, `final-small.png`, `keyboard.png`, `desktop.png`, and `english.png`.

## Findings and resolved iterations

1. P1: the previous fixed chrome left too little room for messages. The companion strip is now one compact row, tools are in a native disclosure, session/journal actions share a row, and reply timestamps/actions share a footer. At the same 393 × 700 viewport, the measured transcript increased from 157.53 to 269.80 px (71%). Message text stays 14 px; bubbles widen from 88% to 96%.
2. P1: initial glass styling exposed only the room artwork because the stage clipped the Live2D canvas. Following the user's clarification, the stage now permits the same canvas to extend behind the conversation; final dark/light and overseas screenshots visibly show the model through the header and message area. The dark panel tint is 24% and light panel tint 40%; message bubbles independently support text contrast.
3. P2: paused entry animation could leave global navigation invisible in a background preview. Mobile Room navigation now has a stable visible resting state. Keyboard visibility rules still hide it during input.
4. P2: the compact landscape header hid the music entry. A landscape-only music item now appears in the tools menu; portrait retains the header music button.

No actionable P0/P1/P2 issue remains within this revision's scope.

## Design and interaction review

- Existing fonts, purple accent, pill controls, icons, room artwork, avatar and real Live2D assets are retained. Chat uses 14 px text / 1.7 line height, and input text remains 16 px to avoid iOS focus zoom.
- A single bounded glass surface uses a subtle highlight, rounded border and 3 px backdrop blur. Bubbles have no additional blur. Existing reduced-performance behavior can disable blur while keeping the translucent tint and edge highlights; reduced-transparency preference uses an opaque accessible fallback. Model rendering code, textures and resolution settings were not changed.
- Light-theme messages use dark ink and a stronger light bubble tint; dark-theme messages use light ink and a darker translucent bubble. The model is visible through the surrounding panel and the messages remain readable in the reviewed captures.
- Tool controls, composer and reply actions retain 44 px touch targets. Native disclosure works with keyboard, Escape restores focus, outside click closes it, and selecting a tool closes it. Diary/profile/notes open correctly. Settings retains its existing route.
- Full-stage mode hides chat and expands the stage (669.8 px at 393 × 852); returning restores chat. Desktop at 1440 × 900 retains the independent floating chat, original full journal label, and global rail.

## Validation

- Checked 393 × 700, 393 × 852, 375 × 667, 320 × 568, 844 × 390, and 1440 × 900. No horizontal overflow. Transcript heights: about 270, 237 and 191 px at 393 × 700, 375 × 667 and 320 × 568 respectively.
- Simulated keyboard at 375 × 400: keyboard class active, navigation hidden, composer within the viewport, transcript 290 px, newest-message scroll gap zero.
- Local overseas production preview: real Live2D ready, model visible behind glass, Tools/New chat/Journal/input fit, no new console errors. Existing legacy labels rely on the production translation endpoint, which is not provided by the local fixture server.
- 147 Room/transport/sharing/navigation tests passed. Both production variants built successfully in fresh temporary directories; each contains 94 files. `git diff --check` passed.
- Native physical iOS/Safari keyboard and performance were not device-tested. Live AI generation and TTS were not invoked; existing automated tests cover the unchanged transport/session paths.

## Release preparation

Both incremental packages contain five new hashed frontend assets and an updated HTML entry (about 94 KB compressed each). Deployment uses the existing authorized frontend roots, validates asset hashes, backs up the old entry, and switches the entry atomically. Existing media/model directories and backend files are outside this update.
