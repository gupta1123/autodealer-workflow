# Payment Reminder settings design QA

- Source visual truth: `C:/Users/Shubham/AppData/Local/Temp/codex-clipboard-b4027912-6ecb-4ae9-a143-878fc34f3030.png`
- Source dimensions: 1596 × 986 px
- Implementation: `apps/web/src/components/settings/PaymentReminderSettings.tsx`
- Implementation screenshot: unavailable
- Intended viewport: 1280 × 800 desktop, with responsive wrapping below desktop widths
- State: Settings → Payment reminders, standard three-stage sequence
- Density normalization: not applicable because an implementation capture could not be produced

## Full-view comparison evidence

The source was opened at original resolution. It establishes a sequence header, stage summary, numbered progression, three schedule cards, one add-stage action and a clearly separated save action. The implementation follows that hierarchy while intentionally replacing the source's blue, green and purple accents with Kalika's warm neutral palette.

The local in-app browser reached the application, but it has no authenticated Kalika session and was redirected to `/login`. Therefore the actual settings screen could not be captured.

## Focused-region comparison evidence

Blocked by the missing authenticated browser session. Code inspection and TypeScript validation are not substitutes for a rendered comparison.

## Implemented changes

- Replaced the stacked fieldsets with a responsive stage sequence.
- Added numbered stages and a restrained connector line.
- Added a compact stage/reminder total.
- Grouped timing, repeat interval, maximum sends and template in each stage card.
- Added stage duplication and removal with accessible labels.
- Kept one-time reminder configuration separate but compact.
- Preserved add, edit, remove, duplicate and save behavior.
- Used the existing Kalika typography, neutral borders and dark primary action.

## Required fidelity surfaces

- Fonts and typography: existing application font and compact settings hierarchy retained; rendered wrapping remains unverified.
- Spacing and layout rhythm: three-column desktop sequence and one/two-column responsive wrapping are implemented; rendered dimensions remain unverified.
- Colors and visual tokens: intentional neutral adaptation using the existing cream, stone and dark-brown tokens; no gradients or stage-specific colors.
- Image quality and asset fidelity: no raster assets are required; standard interface icons use the application's existing icon library.
- Copy and content: shortened around the primary task and explains one-time reminders without exposing implementation details.

## Findings

- P2 — The authenticated desktop and responsive layouts have not been visually captured.
  - Fix: open Settings → Payment reminders in an authenticated browser, verify the three-card layout at 1280 × 800 and the wrapped layout at a narrow viewport, then compare against the source.

## Comparison history

- Initial implementation: component redesigned and frontend TypeScript check passed.
- Post-fix visual evidence: blocked because the available in-app browser is not signed in.

## Final result

final result: blocked
