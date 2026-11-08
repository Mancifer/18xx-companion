import type { UiText } from "../../contract/ui";

/** English text of the stock, player, holder, batch and exchange sheets (feature 014). */

type Sheets = UiText["sheets"];

export const stock: Sheets["stock"] = {
  sources: { ipo: "IPO", treasury: "Treasury", pool: "Pool" },
  notOpen: "not open",
  openTitle: "Open",
  parPrice: "Par price",
  whoOpens: (money) => `Who opens (${money})`,
  yes: "Yes",
  available: "Available shares",
  soldOut: " sold out",
  at: (money) => `at ${money}`,
  count: "Count",
  less: "Less",
  more: "More",
  shareCount: "Number of shares",
  sell: "Sell",
  lessIssue: "Fewer to issue",
  moreIssue: "More to issue",
  issueN: (n) => `Issue ${n}`,
  swapLegend: "Swap with the treasury (no money)",
  swap: ["1 ", " for 1 ", ""],
};

export const player: Sheets["player"] = {
  sellOne: ["Sell 1 ", " · "],
  noSharesToSell: "Has no shares to sell",
  sellShares: "Sell shares",
  buyShare: "Buy a share",
  sellTitle: "Sell",
  sellN: (count, money) => `Sell ${count} · gets ${money}`,
  buyTitle: "Buy",
  holdingsTitle: "Shares",
  certs: (n) => `${n} cert.`,
  notCounted: "not counted",
  certAll: (total) => `(${total} in all)`,
  certSummary: (counted, limit) => `${counted}${limit !== undefined ? ` / ${limit}` : ""} certs`,
  atLimit: "at the limit",
  overLimit: "over the limit",
  noHoldings: "No shares",
  sellRow: "Sell…",
};

export const holder: Sheets["holder"] = {
  toBank: "to the bank",
  toPrefix: "to ",
  payFrom: ["Pay from ", ""],
  whom: "To whom",
  pay: "Pay",
  receiveTitle: ["", " collects from the bank"],
  collect: "Collect",
  setTitle: ["Set the money of ", ""],
  now: (money) => `Now: ${money}`,
  newValue: "New value",
  setTo: "Set to",
  payMenu: "Pay…",
  receive: "Collect from the bank",
  setMoney: "Set money",
  moveShares: "Move shares",
  play: "Play",
  adjustments: "Adjustments",
  receivesFrom: "Receives from…",
  givesTo: "Gives to…",
  from: "From",
  to: "To",
  includesPresidency: "Includes the presidency",
  moveN: (n) => `Move ${n}`,
};

export const batch: Sheets["batch"] = {
  kinds: { buyIpo: "IPO buy", buyPool: "Pool buy", sell: "Sale", par: "Par" },
  addRow: "Add row",
  title: "Share batch",
  rowPrice: (n) => `Price of row ${n}`,
  removeRow: (n) => `Remove row ${n}`,
  record: (n) => `Record the batch (${n})`,
  assumedPrice: "Assumed price",
  price: "Price",
  currentPrice: "Price at the time",
  done: "Done",
};

export const exchange: Sheets["exchange"] = {
  title: "Exchange private",
  fromIpo: "from the IPO",
  fromPool: "from the pool",
  none: "No shares available to exchange.",
};
