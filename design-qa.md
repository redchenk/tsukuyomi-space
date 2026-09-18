# Global pill button alignment — design QA

Date: 2026-09-18. Earlier Terminal and site redesign QA remains in Git history.

## Visual target and evidence

The requested target is the supplied black search control: a full pill silhouette, generous horizontal spacing, a clear icon-to-label gap and a calm surface. The implementation keeps the existing Tsukuyomi color hierarchy while applying that geometry to the site's buttons.

- Source visual truth: `/Users/yxy/Library/Containers/com.tencent.qq/Data/Library/Application Support/QQ/nt_qq_f5a36d15d3fb79dfea1bffd23ecfe3d1/nt_data/Pic/2026-09/Ori/b66b4744e15693b6c08279c1e4266575.png` (768 × 414 image pixels).
- Browser-rendered local implementation: `http://127.0.0.1:4176/hub`.
- Implementation screenshots: Codex in-app Browser inline captures; the browser backend does not expose a filesystem screenshot path. Captured states were Hub and Stage desktop dark at 1280 × 720, Hub/Login/Room/navigation drawer mobile at 390 × 844, and the mobile navigation drawer in light theme. CSS viewport and image pixels were 1:1.
- Same-input comparison: a temporary 1440 × 900 local comparison page placed the supplied source beside a focused control gallery rendered from the production CSS bundle. It contained primary, secondary, danger, icon and segmented controls; all measured `border-radius: 999px`.
- States: unauthenticated public pages; dark and light themes; mobile navigation open; Room chat panel open; normal and selected controls.

## Comparison and findings

1. Shape: standard, compact, icon, navigation, language, pagination, filter and segmented controls use the shared `--ts-radius-button` pill token. Square icon controls remain circles because width and height are equal.
2. Size and spacing: standard controls now have a 44 px minimum height, compact actions use 36 px, and phone controls retain at least 44 px touch height. Key text buttons gained small horizontal padding where the previous rectangular styling felt tight.
3. Hierarchy: primary controls keep the moon-purple gradient, secondary controls retain neutral surfaces, and destructive controls keep their semantic red. The request changes form and softness without flattening every action into the same color.
4. Softness: hover shadows use a low, two-layer falloff. Borders, focus rings, disabled states and existing motion remain intact.
5. Responsive layout: no horizontal document overflow was present on Hub, Stage, Plaza, Gallery, Login, Register, Access, Wiki, Room or Terminal at 390 × 844. Desktop Hub navigation and Stage filters also stayed inside 1280 × 720.

Focused checks measured the rendered controls rather than relying only on source declarations. Hub desktop controls were 38–46 px high with 999 px radii; Stage categories were 44 px and sort controls 36 px; mobile navigation items were 44–52 px; Room chat actions were 44 px.

## Iteration history

- Initial implementation updated the shared button token, global control height and major late-cascade overrides.
- P2 found on Room mobile: attach, send and end-chat controls were still 12 px because Room-specific CSS loaded after the shared layer. Added a final Room control rule and restored a 44 px minimum width for compact icon actions.
- P2 found on mobile chrome: bottom navigation items remained at 17 px and language segments at 11 px. Moved both to the pill token and rechecked the open drawer in dark and light themes.
- The music cover artwork was deliberately kept at its card radius; only actual music controls changed. Large clickable content cards and inputs also retain their own geometry.

## Verification

- Opened and visually checked Hub, Stage, Login and Room in the Codex in-app Browser.
- Opened the mobile “更多” drawer, verified every navigation and language control, and toggled to light theme to check contrast.
- Audited visible buttons across ten public routes; no visible button retained a non-pill radius and no route overflowed horizontally at the phone viewport.
- Verified Room chat actions and the mobile bottom navigation after the final rebuild.
- Zero browser console errors were observed during the final route checks.
- Domestic and overseas production builds completed successfully. All 69 navigation, route and constrained-device performance checks passed.

final result: passed
