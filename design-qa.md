# Cash Discount candidate row design QA

- Source visual truth: `C:/Users/Shubham/AppData/Local/Temp/codex-clipboard-e4c4b12f-53d6-4e05-a6ce-fdc798198faf.png`
- Source dimensions: 933 × 190 px
- Implementation: `apps/web/src/components/collections/CollectionsDashboardPage.tsx`
- Implementation screenshot: unavailable
- Intended state: Cash Discounts → To create → eligible debit-note candidate
- Viewport: existing authenticated Chrome window; exact viewport unavailable because capture failed
- Density normalization: not applicable because no implementation capture was produced

## Full-view comparison evidence

The source screenshot was opened and inspected. The authenticated implementation window was found, but Windows capture failed with `SetIsBorderRequired failed: No such interface supported (0x80004002)`, so a valid rendered implementation screenshot could not be produced.

## Focused-region comparison evidence

Blocked by the same browser-window capture failure. Code inspection and automated type/lint checks are not substitutes for rendered visual evidence.

## Implemented changes

- Replaced review-oriented copy with plain eligibility language.
- Replaced `Review reversal` with `Create debit note`.
- Removed the Review status chip and technical evidence/default-period tags.
- Replaced duplicate invoice/pending chips with one Outstanding line.
- Added the applied fixed rule and source narration directly to the row.
- Renamed Proposed reversal to Debit note amount.
- Simplified the confirmation dialog and added a user-friendly calculation explanation.
- Applied the same information structure to desktop and responsive card layouts.

## Required fidelity surfaces

- Fonts and typography: existing product typography and weights preserved; rendered wrapping could not be verified.
- Spacing and layout rhythm: table widths and row content were revised in code; rendered alignment could not be verified.
- Colors and visual tokens: existing neutral, amber, and dark action tokens preserved.
- Image quality and asset fidelity: no raster assets are used in this component; the existing icon library is retained.
- Copy and content: updated to the approved user-facing wording.

## Findings

- P2 — Rendered desktop and mobile layout remain unverified because the authenticated browser window could not be captured.
  - Fix: refresh the Cash Discounts page and capture the desktop table, responsive card, and confirmation dialog once Windows browser capture is available.

## Comparison history

- Initial implementation: code and responsive structure updated; typecheck passed; targeted ESLint completed with no errors.
- Post-fix visual evidence: blocked by browser capture failure before a screenshot could be created.

## Final result

final result: blocked
