# Game Data Contract: RotLA Major Identities

**Feature**: [../spec.md](../spec.md) | **Research**: [../research.md#r6-rotla-second-identities-fr-015fr-019](../research.md)

**Source**: the user's copy of the game, 2026-10-15.

## `ROTLA_MAJORS` and `LANDMARKS_MAJORS` (`src/domain/games/grotla.ts`)

| id | name | altName | altAliases |
|---|---|---|---|
| CON | Consortium | Conglomerate | conglomerate, conglomerado |
| UNI | Union | Unlimited | unlimited, ilimitada |
| SYS | System | Syndicate | syndicate, sindicato |
| INT | International | Inc. | inc, ink, incorporated |
| FED | Federation | Firm | firm, firma |
| EXM | Experiment | Enterprise | enterprise, empresa |
| AUT | Authority | Alliance | alliance, alianza |
| LGE | League | LLC | llc, ele ele ce |

## Unchanged

- `id`, `shortName`, `color`, `textColor` and primary `aliases` for all eight majors.
- `verification.companies` becomes `"verified"`, and the placeholder comments are removed.

## Tests and fixtures that change with it

| File | Change |
|---|---|
| `tests/games/rotla.test.ts` | `AUT`/`LGE` `altName` expectations, plus all 8 pairs |
| `tests/games/customGame.test.ts` | `INT.altName` → `"Inc."` |
| `tests/voice/__snapshots__/prompt-rotla-*.txt`, `tools-rotla-*.json` | regenerated |
| `eval/voice/fixtures/rotla-*.json` | regenerated with `buildFixtures.ts` |
| `eval/voice/cases.jsonl` | new cases: "se fusionan en Firm" (held out) and "se fusionan en Inc" |
