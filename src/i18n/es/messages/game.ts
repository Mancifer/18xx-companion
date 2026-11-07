import type { AreaText } from "../../contract/domain";
import type { GameMessages } from "../../contract/messages/game";
import { gameText } from "../../gameText";

/** Spanish game-level messages, moved verbatim from the domain (feature 014). */

const range = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`);

export const game: AreaText<GameMessages> = {
  "end.bankBroken": () => "Banca quebrada: se termina el set de rondas de operaciones.",
  "end.topCell": () => "Una compañía llegó a la casilla final del mercado.",
  "end.loansIssued": ({ issued, count }) => `Se han emitido ${issued} préstamos (fin con ${count}).`,
  "end.takeovers": ({ count }) => `${count} compañías en administración: fin de la partida.`,
  "end.lastRound": () => "Última ronda de la partida.",
  "end.scheduleComplete": () => "Fin de la partida: se jugó la última ronda de operaciones.",
  "end.cyclesComplete": ({ cycles }) => `Fin de la partida: se completaron los ${cycles} ciclos.`,
  "end.bankruptcy": () => "Hay una quiebra: fin de la partida.",
  recommendedPlayers: (p, ctx) =>
    `El juego ${gameText(ctx.game, "es").choice(p.option, p.value).toLocaleLowerCase("es")} es para ${range(p.min, p.max)} jugadores.`,
  subsetSize: (p, ctx) => `${gameText(ctx.game, "es").option(p.option)}: hay ${p.count}; este modo usa ${p.expected}.`,
  "chips.order": () => "Las fichas deben ir de mayor a menor valor.",
  "chips.duplicate": () => "Hay valores de ficha repetidos.",
  "chips.positive": () => "Los valores deben ser mayores que cero.",
};
