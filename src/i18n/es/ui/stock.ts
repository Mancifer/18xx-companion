import type { Around } from "./table";

/** Spanish text of the stock, player, holder, batch and exchange sheets (feature 014), moved verbatim. */

export const stock = {
  sources: { ipo: "IPO", treasury: "Tesorería", pool: "Pool" },
  notOpen: "sin abrir",
  openTitle: "Abrir",
  parPrice: "Precio de salida",
  whoOpens: (money: string) => `Quién abre (${money})`,
  yes: "Sí",
  available: "Acciones disponibles",
  soldOut: " agotada",
  at: (money: string) => `a ${money}`,
  count: "Cantidad",
  less: "Menos",
  more: "Más",
  shareCount: "Cantidad de acciones",
  sell: "Vender",
  lessIssue: "Menos a emitir",
  moreIssue: "Más a emitir",
  issueN: (n: number) => `Emitir ${n}`,
  swapLegend: "Cambiar con la tesorería (sin dinero)",
  /** "1 [this company] por 1 [the other]": the text around the two badges. */
  swap: ["1 ", " por 1 ", ""] as readonly [string, string, string],
};

export const player = {
  sellOne: ["Vender 1 ", " · "] as Around,
  noSharesToSell: "No tiene acciones para vender",
  sellShares: "Vender acciones",
  buyShare: "Comprar acción",
  sellTitle: "Vender",
  sellN: (count: number, money: string) => `Vender ${count} · cobra ${money}`,
  buyTitle: "Comprar",
};

export const holder = {
  toBank: "al banco",
  toPrefix: "a ",
  payFrom: ["Pagar desde ", ""] as Around,
  whom: "A quién",
  pay: "Pagar",
  receiveTitle: ["", " cobra del banco"] as Around,
  collect: "Cobrar",
  setTitle: ["Fijar dinero de ", ""] as Around,
  now: (money: string) => `Ahora: ${money}`,
  newValue: "Nuevo valor",
  setTo: "Fijar en",
  payMenu: "Pagar…",
  receive: "Cobrar del banco",
  setMoney: "Fijar dinero",
  moveShares: "Mover acciones",
  play: "Jugada",
  adjustments: "Ajustes",
  receivesFrom: "Recibe de…",
  givesTo: "Entrega a…",
  from: "De",
  to: "A",
  includesPresidency: "Incluye presidencia",
  moveN: (n: number) => `Mover ${n}`,
};

export const batch = {
  kinds: { buyIpo: "Compra IPO", buyPool: "Compra pool", sell: "Venta", par: "Apertura" },
  addRow: "Añadir fila",
  title: "Lote de acciones",
  rowPrice: (n: number) => `Precio de la fila ${n}`,
  removeRow: (n: number) => `Quitar la fila ${n}`,
  record: (n: number) => `Anotar el lote (${n})`,
  assumedPrice: "Precio supuesto",
  price: "Precio",
  currentPrice: "Precio del momento",
  done: "Listo",
};

export const exchange = {
  title: "Canjear privada",
  fromIpo: "de la IPO",
  fromPool: "del pool",
  none: "No hay acciones disponibles para canjear.",
};
