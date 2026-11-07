import type { AreaText } from "../../contract/domain";
import type { ImportMessages } from "../../contract/messages/import";
import type { StoreMessages } from "../../contract/messages/store";

/** English store and import messages (feature 014). */

export const store: AreaText<StoreMessages> = {
  "store.nothingToUndo": () => "There's nothing to undo",
  "store.confirmRange": ({ count }) => `${count} entries will be undone`,
  "store.persistFailed": () => "Couldn't save. Please try again.",
  "store.invalidAction": () => "Invalid action",
  "store.noSuchEntry": () => "That entry doesn't exist",
  "store.setupNotUndoable": () => "That entry can't be undone",
  "store.alreadyUndone": () => "That entry is already undone",
};

export const importing: AreaText<ImportMessages> = {
  "import.notCompanion": () => "The file isn't an 18xx Companion game.",
  "import.unknownVersion": () => "Unknown file version.",
  "import.newerVersion": ({ version }) => `The file is from a newer version of the app (${version}). Update the app.`,
  "import.cannotConvert": ({ version }) => `A version ${version} file can't be converted.`,
  "import.damaged": ({ path, issue }) => `Damaged file: ${issue === "" ? "invalid format" : `${path}: ${issue}`}`,
  "import.hashMismatch": () => "the replayed state doesn't match",
};
