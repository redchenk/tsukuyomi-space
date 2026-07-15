**Design QA**

- Source visual truth: `E:\visualstudio\tsukuyomi-space\.codex_tmp\friend-links-apply-source-1280.jpg`
- Desktop implementation: `E:\visualstudio\tsukuyomi-space\.codex_tmp\friend-links-directory-implementation-1280.jpg`
- Mobile implementation: `E:\visualstudio\tsukuyomi-space\.codex_tmp\friend-links-directory-mobile.jpg`
- Terminal desktop implementation: `E:\visualstudio\tsukuyomi-space\.codex_tmp\friend-links-terminal-review-desktop-final.jpg`
- Terminal mobile implementation: `E:\visualstudio\tsukuyomi-space\.codex_tmp\friend-links-terminal-review-mobile.jpg`
- Full comparison: `E:\visualstudio\tsukuyomi-space\.codex_tmp\friend-links-directory-comparison-final.jpg`
- Viewports: desktop 1280 x 720; mobile 390 x 844
- State: dark theme, authenticated local session, one approved friend link

**Findings**

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: the directory preserves the application page's display hierarchy, font stack, weights, line height, and cyan eyebrow treatment. Card text and Terminal metadata wrap or truncate without escaping their bounds.
- Spacing and layout rhythm: hero width, page margins, rail proportions, section rhythm, and card alignment match the existing friend-link flow. The directory exposes content in the first desktop viewport and stacks cleanly on mobile.
- Colors and visual tokens: the implementation reuses the existing material surface, border, cyan accent, violet primary action, muted copy, elevation, and focus tokens.
- Image quality and asset fidelity: no new imagery is required. All visible controls use the existing `TsIcon` Lucide-compatible icon set; no custom SVG, placeholder image, or improvised symbol was introduced.
- Copy and content: the public page is concise and task-specific. Plaza now distinguishes browsing friend links from applying, and Terminal language is consistently framed around review rather than manual creation.

**Interaction Evidence**

- Clicked Plaza's “友链” entry and confirmed `/friend-links`.
- Clicked “申请友链”, confirmed `/friend-links/apply`, then used “返回友链” to return to the directory.
- Confirmed the directory loads the public API with a no-store URL, replaces the loading bar with results, and opens approved sites as protected external links.
- Confirmed Terminal defaults to the pending queue; the approved filter exposes the existing record and its “撤下 / 删除” actions.
- Confirmed desktop and mobile documents have no horizontal page overflow. Mobile filter and review table overflow remains contained within their own scroll regions.
- The Browser surface does not expose a console-log capability; exercised the primary SPA route transitions and found no rendered error state, failed request state, or unhandled interaction failure.

**Full-View Comparison Evidence**

- The side-by-side comparison uses the same 1280 x 720 viewport and shows matching hero geometry, rail proportions, background treatment, typography, border contrast, and material depth.
- The directory intentionally replaces the application form with an unframed, scannable card grid while keeping the same visual hierarchy and page shell.

**Focused Region Evidence**

- The 390 x 844 directory capture verifies the full-width apply action, single-column card geometry, text wrapping, persistent mobile navigation, and zero page overflow.
- The Terminal desktop capture verifies all review actions fit without horizontal clipping. The mobile capture verifies filters and the dense table remain usable without widening the document.

**Comparison History**

- Iteration 1 finding (P2): placing the apply button under the hero copy increased the hero height and pushed the directory lower than the source rhythm.
- Fix: moved the primary action into the hero's right-side action stack and retained a full-width mobile layout.
- Post-fix evidence: hero height is 262 px at desktop and the first friend-link card begins at 395 px, with no document overflow.
- Iteration 2 finding (P2): Terminal inherited the generic 900 px table minimum, clipping the delete action inside the desktop content column.
- Fix: added a review-specific fixed table layout and column allocation, plus URL truncation.
- Post-fix evidence: review table client and scroll widths both measure 838 px; the action group ends inside the 1221 px panel boundary.

**Implementation Checklist**

- Public `/friend-links` directory: complete.
- Plaza browse and application entries: complete.
- Application return path: complete.
- Terminal review-only queue and status filters: complete.
- Loading, empty, error, long-text, desktop, and mobile states: complete.
- API, frontend, syntax, and production build checks: passed.

**Follow-up Polish**

- None required for handoff.

final result: passed
