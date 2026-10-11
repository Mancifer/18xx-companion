# Implementation Plan: Chip Inventory and Bank Setup

**Branch**: `008-chip-inventory-setup` | **Date**: 2026-10-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-chip-inventory-setup/spec.md`

## Summary

Every built-in game gets the same five default chips with counts (500 green ×50, 100 red ×150,
25 black ×50, 5 blue ×100, 1 white ×150). The chip editor drops the label: a chip is a color, a
value and a count. Before a session starts, the app shows how to set up the money on the table.
It lists the chips each player takes and the chips that make up the bank, and it warns about
missing chips and fills them in. For a fixed bank, the table can change how many chips of each
color go to the bank; the colors it hasn't touched refill so the total stays exact. The same plan
shows as a notice when the game starts and stays available (and adjustable) from the chips sheet.

The design keeps the plan out of the log:

1. **Defaults as data** ([R1](research.md#r1-where-the-default-chips-and-counts-live)): a shared
   `DEFAULT_CHIPS` constant goes in every built-in `chipPreset`, with counts in the existing
   `countAvailable`. Stored sessions and custom games keep their own copies, so there is no
   migration.
2. **Counts only shape the setup** ([R2](research.md#r2-mid-game-breakdowns-ignore-counts-fr-013)):
   `breakdown` ignores counts. The bounded DP moves behind the setup plan.
3. **A pure, derived plan** ([R4](research.md#r4-players-chips-one-breakdown-for-every-player)–[R7](research.md#r7-where-the-plan-lives)):
   `setupPlan(game, playerCount, chipSet, bankPins)` returns:
   - one per-player breakdown (fewest chips within each player's share of the counts);
   - for a fixed bank, the bank's chips (setting aside the fewest chips keeps the lower values);
   - for an unlimited bank, every remaining chip;
   - the missing chips, from a DP that minimizes missing chips first.

   It is recomputed wherever it is shown and never stored.
4. **Adjustable bank** ([R16](research.md#r16-adjusting-the-bank-pin-and-refill-fr-022b-fr-022c),
   [R17](research.md#r17-saving-the-pins-fr-022d)): a − / + stepper per bank color pins that
   color's count, and the unpinned colors are recalculated with the same rule. The pins are the
   only new saved data: an optional `SessionMeta.bankPins` (value → count), saved like the chip
   set outside the log and included in exports.
5. **UI** ([R9](research.md#r9-the-start-notice-us4)–[R11](research.md#r11-chip-visibility-edge-case)):
   - a `ChipSetupPlan` view, adjustable on the new-session screen and in the chips sheet;
   - a `StartChipsNotice` on the Table while only `createSession` is in the log;
   - extracted `ChipDiscs` with a "faltan" marker;
   - a disc ring that works in both themes;
   - "Volver al juego" restores the built-in preset for older sessions.

**Two findings for the user** (not blocking):

- [R12](research.md#r12-1848-bank-of-england-treasury-found-during-research): the 1848 Bank of
  England's £2,000 treasury is outside the bank total and not covered by the plan.
- [R13](research.md#r13-us5-independent-test-found-during-design): the spec's US5 independent
  test (red = 10) produces no warning, because the greens cover the bank. The quickstart uses
  green 10 and red 10 instead.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), ES2022

**Primary Dependencies**: react 19, idb 8, zod 4 (all existing). No new dependency.

**Storage**: IndexedDB with no new store and no DB version bump. The sessions meta gains an
optional `bankPins`, and the export schema accepts it as optional. `ChipSchema.label` stays
optional for older data.

**Testing**: Vitest (domain, UI with Testing Library, persistence with fake-indexeddb),
Playwright (a11y smoke).

**Target Platform**: Installable PWA. Chrome Android and Safari iOS 17+ are primary, plus
desktop browsers.

**Project Type**: Single-project web app (PWA), no backend

**Performance Goals**: The plan recomputes in under 50 ms for the largest bank (1830 at 12,000,
7 players), well inside SC-004's 1 s ([R14](research.md#r14-performance-sc-004)).

**Constraints**:
- No events and no balance changes (FR-027).
- The warning never blocks starting (FR-025).
- Text sits next to every disc, and the ring keeps white and black chips visible.
- Touch targets are at least 48 px.
- UI text is Spanish (Uruguayan).

**Scale/Scope**:
- About 14 source files changed and 4 new (`games/chips.ts`, `mechanics/chipSetup.ts`,
  `components/ChipSetupPlan.tsx`, `components/StartChipsNotice.tsx`).
- 4 game definitions change.
- About 8 test files extended or new.
- `docs/spec.md` §7 and §9.1 are updated.

**Unknowns**: none. Every choice is in [research.md](research.md) (R1–R17).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* Constitution v1.1.0.

| Principle / Rule | Status | Notes |
|---|---|---|
| I. Event-Sourced Ledger | ✅ | The chip set is already table configuration outside the log (`SessionMeta.chipSet`). The bank pins join it there: they are inputs, saved with `updateMeta` like the chip set and never logged (FR-022d). The setup plan is derived from them and the game, never stored, and never logged (FR-027). `createSession` is unchanged. |
| II. Money Is Conserved | ✅ | No money moves. The plan's totals are exact integers by construction (SC-002) and are tested for every game and player count. |
| III. Rules as Data, the Table Wins | ✅ | The defaults are data in each definition's `chipPreset`. The bank totals and starting cash come from the existing verified fields. There is no `customRules` hook. The warning advises and never blocks (FR-025). Mid-game breakdowns are suggestions, and the table makes change as it likes (FR-013). |
| IV. Propose, Confirm, Undo | ✅ | Not affected: the plan is guidance, not an action. The start notice has no Undo because there is nothing to undo, and `createSession` must not be revertible from it ([R9](research.md#r9-the-start-notice-us4)). |
| V. Voice and Touch Parity | ✅ | The plan is touch and display only. It is not a table action, so voice parity does not apply. The notice shows with zero taps and is dismissed with 1. Each bank adjustment is 1 tap (stepper), and steppers are at least 48 px. The plan is 2 taps from the Table (Menú → Fichas). Discs always carry their value as text. The ring keeps contrast in both themes. |
| VI. Test-First Domain Logic | ✅ | `chipSetup.ts` and the `breakdown` change are chip change-making, so they are written test-first ([R15](research.md#r15-tests-principle-vi)). Each definition's preset is tested. Voice is unaffected (chips are not in the snapshot or tools), so there is no eval re-run. |
| VII. Local-First Simplicity | ✅ | No backend, store or dependency. Out of scope and not built: saved user defaults, mixed starting chips, and tracking chips during play. |
| Platform: new dependencies | ✅ | None. |
| Workflow: `docs/spec.md` | ✅ | Planned updates: §7 (chip shape without label, counts used only for the setup plan, the setup plan and bank adjustments) and §9.1 step 2 (new session: chips with counts and the plan) and step 3 (start notice). |

**Post-design re-check (after Phase 1)**: still all ✅.

- **Write paths**: the existing meta write, now `updateChips(chipSet, bankPins)`, plus the new-session input. Both write meta, not the log.
- **The start notice**: it is local UI state and writes nothing.
- **Reviewer check**: "no code path changes state outside the event pipeline" holds.

## Project Structure

### Documentation (this feature)

```text
specs/008-chip-inventory-setup/
├── plan.md              # This file
├── research.md          # Phase 0: R1–R17
├── data-model.md        # Phase 1: chip, defaults, setup plan, bank pins
├── quickstart.md        # Phase 1: automated and manual validation
├── contracts/
│   ├── domain.md        # DEFAULT_CHIPS, breakdown change, setupPlan with pins, store and persistence
│   └── ui.md            # editor, ChipDiscs, plan view, new session, chips sheet, start notice
└── tasks.md             # Phase 2 (/speckit-tasks, not created here)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── sessions.ts               # NewSessionInput.bankPins → meta
│   ├── SessionStore.ts           # updateMeta accepts bankPins
│   └── useSession.ts             # updateChipSet → updateChips(chipSet, bankPins)
├── persistence/exportImport.ts   # bankPins optional in the meta schema
├── domain/
│   ├── types.ts                  # Chip.label marked deprecated
│   ├── session.ts                # SessionMeta.bankPins?
│   ├── games/
│   │   ├── chips.ts              # NEW: DEFAULT_CHIPS, colorNameEs
│   │   ├── g1830.ts              # chipPreset → DEFAULT_CHIPS
│   │   ├── g1848.ts              # chipPreset → DEFAULT_CHIPS
│   │   ├── g21moon.ts            # chipPreset → DEFAULT_CHIPS
│   │   └── grotla.ts             # chipPreset → DEFAULT_CHIPS (adds the 1)
│   └── mechanics/
│       ├── chips.ts              # breakdown ignores counts; boundedFewest exported; chipLabel removed
│       └── chipSetup.ts          # NEW: setupPlan (with pins), fill, cleanPins, missingWarningEs
└── ui/
    ├── components/
    │   ├── ChipSetEditor.tsx     # no Etiqueta column
    │   ├── ChipStrip.tsx         # ChipDiscs extracted (missing marker); values instead of labels
    │   ├── ChipSetupPlan.tsx     # NEW: plan view with warning and bank steppers
    │   └── StartChipsNotice.tsx  # NEW: start notice
    ├── screens/
    │   ├── NewSession.tsx        # chip summary as discs; adjustable plan below; pins state
    │   └── Table.tsx             # renders StartChipsNotice
    ├── sheets/ChipsSheet.tsx     # adjustable "Preparación"; saves pins; built-in preset for "Volver al juego"
    └── styles/
        ├── tokens.css            # --chip-ring (light and dark)
        └── components.css        # disc ring, missing marker, 2-column chip row, plan layout

tests/
├── domain/chipSetup.test.ts      # NEW
├── domain/chips.test.ts
├── games/{definitions,customGame}.test.ts
├── persistence/{export,resume}.test.ts
├── ui/chips.test.tsx
└── ui/chipSetup.test.tsx         # NEW

docs/spec.md                      # §7, §9.1
```

**Structure Decision**: This is the existing single-project PWA layout.
- **Domain**: the plan sits in `mechanics/` next to `chips.ts`, whose bounded DP it reuses. The
  defaults sit in `games/` beside the definitions that use them.
- **UI**: one plan view is shared by the new-session screen, the chips sheet and the start
  notice. The disc rendering is shared with the existing `ChipStrip`.

## Complexity Tracking

There are no constitution violations to justify.
