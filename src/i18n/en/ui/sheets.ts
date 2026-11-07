import type { UiText } from "../../contract/ui";

/** English text of the turn, status, launch, merger, privates, train, company and income sheets (feature 014). */

type Sheets = UiText["sheets"];

export const turn: Sheets["turn"] = {
  rounds: { PRIVATES: "Privates", SR: "Stock", CR: "Corporate", OR: "Operating" },
  less: (label) => `${label}: less`,
  more: (label) => `${label}: more`,
  title: "Turn and phase",
  phase: "Phase",
  round: "Round",
  srNumber: "Stock round",
  orSet: "OR set",
  orIndex: "OR in the set",
  orsInSet: "ORs per set",
  company: "Operating company",
  set: "Set turn",
};

export const status: Sheets["status"] = {
  recorded: "Recorded.",
  keepPlaying: "Keep playing",
  counterTitle: ["Adjust counter · ", ""],
  add: "+ Add",
  subtract: "− Subtract",
  adjust: "Adjust",
};

export const launch: Sheets["launch"] = {
  title: "Open minor",
  player: "Player",
  minor: "Minor",
  bid: "Bid",
  preview: (price, treasury, shares) => `Price ${price} · Treasury ${treasury} · ${shares} ${shares === 1 ? "share" : "shares"} in the treasury`,
  priceChange: (price) => `Price ${price} (change)`,
  priceEdit: (price) => `Price ${price} ✎`,
  phaseCap: (price) => `Phase cap ${price}`,
  hands: (name) => `${name} hands over`,
  open: "Open",
};

export const merger: Sheets["merger"] = {
  title: "Merge minors",
  minors: "Minors",
  corporation: "Corporation",
  identity: "Identity",
  treasury: "treasury",
  pool: "pool",
  presidency: "Presidency: ",
  tie: "tie broken by order",
  line: (price, treasury, trains) => `Price ${price} · Treasury ${treasury} · ${trains} ${trains === 1 ? "train" : "trains"}`,
  overLimit: "⚠ Over the train limit: it will have to retire one.",
  pickTwo: "Pick two minors.",
  merge: "Merge",
};

export const privates: Sheets["privates"] = {
  title: "Buy private",
  none: "No privates for sale now.",
  pricePaid: "Price paid",
  par: (money) => `Par ${money}`,
  buy: "Buy",
};

export const trainCorrection: Sheets["trainCorrection"] = {
  title: ["Correct trains · ", ""],
  refundLabel: (money) => ` · refund ${money}`,
  noRefund: " · no refund",
  removeOne: "Remove a train",
  removeThe: (name) => `Remove the ${name}`,
  refund: "refund",
  edit: "edit…",
  refundAmount: "Refund",
  toBank: "To the bank (supply)",
  toPool: "To the pool",
  outOfGame: "Out of the game",
  give: "Give a train",
  payment: "Payment (empty = no payment)",
};

export const company: Sheets["company"] = {
  price: (money) => ` · price ${money}`,
  par: (money) => ` · par ${money}`,
};

export const income: Sheets["income"] = {
  noExactChange: "no exact change",
};
