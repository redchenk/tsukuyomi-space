**Design QA**

- Source visual truth: `E:\visualstudio\tsukuyomi-space\.codex_tmp\plaza-source.png`
- Desktop implementation: `E:\visualstudio\tsukuyomi-space\.codex_tmp\friend-link-desktop.png`
- Mobile implementation: `E:\visualstudio\tsukuyomi-space\.codex_tmp\friend-link-mobile.png`
- Full comparison: `E:\visualstudio\tsukuyomi-space\.codex_tmp\friend-link-design-comparison.jpg`
- Viewports: desktop browser override 1440 x 900 with a 1270 x 804 page capture; mobile 390 x 844 with a 380 px client width
- State: dark theme, guest session, supplemental fields collapsed

**Findings**

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: the application page keeps the Plaza display hierarchy, existing font stack, optical weights, and readable line lengths. Labels, status text, and compact help copy use the product's established UI scale without clipped text.
- Spacing and layout rhythm: the hero, form surface, side rail, and mobile stack follow the existing Plaza spacing system. Desktop panels align to one grid; the mobile page has no horizontal overflow and all persistent navigation remains visible.
- Colors and visual tokens: the page reuses the site's material backgrounds, cyan accent, violet active navigation state, muted borders, and existing elevation tokens. No unrelated palette or decorative treatment was introduced.
- Image quality and asset fidelity: this task does not require product imagery. All visible UI icons use the existing `TsIcon` Lucide-compatible icon set; there are no placeholder assets, custom drawings, or improvised symbols.
- Copy and content: required fields are limited to site name, URL, and a short description. Backlink and notes are disclosed only under supplemental information. Plaza copy now points applicants to the dedicated route instead of treating applications as ordinary messages.

**Interaction Evidence**

- Clicked the Plaza friend-link application card and confirmed navigation to `/friend-links/apply`.
- Confirmed the guest login state replaces the form and exposes a single login action.
- Verified the authenticated submission, duplicate prevention, private pending state, admin approval, public listing, and deletion through the integration test flow.
- Confirmed the mobile document, body, hero, form panel, and side panels stay within the 390 px viewport.
- Confirmed no application console errors in the tested desktop and mobile states.

**Full-View Comparison Evidence**

- The side-by-side comparison shows the same rail proportions, dark material surfaces, large but contained page title, cyan eyebrow, soft border contrast, and background treatment as the Plaza source.
- The new page intentionally replaces Plaza's statistics and message wall with a focused application surface; the visual system remains consistent while the information architecture changes for the requested workflow.

**Focused Region Evidence**

- The mobile capture is the focused control and typography check because it renders labels and primary actions at readable scale. The 380 px client width reports no horizontal overflow, and the login action ends inside the content bounds.

**Comparison History**

- Iteration 1 finding: Plaza still described friend-link applications as ordinary wall messages, which conflicted with the new dedicated workflow.
- Fix: replaced the Plaza hero, login-state, and rules copy with dedicated-entry language while preserving the surrounding layout.
- Post-fix evidence: the Plaza application card is the only friend-link application entry and navigates to the new route; the application page presents one focused task.

**Implementation Checklist**

- Dedicated responsive application route: complete.
- Plaza entry and active navigation state: complete.
- Account-bound application history: complete.
- Safe URL validation, rate limiting, duplicate protection, and private pending state: complete.
- Admin approve, reject, and delete controls: complete.
- Desktop and mobile browser checks: passed.
- API, frontend, syntax, and production build checks: passed.

**Follow-up Polish**

- None required for handoff.

final result: passed
