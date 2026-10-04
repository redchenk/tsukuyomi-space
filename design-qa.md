# All-page Material refinement and dark-theme QA — 2026-10-04

final result: passed

## Scope and current evidence

User request: inspect and refine all existing pages with Google-inspired
aesthetics, preserve the moon-white/rose palette and pill buttons, make dark
mode more harmonious, and validate locally first. This record covers the UI
implementation and local checks; it does not certify external integrations or
production deployment. The earlier component QA is retained below.

Official references consulted this turn:
[Material Web buttons](https://material-web.dev/components/button/) and
[color roles](https://material-web.dev/theming/color/). Hierarchy and semantic
surfaces are adapted to the site's existing visual identity. No Material
library, font, icon pack or replacement artwork was added.

Current evidence is in `.codex_tmp/material-all-pages-20261004/`, with actual
pre-edit `before/` screenshots from main `80bec75` and current `after/`
screenshots. The permitted in-app browser rendered a disposable fixture server
at http://127.0.0.1:4184. No production account or private user content was used.
Desktop survey: 1280 × 800. Mobile survey: 390 × 844. Additional Pixel check:
320 × 800. Density 1, no device frame. Measurements found document width equal
to viewport width in the surveyed states.

## Route coverage

Both themes and desktop/mobile presentation were inspected for the existing
route families. Not every permission-dependent subsection or workflow is
represented by the initial-view screenshots.

| Family | Local rendered coverage |
| --- | --- |
| Public community | Hub, Stage, Plaza, Gallery, article reader, public user profile |
| Knowledge and information | Wiki index, character entry, term entry, Reality, friends, access page |
| Room | Live2D scene, transparent mobile chat, settings and eight section navigation, valid public conversation share |
| Account and creation | User center, Growth, notifications, attachments, Gallery management, article editor, friend application, Pixel |
| Identity and assistant | Login, registration presentation, password/code modes, recovery presentation, Fushi connect/callback without real authorization |
| Management | Local admin and Terminal presentation, article/message tables, notification settings |
| Embedded runtime | Game site's frame and leaderboard only; local game iframe asset is unavailable |

The unlinked legacy `/live2d` direct server route returns 404 before and after;
it is excluded from rendered-page acceptance. Actual Live2D rendered in Room
was verified. The local fixture role is admin, not super_admin, so super-admin
system/user/security panes are not claimed as tested. External Agent OS and
protected production runtime assets were not changed.

## Full-view and focused preservation checks

Created and visually inspected each matched before/after in a single input:

- `comparison-gallery-dark.png`: guest, same eight images, four columns,
  scrollY=0; calmer dark backdrop, retained image crops and rose controls.
- `comparison-user-center-dark.png`: synthetic user, same profile and personal
  section; consistent low input surface and removed old inner blue glow.
- `comparison-growth-dark.png`: synthetic user, initial task state; rose
  progress/icon roles, 24/16px nesting and pill primary check-in action.
- `comparison-profile-dark.png`: guest public profile; removes legacy glossy
  surfaces and hover lift while retaining article order and content.
- `comparison-reality-dark.png`: guest; compact 340px hero, restrained title,
  rounded cards, same explanatory copy and section links.
- `comparison-login-filled-light.png`: guest with only synthetic test login
  fields, masked password; immediate form rendering, quiet surface and a single
  clear field focus boundary.

Pairs preserve 1280 × 800 source pixels in a 2560 × 828 image including a 28px
label strip. `focus-gallery-dark.png`, `focus-user-center-dark.png`,
`focus-growth-dark.png` and `focus-login-filled-light.png` preserve native-density
crops and were inspected separately for text, borders, padding and nested
surfaces. Final mobile contact sheets and the original 320px Pixel screenshot
were also inspected. Contact sheets are overview evidence, not substitutes for
the native focused comparisons.

Known fixture differences: before screenshots have one article read and its
one-XP history entry; disposable server reseeding resets those to zero and
regenerates the synthetic invite code. Relative timestamps and companion
animation frames can also differ. These are not product logic edits or visual
regressions. Guest/account headers are only compared where identity matches.

## Findings and fixes

- Resolved P2: old raw white/blue inputs and mixed dark backgrounds remain in
  page-specific overrides. Map the existing overrides to semantic low/surface,
  line and text tokens, rather than adding another important override layer.
- Resolved P2: profiles, Growth, notifications and management retain mixed
  gradients, strong shadows and different nesting. Named page adapters use
  calm 24px outer surfaces, 16px inner surfaces and the existing rose emphasis.
  Growth route CSS now participates in the existing page layer so shared
  component rules apply consistently.
- Resolved P2: attachment cards are too narrow for their actual actions.
  Increase grid minimum to 264px and reserve padding; the real action row has
  scrollWidth==clientWidth (287px), with 36px desktop controls and 40px mobile
  controls.
- Resolved P2: large Reality hero/title and legacy glossy auth surface clash
  with the updated community pages. Refine the hero and form surfaces without
  changing their content or workflows. Auth form entry no longer depends on
  an animation completing in a foreground tab.
- Resolved P2: Fushi pages sit too close to the fixed navigation. Add 112px top
  spacing and include their existing actions in the shared component scope;
  no OAuth, credential, permission or callback logic is modified.
- Resolved P2 found in responsive interaction review: 320px Pixel publish text
  is clipped in a crowded action row. At <=360px the primary action occupies
  its own row; final button measures 270 × 44px with the complete label.
- Resolved in final matched-view review: Growth check-in inherited a generic
  tonal button after CSS layering. Explicitly restore rose fill/white text;
  actual computed colors are rgb(172,77,109)/rgb(255,255,255), height 44px.

Evidence corrections: early settings-section screenshots caught the existing
340ms entry transition; settled views confirmed opacity 1 and valid section
navigation. A rapid, repeated fixture survey also reached the existing feed
rate limit and stale randomized image paths. Restart only the disposable local
preview, keep security limits intact, use stable fixture image paths and
recapture. Final Gallery images/avatars are loaded; no broken-image or 429
frame is accepted as visual proof. A mobile theme capture caught the prior
theme during transition; files were relabeled and dark captures repeated after
reading the actual theme state.

No unresolved P0/P1/P2 finding remains in the implemented UI scope.

## Interaction and readability checks

Verified through real local browser controls:

- Global account/explore/search open and close with main x=0 and width=1280
  unchanged. Search for 月光 opens the real filtered Stage; default sort stays
  latest. A keyboard Tab focuses search with a visible 2px rose outline.
- Local login, password/code mode and recovery presentation work. Synthetic
  nickname save returns 资料已保存; nickname is restored. User article actions
  are horizontal and do not overflow.
- Markdown input renders the real preview heading and strong text. Asset
  action layout fits. No article, friend request or artwork is published.
- Gallery preview opens at desktop and phone sizes; the phone dialog is 366px
  wide inside a 390px viewport with the original image loaded.
- All eight settings sections are navigable; search 日记 filters to the diary
  section. Existing provider, memory and advanced controls remain present.
- Pixel canvas drawing enables Undo; Undo restores the previous state and
  enables Redo. The 320px publish action opens the existing artwork-information
  form. No real submission is made.
- Room renders Live2D, and the seeded public share displays the expected
  synthetic conversation. No live model, voice or mail provider is invoked.

Native fonts, existing top navigation, logo, art, music/companion placement,
Room scene, transparent phone chat and drawing canvas are retained. Dark
background overlay is stronger so the main text surface is calm while the
illustration remains visible. `text-contrast.json` records calculated token
pairs: light main 14.04:1 / muted 5.14:1; dark main 12.92:1 / muted 7.73:1 /
rose links 7.28:1; white-on-primary 5.20:1. These token measurements are not a
full accessibility certification for dynamic content.

## Build, tests and handoff boundaries

- Domestic frontend build: passed.
- Overseas frontend build: passed; domestic output restored for local preview.
- `test:frontend`: 295 passed, 31 suites, zero failed, skipped or cancelled.
  Repeated after the final Growth primary-action correction.
- `git diff --check`: passed. No added dependencies or tracked media changes.
- Build output retains existing asset-resolution/module warnings; no new build
  failure. Logs are in this record's evidence directory.

The preview remains available locally. No commit, push, deployment or production
configuration change was made for this request. Real iPhone keyboard/FPS,
external mail/OAuth/LLM/TTS, super-admin workflows and embedded game gameplay
require their runtime/device environments and are not claimed as accepted.

---

# Material-inspired component QA — 2026-10-04

final result: passed

## Scope and visual truth

User request: Google-inspired component aesthetics, retaining the site's palette,
pill buttons and existing experience, with local validation first.
This is a refinement of the existing Vue project, not a new app or a literal
clone of Google's documentation site.

Google's actual rendered button reference was captured from
https://material-web.dev/components/button/#types in the permitted in-app browser:
.codex_tmp/material-ui-20261004/material-buttons-reference.png.
The hierarchy/shape adaptation is compared together with the site's rendered
viewer in material-adaptation.png. Google's demonstration colors, fonts, English
copy and document layout are intentionally not imported into Tsukuyomi.
Official field/switch references:
https://material-web.dev/components/text-field/ and
https://material-web.dev/components/switch/.

The preservation targets are the actual pre-edit website screenshots:
before-gallery-light.png, before-settings-light.png, before-menu-light.png and
before-plaza-light.png. Current implementation is http://127.0.0.1:4184/gallery
and its existing routes, using a disposable fixture database. No production
account, content, credential or deployment is involved.

All evidence in this section is under .codex_tmp/material-ui-20261004/.
Desktop pairs use 1280 × 720 CSS pixels and 1280 × 720 image pixels, density 1,
no device frame. Each pair is composed into one 2560 × 748 input including a
28px annotation strip, without resizing either screenshot. Main preservation
comparisons use light theme, guest, scrollY=0, initial/empty model configuration,
four-column gallery, and latest Plaza filter. Fixture text/counts/art match;
Plaza's fixture time differs by eight hours after server reseeding, and the
animated companion can occupy a different animation frame. Neither is an app
code change or a typography/layout mismatch.

## Full-view and focused comparisons

Opened and visually inspected in the same comparison input:

- comparison-gallery.png and focus-gallery.png: card/toolbar curvature,
  search outline, action padding, segmented density, image crop and navigation.
- comparison-settings.png and focus-settings.png: outer/inner shapes, selected
  tonal surface, field/navigation shapes, provider layout and footer actions.
- comparison-menu.png and focus-menu.png: 28px overlay, inset list alignment,
  readable labels and backdrop/main positioning.
- comparison-plaza.png and focus-plaza.png: unchanged hero/content composition,
  controlled button density, pill filters, horizontal labels and card nesting.
- material-adaptation.png: filled primary and outlined secondary actions retain
  the official reference's hierarchy and pills using the site's rose palette.

Focused regions are retained at original density; full comparisons were not
used alone to judge small labels. Intentional differences are larger, more
consistent button padding, 24/16/28px shape levels and restrained elevation.
Gallery's first row moves down about 8px as the toolbar targets become clearer;
no content region is reordered or removed. The three-column/four-column view
switch still changes the real grid.

## Findings and iterations

- Resolved P2: inconsistent text-action sizing/spacing and strong inherited
  glow/lift. Shared rules now center labels/icons, keep labels horizontal,
  retain pill geometry, remove lift/shine, and use semantic state surfaces.
- Resolved P2: overlay actions escaped page-only rules; the initial Gallery
  viewer still displayed the legacy download glow. Extend action scope to the
  existing viewer and data-material popovers, then rebuild and recapture.
  after-gallery-viewer.png and after-gallery-viewer-mobile-light.png show a
  44px primary action, pill radius, box-shadow:none and ::after content:none.
- Resolved P2: use real account/memory/table containers rather than unused
  selector names for compact actions. Final mobile account capture
  after-user-center-mobile-light-final.png has horizontal View/Edit/Delete
  actions, all 40px high and no internal overflow.
- Evidence issue, resolved: an early Plaza capture caught an unsettled route
  frame and appeared to add a large blank region. Recapture using the browser's
  settled screenshot observation at scrollY=0. The final comparison-plaza.png
  and focus-plaza.png confirm the original composition and density. No
  production layout or arbitrary spacing fix was made in response to this
  transient capture.

- Resolved P2 in final handoff review: the existing desktop music launcher covered
  the first part of the settings save-status label. Reserve 48px inside the status
  component above 860px, retaining both music/companion positions. Inspect
  before-save-state-fix.png against the final after-settings-light.png in
  comparison-save-state.png and the revised comparison-settings.png. The launcher
  ends at x=67.76; the status content begins at x=80, with its text after the icon.
  Rebuild and all 295 frontend tests passed again after this fix.

No open P0/P1/P2 visual or usability finding remains in this component scope.

## Required fidelity surfaces

- Fonts/typography: existing Chinese UI and serif display stacks retained; no
  font downloads. Regular actions use 14px/20px/500, compact labels 12px/20px;
  existing specialized icon/table text retains its optical weight. Compare
  headers, nested labels, menu links, metadata and action rows in focused
  captures. No squeezed vertical Chinese labels or clipped action text remains.
- Spacing/layout: route layout and information order retained. Larger outer
  cards, smaller inner surfaces and raised overlays distinguish nesting.
  Desktop, tablet, 390px and 320px checks show no document horizontal overflow.
  Menu/search keep the underlying main region at its measured pre-open position.
  Dedicated Room composer and Pixel drawing controls keep their own sizing.
- Colors/tokens: existing moon-white/dusty-rose light and blue-gray dark mappings
  retained. Tonal selections and hover/pressed surfaces derive from semantic
  tokens. Primary contrast remains the existing 5.20:1 white-on-rose pair;
  disabled state is distinct and focus uses a visible rose outline. No foreign
  Google yellow/blue palette or new gradients were introduced.
- Assets/images: original logo, Yachiyo art, avatars, covers, backgrounds,
  companion, rendered Live2D and pixel canvas retained. No custom SVG/CSS art
  substitutes or generated placeholders. Hub check found zero broken images;
  comparison crops retain original image subject, sharpness and proportions.
- Copy/content: app labels, descriptions, navigation and functions unchanged;
  no implementation prose enters the product. Synthetic local fixture posts
  illustrate layout only and are never posted to production.

## Responsive, state and interaction evidence

Browser viewports: 1280 × 720, 768 × 1024, 390 × 844 and 320 × 800.
All measured document widths match their viewport widths.

Verified through actual UI:

- Light/dark switching, account menu opening/closing, unified search focus and
  Moonlight search results; Enter opens the real filtered Stage route.
- Gallery view toggle produces three real grid tracks; viewer opens/closes,
  three mobile actions fit inside a 366px dialog, cards contain 40px like pills.
- Plaza search reduces the fixture list to one matching message; clearing restores
  it. Reply filter shows the real empty state. Selection remains legible dark.
- Room/settings provider selection and editable model field; visible 2px field
  focus with no extra inner glow. Memory switch transitions checked/off/on with
  a 48 × 30px track and correctly contained thumb.
- Missing model configuration produces the real error dialog on a 320px screen;
  the Close button is operable and content fits. No real provider keys used.
- Local synthetic-user login, account sections and article View/Edit/Delete
  layout. Final 390px actions are 40px high, approximately 90px wide, with
  scrollWidth==clientWidth. No destructive action is clicked.
- Local synthetic-admin login and read-only Terminal article table: status/pin
  labels remain horizontal, specialized table actions retain compact 34px
  geometry, and document width remains 1280px. Logout restored guest preview.
- Room rendered Live2D at phone/desktop widths; transparent phone chat/composer
  and desktop workspace remain intact. No LLM/TTS request was made.
- Pixel tool selection switches Brush/Eraser correctly and returns to Brush.
  Canvas and horizontally scrollable tool rail retain their dedicated behavior.
- Hub phone hero retains the same artwork, clean text/buttons and existing cards.

Additional screenshots: after-settings-fields.png, after-settings-tablet-light.png,
after-settings-mobile-dark.png, after-settings-error-320.png,
after-menu-mobile-dark.png, after-plaza-mobile-dark.png,
after-gallery-mobile-light.png, after-user-center-dark.png,
after-user-center-mobile-dark.png, after-user-center-mobile-light-final.png,
after-terminal-light.png. Earlier captures remain diagnostic; final comparisons
and final account/mobile-viewer captures are the handoff evidence.

Boundary: native browser discard-confirm automation blocked one earlier test tab;
that native confirmation was not certified. Work continued in a fresh tab of the
same in-app browser without bypassing security. The relevant CSS/form/switch
states were verified there. These are browser checks, not physical iOS keyboard,
provider connection, native download or signed-app acceptance.

## Code/build checks and delivery

- Existing frontend regressions: 295 passed, 0 failed, 0 skipped.
- Domestic production build: passed after the final CSS changes.
- git diff --check: passed.
- Browser console error/warning inspection: none observed in tested routes.
- No new JS component library, backend change, database migration, font, image,
  network service or dependency. Native semantics/handlers remain in place.
- Reduced motion and forced-color switch fallbacks are explicitly supported by
  CSS; physical accessibility-device acceptance was not claimed.
- Local preview stays available on loopback with disposable data. No push,
  release, server restart or production deployment was performed in this turn.

Implementation checklist complete: shared component layer, compatible input
shadow token, responsive shapes/actions, real interaction checks, matched
comparisons, final build/tests and preserved existing resources.

final result: passed

---

## Earlier theme QA retained for history

# Moonwhite / sakura theme QA — 2026-10-04

final result: passed

## Scope and source

Selected source: user-provided /Users/yxy/Downloads/月白樱粉月读空间.png
(1487 × 1058), the portrait reference and six PNGs from
/Users/yxy/Downloads/归档.zip. The referenced conversation “优化网站配色”
(6ac1cf22-0b38-83ea-a422-0ac8d4bd5df1) was read as design context.
The user's current instructions are authoritative: use the supplied artwork,
retain rounded controls, harmonize light/dark, replace the site icon with
asset 5 and validate locally first.

Starting point: existing PR #24, 08bad30e76c9ad27ae805c15b5375b972d39a8a6,
applied locally over main c48eb13dc04e0119898fe205f6ba9cbce7496810.
The prior palette draft had not integrated the supplied artwork.
This report records pre-deployment local QA. Production publication is a
separate authorized follow-up; its live checks are recorded in the release receipt.

Implementation: existing Vue routes and styles, plus six compressed art assets.
Public Hub preview adds only already-public author/avatar/title fields needed
by existing content cards. No new community or navigation system, credential,
dependency, database migration or runtime service was added.
Local running app: http://127.0.0.1:4184/hub, with a disposable test database.

## Source-to-implementation comparison

The final desktop screenshot and selected source were compared side by side at
exactly 1487 × 1058 CSS pixels, matching the source canvas (capture scale 1).
Saved and visually inspected: .codex_tmp/sakura-theme/desktop-comparison-final.jpg.

The final composition retains the reference's pale sakura lake edges, spacious
white center, top navigation, left serif title, right seated Yachiyo beneath a
red umbrella, pill calls to action, separate announcement strip and three
image-first content cards. The copy-to-art fade prevents characters or blossoms
from competing with the headline. Titles, images, border geometry, spacing,
color roles and hierarchy were inspected in the comparison.

Intentional differences: the existing moon navigation logo, real route names,
existing music/companion and functional Plaza quick message remain. Live content
is not replaced with invented reference posts: real uploaded covers and pixel
canvases take precedence over fallback illustrations. Preview titles, dates and
authors are synthetic fixture data, not production content. New visitors start
in light mode; saved dark preferences remain effective.

Dark adaptation uses asset 4 beneath a deep blue-gray wash, solid reading
surfaces, brighter rose links and a dimmed hero illustration. It was reviewed
as a complementary theme rather than a hue inversion of the light screenshot.
On phones, the same lake illustration as desktop now occupies its own space
below the copy, preserving the face and preventing overlap with action buttons.

## Iterations and resolved findings

- P1: legacy max-width:58% constrained the new hero art despite a 64% width;
  explicitly remove that limit so the selected crop and composition render.
- P1: adding metadata between a v-if and its v-else detached the Plaza branch
  and duplicated a quick-message form in the pixel card; metadata now follows
  the complete conditional. Final DOM has exactly one Plaza quick-message form.
- P2: Hub's implicit grid minimum caused 408px document width on a 390px phone;
  use minmax(0,1fr). Final document width matches tested viewport widths.
- P2: portrait copy and character competed on narrow screens; at 600px and below
  separate text/actions from the transparent character art.
- P2: final tablet review found secondary text extending over brighter art;
  at 601–1099px, keep copy in the left 46% and artwork in the right 54%.
  Light/dark 768px captures were repeated and visually inspected after the fix.
- P2: old icons could stay cached after replacement; version the favicon,
  Apple and manifest icon URLs and synchronize browser theme-color with theme.
- QA fixture repair: a synthetic avatar initially used an unsupported local URL.
  The disposable user now uses a valid bounded inline PNG, served through the
  existing public avatar endpoint. Final Hub has no broken images.

No open P0/P1/P2 finding remains in the requested scope.

## Responsive and interaction verification

In-app browser checks used 360 × 800, 390 × 844, 768 × 1024,
1280 × 800 and 1487 × 1058. Layout was checked using rendered screenshots and
DOM geometry; final checked document widths equal their viewport widths.

Verified through the actual UI:

- Light/dark toggle, saved preference after reload and browser theme-color.
- Global exploration, account menu and accessible route links; menu items align.
- Unified search for 月光, Stage result and article opening; latest-first remains.
- Article reading, Gallery (including contained like controls), Plaza,
  Room/settings, Room and Pixel at phone widths; public views also checked dark.
- Local synthetic-user login and navigation to User Center. No real account
  credentials were used and no test content was posted to production.
- Existing announcement disclosure and Hub content links remain operable.
- Music and global companion retain their existing bottom positions; Room scene,
  model and drawing editor controls remain functional and visually coherent.

Screenshots (local ignored evidence):

- hub-light-desktop-final.png, hub-dark-desktop-final.png, hub-dark-1280.png.
- hub-light-mobile-final.png, hub-dark-mobile.png, hub-dark-360-final.png,
  hub-light-tablet-final.png, hub-dark-tablet-final.png.
- account-light-mobile.png, user-center-light-mobile.png, user-center-dark-mobile.png.
- article-light-mobile.png, gallery-light-mobile.png, gallery-dark-mobile.png.
- plaza-light-mobile.png, plaza-dark-tablet.png.
- room-settings-light-mobile.png, room-settings-dark-tablet.png,
  room-light-mobile.png, pixel-light-mobile.png.

All evidence is under .codex_tmp/sakura-theme/. Earlier iteration captures
are diagnostic only; the final comparison and final desktop capture are the
selected handoff evidence. Responsive checks are browser checks, not physical
iOS keyboard, native download or signed-PWA acceptance.

## Color, assets and performance

Verified semantic foreground/background contrast:

| Pair | Contrast |
| --- | --- |
| White on rose primary #AC4D6D | 5.20:1 |
| Light main text on white | 14.04:1 |
| Light secondary text on white | 5.14:1 |
| Dark main text on #1E2836 | 13.11:1 |
| Dark secondary text on #1E2836 | 7.91:1 |
| Dark rose link on #1E2836 | 7.34:1 |

Artwork is not behind ordinary body text. Existing semantic status colors and
focus outlines remain. All six user PNGs are converted to WebP (quality 88,
method 6), retaining native dimensions/transparency: 1,692,432 bytes total,
87.5% smaller than their 13,504,011-byte originals. Desktop and mobile share the lake hero; the transparent figure remains a
source-only spare and is no longer imported into the build. Images have
dimensions and decoding hints, with the hero prioritized and content images
lazy-loaded.

Favicon/PWA/Apple icons come from asset 5's (360,20,1160,820) face crop.
The obsolete, fully replaced src/frontend/assets/moonlit-lake.png was removed
only after reference checks. New art plus icons total 2,298,624 bytes,
versus 2,900,508 bytes for the replaced background plus old icons: a net saving
of 601,884 bytes. Original source PNGs remain outside the tracked bundle.
Room-share art, legacy dynamically used backgrounds, Live2D, music, models,
Wiki media and uploaded files remain untouched.

## Automated checks and boundaries

- npm run test:frontend: 292 passed, 0 failed (final source).
- npm run test:api: 273 passed, 0 failed, plus moderation flow passed.
  Hub metadata regression asserts inline avatar bodies and private user /
  storage fields are absent from public previews.
- npm run check and npm run check:seo: passed.
- npm run build:web and npm run build:web:overseas: passed locally.
  Domestic output restored for handoff after overseas build.
- git diff --check: passed.
- Existing site-background Playwright spec updated to WebP theme backgrounds;
  Playwright CLI was not run. Browser interactions used the permitted in-app
  browser workflow.

No new browser console warning/error was observed during final captures.
Production resource checks and real-device acceptance are outside this
local-first handoff. This local report does not itself certify production deployment.


## Authorized mobile follow-up and cache verification

User steering during the authorized two-site release: mobile Hero must use the
same character artwork as PC, and content cards must be shorter. These changes
supersede the earlier transparent mobile figure and equal-height card layout.

Resolved P2: inherited grid-auto-rows:1fr let the Plaza card stretch every phone
card to 507px. Rows now size independently. At 390 × 844 and 360 × 800, the
three content cards measure 142px high, with readable thumbnail/text columns,
two-line title limit, one-line excerpt, and intact author/date links. Plaza
retains all three latest messages and its single quick-message form, measuring
377px / 393px instead of 507px. Document widths exactly match 390 / 360.

Fidelity review: the serif headline and card names retain the selected source's
hierarchy; phone card titles are 17px with 1.4 line-height. Spacing and rounded
corners retain site tokens. Light/dark colors are unchanged. The same sharp
lake/umbrella artwork renders on both devices, with phone object-position 65%
and dimming in dark mode. All public copy and content links remain functional;
only previews are clamped, and complete content remains on its destination.
No new icons, placeholder art, synthetic production posts or routes were added.

Desktop reference and revised implementation were compared in the same input,
at 1487 × 1058, light mode and scrollY=0:
.codex_tmp/sakura-theme/desktop-followup-comparison.jpg. Desktop content cards
now measure 337px and the Plaza row 340px, without cross-row stretching.
Mobile evidence: hub-mobile-hero-final.png, hub-mobile-cards-final.png and
hub-mobile-dark-followup.png. These are local disposable-fixture screenshots.

Live release checks found domestic CDN ignores favicon query parameters, and
cached overseas SEO documents retained old icon links. The build now emits
content-addressed icons plus a manifest whose icons point to those files.
Overseas cached HTML attaches current icon/manifest/theme-color links alongside
current scripts/styles, preserving translated content, CSP and noscript output.
Three brand asset tests pass; 16 overseas HTML/cache/security regressions pass
in an isolated temporary test tree using the existing server Python environment
(no model loads, network calls, production DB access or dependency installation).
All 295 frontend regressions (including the three new brand cases) pass. Both
current builds pass.
Browser console is clear. Existing 273 API and 28 deployment safety checks
remain valid for unchanged code. No open P0/P1/P2 finding remains.

final result: passed
