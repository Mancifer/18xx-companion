import type { GameTextPack } from "../../contract/games";

/** Railways of the Lost Atlas, English (terms from the English rulebook). */
export const grotla: GameTextPack = {
  options: {
    mode: { label: "Mode", choices: { long: "Long", short: "Short", micro2: "Micro 2 players", micro3: "Micro 3 players" } },
    expansion: { label: "Expansion", choices: { off: "No", landmarks: "Landmarks" } },
    stockDrops: { label: "Price drop on selling", choices: { perSale: "One per sale", perShare: "One per share" } },
    bankBreak: { label: "Bank break", choices: { off: "No", on: "Yes" } },
    hostileMergers: { label: "Hostile mergers", choices: { off: "No", on: "Yes" } },
    headquarters: { label: "Headquarters", choices: { off: "No", on: "Yes" } },
    minorsInPlay: { label: "Minors in play", choices: { all: "All" } },
  },
  revenueParts: { revenue: "Revenue" },
  payments: { expansiveToken: "Extra token", tunneling: "Mountain", headquarters: "Headquarters" },
  phases: { yellow: "Yellow", green: "Green", green4: "Green", purple: "Purple", purple6: "Purple", grey: "Grey" },
};
