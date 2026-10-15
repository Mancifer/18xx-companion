# Bug Assessment: RotLA export removes every remaining 2-train

- **Slug**: rotla-export-all-trains
- **Created**: 2026-10-14
- **Source**: pasted text
- **Verdict**: invalid
- **Severity**: low

## Report (verbatim or summarized)

> I found a bug while testing the application with RotLA after the last implementation: When we
> export the train after the last OR of that round before starting the next SR, the application
> exports all trains of the same number, for instance, on the first game round going to the second
> game round, the application exports all remaining 2 trains, while instead, it should export one
> train from the pool but not all of that number, 2 if there's a one 2 remaining on the pool, or
> one 3 if there's a 3 on top, 7/infinite trains are never exported

## Symptom

Observed: at the first `startSR` after OR 1.2, every 2-train still in the bank goes to `removed`.
Reported expectation: only the top train is exported, and 7/∞ trains are never exported.

## Reproduction

1. Start a RotLA game (long mode) and play through SR 1, OR 1.1 and OR 1.2.
2. Tap "Exportar y nueva ronda de acciones".
3. Every bank-held 2-train is removed and the first 3-train becomes the top of the stack.

## Suspected Code Paths

- `src/domain/mechanics/schedule.ts:exportEvents()` — exports the top bank-held type; when the type
  is listed in `trainExport.allOfType`, all bank-held trains of that type go; an unlimited type
  creates its next numbered train and exports it.
- `src/domain/games/grotla.ts:346` — `trainExport: { allOfType: ["2"] }`.
- `specs/004-railways-lost-atlas/research.md` R7 — the design decision behind both.
- `tests/domain/export.test.ts` — locks in "a 2 on top: every bank-held 2 leaves the game" and
  "only 7/∞ left: one new 7 leaves".

## Root Cause Hypothesis

None: the code follows the rulebook. RotLA 2nd edition, B p.19 "Export a Train": "Before entering a
new Stock Round, the top train of the available trains stack is exported out of the game. If a
2-train is exported, all remaining 2-trains are exported with it, leaving the first 3-train as the
next available train on the stack. If this results in the first 4-, 6-, or 7/∞-train being removed
from the game, treat it as though the train was purchased…". So every 2 going together is correct,
and 7/∞ trains can be exported (B p.15 also mentions "previously exported 7/∞ trains"). Confidence:
high. The user checked the rulebook passage and agreed it is not a bug (2026-10-14).

## Proposed Remediation

**Preferred**: none. Close as not a bug.

**Files likely to change**: none.

**Tests to add or update**: none; `tests/domain/export.test.ts` already covers both rules.

## Risks & Considerations

- If a later errata or house rule changes the export, the switch is game data
  (`trainExport.allOfType: []`), plus an `exportEvents` change if 7/∞ should no longer be exported.

## Open Questions

- None.
