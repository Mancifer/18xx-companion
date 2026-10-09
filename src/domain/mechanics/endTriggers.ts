import { cashOf, counterOf, isPlayerBankrupt, type SessionState } from "../events/state";
import type { EndTriggerDef, GameDefinition } from "../games/schema";
import { parseHolder } from "../types";
import { cellTagsAt } from "./market";

export interface EndTrigger {
  readonly type: EndTriggerDef["type"];
  readonly messageEs: string;
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
