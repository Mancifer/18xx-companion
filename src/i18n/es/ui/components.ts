import type { Around } from "./table";

/** Spanish text of the shared components (feature 014), moved verbatim. */

export const components = {
  confirmCard: {
    dialog: "Confirmar orden de voz",
    editDialog: "Editar orden de voz",
    hands: (name: string) => `${name} entrega`,
    done: "Listo",
  },
  chips: {
    missingAria: (count: number, value: number) => `faltan ${count} × ${value}`,
    missing: "faltan ",
    noExactChange: "no hay cambio exacto",
    noChips: "sin fichas",
    /** "El banco paga a Ana", "Ana paga al banco", "Ana paga a PRR"; `payee` null is the bank. */
    flow: (payer: string, payee: string | null) =>
      `${payer.charAt(0).toLocaleUpperCase("es")}${payer.slice(1)} paga ${payee === null ? "al banco" : `a ${payee}`}`,
    paidWith: "pagó con",
    change: "cambio:",
  },
  setupPlan: {
    region: "Preparación de fichas",
    missingAdvice: " Podés cambiar cantidades o valores, o empezar igual y usar otras fichas.",
    eachPlayer: "Cada jugador ",
    bank: "Banco",
    bankWith: "Banco ",
    reset: "Restablecer",
    bankOver: (money: string) => `El banco tiene ${money} de más.`,
    bankShort: (money: string) => `Al banco le faltan ${money}.`,
    fixHint: "Cambiá alguna ficha fijada o tocá Restablecer.",
    aside: "Apartadas ",
    unused: "no se usan",
    unlimited: (values: string) => `sin límite: ${values}`,
    pinned: "fijada",
    missingN: (n: number) => `faltan ${n}`,
    lessChips: (value: number) => `Menos fichas de ${value} en el banco`,
    chipsIn: (value: number) => `Fichas de ${value} en el banco`,
    moreChips: (value: number) => `Más fichas de ${value} en el banco`,
  },
  chipEditor: {
    colorOf: (value: number) => `Color de la ficha ${value}`,
    value: "Valor",
    valueOf: (n: number) => `Valor de la ficha ${n}`,
    count: "Cantidad",
    remove: (value: number) => `Quitar la ficha ${value}`,
    add: "Añadir ficha",
  },
  startChips: { title: "Fichas iniciales", ok: "Entendido" },
  keypad: { amount: "Cantidad", erase: "Borrar", clear: "Vaciar" },
  mic: {
    listening: "Escuchando…",
    interpreting: " · interpretando…",
    release: "Suelta para enviar",
    hold: "Mantén pulsado para hablar",
  },
  voicePanel: {
    saveForEval: "Guardar para eval",
    answer: "Respuesta",
    ok: "Vale",
    notUnderstood: "No entendí",
    manual: "Hacerlo a mano",
  },
  chipsSheet: { title: "Fichas", plan: "Preparación", restore: "Volver al juego" },
  fields: {
    numbers: { amount: "Cantidad", setTo: "Nuevo valor", units: "Acciones", count: "Número", price: "Precio", extra: "Extra" } as Readonly<
      Record<string, string>
    >,
    choices: {
      from: "De",
      to: "A",
      holder: "Titular",
      company: "Compañía",
      player: "Jugador",
      buyer: "Comprador",
      seller: "Vendedor",
      mode: "Modo",
      trainType: "Tren",
      source: "Origen",
      private: "Privada",
    } as Readonly<Record<string, string>>,
    sources: { ipo: "IPO", pool: "Banco (pool)", treasury: "Tesorería" } as Readonly<Record<string, string>>,
    revenue: "Ingresos",
    delta: "Ajuste",
    text: "Texto",
    trainFrom: { bank: "Banco", pool: "Pool", company: "Otra compañía" },
    operating: "La que opera",
  },
  app: { error: "Algo salió mal", home: "Volver al inicio" },
  ipoOf: ["la IPO de ", ""] as Around,
};
