/**
 * Feature 014 (contracts/catalogs.md): the session store's failures (undo, saving, invalid
 * actions). Params hold counts only.
 */

type None = Record<string, never>;

export interface StoreMessages {
  readonly "store.nothingToUndo": None;
  readonly "store.confirmRange": { readonly count: number };
  readonly "store.persistFailed": None;
  readonly "store.invalidAction": None;
  readonly "store.noSuchEntry": None;
  readonly "store.setupNotUndoable": None;
  readonly "store.alreadyUndone": None;
}
