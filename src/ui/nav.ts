import { createContext, useContext } from "react";
import type { HistorySubject } from "../domain/ledger/involvement";
import type { GroupId } from "../domain/ledger/entries";
import type { CompanyId, PlayerId } from "../domain/types";

/** The Table sheet to open again when coming back to the board (feature 017, research R3). */
export type ReopenSheet =
  | { readonly kind: "player"; readonly id: PlayerId }
  | { readonly kind: "company"; readonly id: CompanyId; readonly view: "operate" | "stock" | "details" };

/** Screens are switched by app state; there is no router (research R1). */
export type Screen =
  | { name: "home" }
  | { name: "newSession" }
  | { name: "customGame" }
  | { name: "table"; reopen?: ReopenSheet }
  /**
   * Feature 017: `subject` filters to one player or company (read-only); `focus` opens one entry
   * expanded; `back` is where the back arrow goes (the Table by default).
   */
  | { name: "history"; subject?: HistorySubject; focus?: GroupId; back?: Screen }
  | { name: "market" }
  /** Final or provisional ranking (feature 007); `from` decides where Volver goes. */
  | { name: "results"; from: "table" | "home" }
  | { name: "settings" };

export interface Nav {
  readonly screen: Screen;
  readonly go: (screen: Screen) => void;
}

export const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error("useNav must be used inside NavContext");
  return nav;
}
