import type { Around } from "./table";

/** Spanish text of the Market and Results screens (feature 014), moved verbatim. */

export const market = {
  title: "Mercado",
  tags: { par: "salida", receivership: "administración", closed: "cerrada", top: "fin", noUp: "techo" } as Readonly<Record<string, string>>,
  token: (shortName: string) => `Ficha ${shortName}`,
  closedCell: "Cerrada",
  pickCell: ["Toca la casilla a la que mover ", "."] as Around,
  dragHint: "Arrastra una ficha, o tócala y después toca una casilla.",
  stripCell: (what: string, position: number, launch: boolean) => `Casilla ${what} (posición ${position})${launch ? ", precio de salida" : ""}`,
  gridCell: (what: string, row: number, col: number, tags: string) => `Casilla ${what} (fila ${row}, columna ${col})${tags ? `, ${tags}` : ""}`,
  trackCell: (price: string, position: number) => `Casilla ${price} (posición ${position})`,
  trains: "Trenes",
  tierLimit: (minor: number, major: number) => `Límite: minor ${minor} · major ${major}`,
  unplaced: "Sin ficha en el mercado",
};

const two = (n: number) => String(n).padStart(2, "0");

export const results = {
  /** "10/10 20:15" */
  when: (d: Date) => `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`,
  auto: "automático",
  noEndCondition: "sin condición de fin",
  laterEntries: (n: number) =>
    n === 1
      ? "Hay 1 entrada posterior al final que no cuenta en esta clasificación."
      : `Hay ${n} entradas posteriores al final que no cuentan en esta clasificación.`,
  title: "Resultados",
  provisional: "Clasificación provisional",
  subtitle: (game: string, when: string, how: string) => `${game} · terminó ${when} · ${how}`,
  notEnded: "La partida no terminó todavía.",
  rank: "Puesto",
  player: "Jugador",
  cash: "Dinero",
  shares: "Acciones",
  total: "Total",
  winner: "🏆 Ganador",
  bankrupt: "Quiebra",
  eliminated: "Eliminado",
  tieBreak: ["desempate: presidente de ", ""] as Around,
  viewTable: "Ver mesa",
  reopenGame: "Reabrir partida",
  reopenTitle: "¿Reabrir la partida?",
  reopenBody: "La partida deja de estar completa y se pueden registrar o corregir entradas. El final queda en el historial.",
  reopen: "Reabrir",
};
