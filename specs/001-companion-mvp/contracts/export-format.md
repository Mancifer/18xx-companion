# Contract: Session Export File

Source: `src/persistence/exportImport.ts`. File name: `18xx-<game>-<yyyyMMdd-HHmm>.json`.

```ts
type SessionExport = {
  format: "18xx-companion/session";
  version: 1;
  exportedAt: string;            // ISO
  appVersion: string;
  session: {
    id, name, createdAt, updatedAt,
    game: GameDefinition,        // the session's frozen copy
    players: Player[],
    walletMode, chipSet,
  };
  entries: LogEntry[];           // the full log, including reverts and amends
  stateHash: string;             // SHA-256 of canonical JSON of the replayed SessionState
};
```

## Rules

- **Never** contains `settings` or any field named like `apiKey`. A test serializes an export
  from a session with a key set and asserts the key string is absent (FR-092, US8-2).
- Import: Zod-validate → replay → compare `stateHash`. A mismatch shows a warning
  ("el estado reproducido no coincide") but still imports, because the log is authoritative.
- Importing a session whose `id` already exists asks: replace, or import as a copy (new id).
- Version policy: unknown `version` > 1 → refuse with a message. Older versions → migrate
  through `migrations[version]`.
