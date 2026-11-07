import type { UiText } from "../../contract/ui";

/** English text of the Market and Results screens (feature 014). */

export const market: UiText["market"] = {
  title: "Market",
  tags: { par: "par", receivership: "receivership", closed: "closed", top: "end", noUp: "ceiling" },
  token: (shortName) => `Token ${shortName}`,
  closedCell: "Closed",
  pickCell: ["Tap the cell to move ", " to."],
  dragHint: "Drag a token, or tap it and then tap a cell.",
  stripCell: (what, position, launch) => `Cell ${what} (position ${position})${launch ? ", launch price" : ""}`,
  gridCell: (what, row, col, tags) => `Cell ${what} (row ${row}, column ${col})${tags ? `, ${tags}` : ""}`,
  trackCell: (price, position) => `Cell ${price} (position ${position})`,
  trains: "Trains",
  tierLimit: (minor, major) => `Limit: minor ${minor} · major ${major}`,
  unplaced: "Not on the market",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (n: number) => String(n).padStart(2, "0");

export const results: UiText["results"] = {
  /** "10 Oct 20:15": day and month spelled out, so it reads the same in every English locale. */
  when: (d) => `${d.getDate()} ${MONTHS[d.getMonth()] ?? ""} ${two(d.getHours())}:${two(d.getMinutes())}`,
  auto: "automatic",
  noEndCondition: "no end condition",
  laterEntries: (n) =>
    n === 1
      ? "There is 1 entry after the end that doesn't count in these standings."
      : `There are ${n} entries after the end that don't count in these standings.`,
  title: "Results",
  provisional: "Provisional standings",
  subtitle: (game, when, how) => `${game} · ended ${when} · ${how}`,
  notEnded: "The game hasn't ended yet.",
  rank: "Rank",
  player: "Player",
  cash: "Cash",
  shares: "Shares",
  total: "Total",
  winner: "🏆 Winner",
  bankrupt: "Bankrupt",
  eliminated: "Eliminated",
  tieBreak: ["tie-break: president of ", ""],
  viewTable: "View table",
  reopenGame: "Reopen game",
  reopenTitle: "Reopen the game?",
  reopenBody: "The game is no longer finished, and entries can be recorded or corrected. The end stays in the history.",
  reopen: "Reopen",
};
