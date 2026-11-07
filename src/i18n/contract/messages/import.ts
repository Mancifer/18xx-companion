/**
 * Feature 014 (contracts/catalogs.md): why a session file can't be imported, and the notice when
 * its recorded state doesn't match the replay.
 */

type None = Record<string, never>;

export interface ImportMessages {
  readonly "import.notCompanion": None;
  readonly "import.unknownVersion": None;
  readonly "import.newerVersion": { readonly version: number };
  readonly "import.cannotConvert": { readonly version: number };
  /** `path` and `issue` come from the file validator; both empty when it gives none. */
  readonly "import.damaged": { readonly path: string; readonly issue: string };
  readonly "import.hashMismatch": None;
}
