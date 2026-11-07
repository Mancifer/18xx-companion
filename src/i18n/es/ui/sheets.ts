import type { Around } from "./table";

/** Spanish text of the turn, status, launch, merger, privates, train, company and income sheets (feature 014), moved verbatim. */

export const turn = {
  rounds: { PRIVATES: "Privadas", SR: "Acciones", CR: "Corporativa", OR: "Operaciones" },
  less: (label: string) => `${label}: menos`,
  more: (label: string) => `${label}: más`,
  title: "Turno y fase",
  phase: "Fase",
  round: "Ronda",
  srNumber: "Ronda de acciones",
  orSet: "Set de OR",
  orIndex: "OR del set",
  orsInSet: "OR por set",
  company: "Compañía que opera",
  set: "Fijar turno",
};

export const status = {
  recorded: "Registrado.",
  keepPlaying: "Seguir jugando",
  counterTitle: ["Ajustar contador · ", ""] as Around,
  add: "+ Suma",
  subtract: "− Resta",
  adjust: "Ajustar",
};

export const launch = {
  title: "Abrir minor",
  player: "Jugador",
  minor: "Minor",
  bid: "Puja",
  preview: (price: string, treasury: string, shares: number) =>
    `Precio ${price} · Tesorería ${treasury} · ${shares} ${shares === 1 ? "acción" : "acciones"} en tesorería`,
  priceChange: (price: string) => `Precio ${price} (cambiar)`,
  priceEdit: (price: string) => `Precio ${price} ✎`,
  phaseCap: (price: string) => `Tope de fase ${price}`,
  hands: (name: string) => `${name} entrega`,
  open: "Abrir",
};

export const merger = {
  title: "Fusionar minors",
  minors: "Minors",
  corporation: "Corporación",
  identity: "Identidad",
  treasury: "tesorería",
  pool: "pool",
  presidency: "Presidencia: ",
  tie: "desempate por orden",
  line: (price: string, treasury: string, trains: number) =>
    `Precio ${price} · Tesorería ${treasury} · ${trains} ${trains === 1 ? "tren" : "trenes"}`,
  overLimit: "⚠ Supera el límite de trenes: tendrá que retirar uno.",
  pickTwo: "Elige dos minors.",
  merge: "Fusionar",
};

export const privates = {
  title: "Comprar privada",
  none: "No hay privadas a la venta ahora.",
  pricePaid: "Precio pagado",
  par: (money: string) => `Salida ${money}`,
  buy: "Comprar",
};

export const trainCorrection = {
  title: ["Corregir trenes · ", ""] as Around,
  refundLabel: (money: string) => ` · devolver ${money}`,
  noRefund: " · sin devolución",
  removeOne: "Quitar un tren",
  removeThe: (name: string) => `Quitar el ${name}`,
  refund: "devolver",
  edit: "editar…",
  refundAmount: "Devolución",
  toBank: "Al banco (oferta)",
  toPool: "Al pool",
  outOfGame: "Fuera de juego",
  give: "Dar un tren",
  payment: "Pago (vacío = sin pago)",
};

export const company = {
  price: (money: string) => ` · precio ${money}`,
  par: (money: string) => ` · par ${money}`,
};

export const income = {
  noExactChange: "no hay cambio exacto",
};
