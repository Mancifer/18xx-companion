import type { AreaText } from "../../contract/domain";
import type { GameMessages } from "../../contract/messages/game";
import { gameText } from "../../gameText";

/** English game-level messages (feature 014). */

const range = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`);

export const game: AreaText<GameMessages> = {
  "end.bankBroken": () => "Bank broken: the current set of operating rounds finishes.",
  "end.topCell": () => "A company reached the top cell of the market.",
  "end.loansIssued": ({ issued, count }) => `${issued} loans have been issued (the game ends at ${count}).`,
  "end.takeovers": ({ count }) => `${count} companies in receivership: game over.`,
  "end.lastRound": () => "Last round of the game.",
  "end.scheduleComplete": () => "Game over: the last operating round was played.",
  "end.cyclesComplete": ({ cycles }) => `Game over: all ${cycles} cycles were completed.`,
  "end.bankruptcy": () => "There is a bankruptcy: game over.",
  recommendedPlayers: (p, ctx) =>
    `The ${gameText(ctx.game, "en").choice(p.option, p.value).toLocaleLowerCase("en")} game is for ${range(p.min, p.max)} players.`,
  subsetSize: (p, ctx) => `${gameText(ctx.game, "en").option(p.option)}: there are ${p.count}; this mode uses ${p.expected}.`,
  "chips.order": () => "Chips must go from the highest value to the lowest.",
  "chips.duplicate": () => "Some chip values are repeated.",
  "chips.positive": () => "Values must be greater than zero.",
};
