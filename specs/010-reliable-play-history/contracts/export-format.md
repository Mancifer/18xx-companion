# Contract: Export Format v2

Delta to `specs/001-companion-mvp/contracts/export-format.md`.

- `version`: **2**. Files with version 1 are upgraded with the identity function, because they have no `undo` entries.
- New entry kind in `entries`:

  ```json
  { "kind": "undo", "seq": 57, "at": "2026-10-12T21:14:03.000Z", "groupIds": ["g56", "g55", "g54"] }
  ```

  `groupIds` must be non-empty strings, at least one, with the newest first.
- `revert` and `amend` entries stay valid on import. New exports contain them only when the session itself contains them, from before this feature.
- Round trip (FR-019): `import(export(s))` gives the same log (entries deep-equal), the same group statuses and the same `stateHash`.
- An app that only knows version 1 refuses a version-2 file with the existing message "El archivo es de una versión más nueva de la app (2). Actualiza la app."
