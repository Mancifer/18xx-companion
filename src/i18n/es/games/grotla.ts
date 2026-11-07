import type { GameTextPack } from "../../contract/games";

/** Railways of the Lost Atlas, Spanish: the definition's own text, verbatim. */
export const grotla: GameTextPack = {
  options: {
    mode: { label: "Modo", choices: { long: "Largo", short: "Corto", micro2: "Micro 2 jugadores", micro3: "Micro 3 jugadores" } },
    expansion: { label: "Expansión", choices: { off: "No", landmarks: "Landmarks" } },
    stockDrops: { label: "Caída por acción", choices: { perSale: "Una por venta", perShare: "Una por acción" } },
    bankBreak: { label: "Quiebra de banca", choices: { off: "No", on: "Sí" } },
    hostileMergers: { label: "Fusiones hostiles", choices: { off: "No", on: "Sí" } },
    headquarters: { label: "Sedes", choices: { off: "No", on: "Sí" } },
    minorsInPlay: { label: "Minors en juego", choices: { all: "Todas" } },
  },
  revenueParts: { revenue: "Ingresos" },
  payments: { expansiveToken: "Ficha extra", tunneling: "Montaña", headquarters: "Sede" },
  phases: { yellow: "Amarilla", green: "Verde", green4: "Verde", purple: "Morada", purple6: "Morada", grey: "Gris" },
};
