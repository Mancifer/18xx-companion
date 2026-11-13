/** Spanish text of History and the undo notices (feature 014), moved verbatim. */

export const history = {
  title: "Historial",
  export: "Exportar",
  notBalanced: "⚠ El dinero o las acciones no cuadran: ",
  empty: "Todavía no hay entradas.",
  finished: "terminada",
  inProgress: "en curso",
  start: "Inicio · ",
  sources: { touch: "Toque", voice: "Voz", system: "Sistema" },
  reverted: "deshecha",
  amended: "corregida",
  badFromHere: "descuadre desde acá",
  autoEnd: "Fin de la partida (automático)",
  undo: "Deshacer",
  movements: "Movimientos",
  balances: "Saldos",
  /** Feature 017: a player's or company's History. */
  emptyFor: (name: string) => `No hay movimientos de ${name} todavía.`,
  showInFull: "Ver en el historial completo",
};
