import type { GameTextPack } from "../../contract/games";

/** 21Moon, Spanish: the definition's own text, verbatim. */
export const g21moon: GameTextPack = {
  options: { lateCompany: { label: "Compañía disponible desde SR3" } },
  revenueParts: { local: "Base local", spacePort: "Puerto espacial" },
  notes: { "OR3.1": "El puerto espacial vale 30", "OR5.1": "El puerto espacial vale 40" },
};
