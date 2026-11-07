import type { UiText } from "../../contract/ui";

/** English text of History and the undo notices (feature 014). */

export const history: UiText["history"] = {
  title: "History",
  export: "Export",
  notBalanced: "⚠ The money or the shares don't add up: ",
  empty: "No entries yet.",
  finished: "finished",
  inProgress: "in progress",
  start: "Start · ",
  sources: { touch: "Touch", voice: "Voice", system: "System" },
  reverted: "undone",
  amended: "corrected",
  badFromHere: "out of balance from here",
  autoEnd: "Game over (automatic)",
  undo: "Undo",
  movements: "Movements",
  balances: "Balances",
};
