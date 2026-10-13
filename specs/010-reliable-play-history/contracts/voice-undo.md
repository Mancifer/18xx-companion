# Contract: Voice Undo and Correction Requests

Delta to `specs/001-companion-mvp/contracts/voice-tools.md`. Provider adapters are unchanged (constitution: one shared tool set and resolve path).

## Context snapshot (`src/voice/snapshot.ts`, volatile part)

**Before**:

```text
Últimas entradas:
- <summary>          (last 5 effective groups)
```

**After**:

```text
Últimas entradas (id entre corchetes, la más nueva al final):
- [g37] <summary>
- ...
- [g51] <summary>   (last 15 effective groups, setup excluded)
```

The cached prefix (system prompt and tools) is unaffected (feature 009).

## Tools (`src/voice/tools.ts`)

| Tool | Schema | Description (new) |
|---|---|---|
| `undo` | `{ groupId: string \| null }` (unchanged) | "Deshacer. Sin destino (null) = la última entrada. «deshacé hasta …» = el id de esa entrada en Últimas entradas. «deshacer» · «borrá eso» · «deshacé hasta la compra del tren de la EXP»." |
| `amendLast` | unchanged | "Pedido de corregir una cantidad o una entrada anterior. La app no corrige: explica cómo deshacer. «no, eran 260» · «perdón, 300»." |

**Prompt line** (`src/voice/prompt.ts`): the undo/amend rule becomes "«deshacer» → undo (groupId null); «deshacé hasta X» → undo con el id de X; «no, eran 260» → amendLast. «sí» / «confirmar» con una propuesta en pantalla → confirmProposal."

## Resolution (`src/voice/resolve.ts`)

| Call | Condition | `VoiceResult` |
|---|---|---|
| `undo` | `groupId` null, or the newest effective non-setup id | `{ kind: "undo" }`: applies `undoLast()` directly, as today |
| `undo` | an older effective non-setup id | `{ kind: "undoTo", groupId, range }` |
| `undo` | unknown, reverted, or setup id | `notUnderstood("No encontré esa entrada. Usá el historial.")` |
| `amendLast` | any | `notUnderstood("Para corregir, deshacé hasta esa entrada y volvé a anotarla.")` (FR-008) |

## Controller (`src/app/voiceController.ts`)

- `undoTo` opens `UndoRangeSheet` ([history-ui.md](history-ui.md)) with the transcript. Nothing changes until "Deshacer N". "Cancelar" changes nothing.
- The effects interface becomes:

  ```ts
  undoLast(): Promise<{ ok: boolean }>
  undoTo(groupId, { confirmed: true }): Promise<{ ok: boolean }>
  ```

  `amend` is removed.

## Eval (`eval/voice`)

- **Fixtures**: regenerate with `buildFixtures.ts`, because the snapshot text changed.
- **New cases** (at least 4):
  - "deshacé hasta la compra del tren de la EXP" → `undo { groupId: <that id> }`
  - "volvé a antes de que la TUN emitiera" → `undo { groupId: <id> }`
  - "deshacer" with history present → `undo { groupId: null }`
  - "no, eran 260" → `amendLast` (unchanged expectation)
- **Grading**: `undo.groupId` is graded exactly. A null and the newest id both count as correct for a bare «deshacer».
- **Gate**: re-run on the default provider/model (`gemini-3.6-flash`, cache on) before merging. Accuracy must not regress from the 2026-10-11 result (constitution VI).
