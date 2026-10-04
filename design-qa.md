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
