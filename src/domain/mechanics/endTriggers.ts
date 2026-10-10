import { cashOf, counterOf, isPlayerBankrupt, type SessionState } from "../events/state";
import type { EndTriggerDef, GameDefinition } from "../games/schema";
import { parseHolder } from "../types";
import { cellTagsAt } from "./market";
import { mergerRoundDue } from "./schedule";

export interface EndTrigger {
  readonly type: EndTriggerDef["type"];
  readonly messageEs: string;
}

/**
 * The number of cycles of a game played in cycles: a fixed schedule that opens with SR 1 and has
 * only SR, OR and MR slots (RotLA). Undefined otherwise.
 */
export function cycleCount(game: GameDefinition): number | undefined {
  const schedule = game.roundSchedule;
  if (schedule.type !== "fixed" || schedule.sequence[0] !== "SR1") return undefined;
  if (!schedule.sequence.every((slot) => /^(SR\d+|OR\d+\.\d+|MR\d+)$/.test(slot))) return undefined;
  return schedule.sequence.filter((slot) => slot.startsWith("SR")).length;
}

/** The current set of ORs is over: its last OR has started and no company is left to operate. */
export function orSetComplete(state: SessionState): boolean {
  const turn = state.turn;
  return turn.round === "OR" && turn.orIndex >= turn.orsInSet && turn.currentCompany === undefined;
}

/**
 * Data-model §4 "The game is over": the last cycle's OR 2 is complete and no Merger Round is due,
 * or the round is that cycle's Merger Round.
 */
function cyclesComplete(game: GameDefinition, state: SessionState, cycles: number): boolean {
  if (state.turn.srNumber < cycles) return false;
  if (state.turn.round === "MR") return true;
  return orSetComplete(state) && !mergerRoundDue(game, state);
}

/**
 * Whether the game has ended, for games that end on their own schedule (`cyclesComplete`): the
 * cycles are done, a bankruptcy ended it, or the bank broke and the set of ORs is over. Other
 * games leave the end to the table (warnings only).
 */
export function gameOver(game: GameDefinition, state: SessionState): boolean {
  if (!game.endTriggers.some((t) => t.type === "cyclesComplete")) return false;
  const fired = new Set(endTriggers(game, state).map((t) => t.type));
  return fired.has("cyclesComplete") || fired.has("bankruptcy") || (fired.has("bankBroken") && orSetComplete(state));
}

/**
 * Game-end conditions the definition lists, computed from state and never stored (data-model
 * §9). Warnings only: the table decides how the final rounds are played (1830 §8.0, 1848 §13.1).
 */
export function endTriggers(game: GameDefinition, state: SessionState): EndTrigger[] {
  const result: EndTrigger[] = [];
  for (const def of game.endTriggers) {
    switch (def.type) {
      case "bankBroken":
        if (game.bank !== "unlimited" && cashOf(state, "bank") <= 0) {
          result.push({ type: def.type, messageEs: "Banca quebrada: se termina el set de rondas de operaciones." });
        }
        break;
      case "topCell":
        if (Object.values(state.companies).some((c) => cellTagsAt(game, c.position).includes("top"))) {
          result.push({ type: def.type, messageEs: "Una compañía llegó a la casilla final del mercado." });
        }
        break;
      case "loansIssued": {
        const loans = game.loans;
        if (!loans) break;
        const held = Object.entries(state.assets).filter(([a, h]) => a.startsWith("loan:") && h === loans.lender).length;
        if (loans.supply - held >= def.count) {
          result.push({ type: def.type, messageEs: `Se han emitido ${loans.supply - held} préstamos (fin con ${def.count}).` });
        }
        break;
      }
      case "takeovers": {
        const n = counterOf(state, "bank", "nationalTakeovers");
        if (n >= def.count) result.push({ type: def.type, messageEs: `${n} compañías en administración: fin de la partida.` });
        break;
      }
      case "lastRound": {
        const schedule = game.roundSchedule;
        if (schedule.type === "fixed" && state.turn.scheduleIndex === schedule.sequence.length - 1) {
          result.push({ type: def.type, messageEs: "Última ronda de la partida." });
        }
        break;
      }
      case "cyclesComplete": {
        const cycles = cycleCount(game);
        if (cycles !== undefined && cyclesComplete(game, state, cycles)) {
          result.push({ type: def.type, messageEs: `Fin de la partida: se completaron los ${cycles} ciclos.` });
        }
        break;
      }
      case "bankruptcy": {
        const company = Object.values(state.companies).some((c) => c.status === "bankrupt");
        const player = Object.keys(state.counters).some((subject) => {
          const h = parseHolder(subject as never);
          return h.kind === "player" && isPlayerBankrupt(state, h.id);
        });
        if (company || player) result.push({ type: def.type, messageEs: "Hay una quiebra: fin de la partida." });
        break;
      }
    }
  }
  return result;
}
