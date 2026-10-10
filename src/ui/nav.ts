import { createContext, useContext } from "react";

/** Screens are switched by app state; there is no router (research R1). */
export type Screen =
  | { name: "home" }
  | { name: "newSession" }
  | { name: "customGame" }
  | { name: "table" }
  | { name: "history" }
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
