import { cashOf, counterOf, isPlayerBankrupt, type SessionState } from "../events/state";
import { builtInBase } from "../games";
import type { EndTriggerDef, EndTriggerType, GameDefinition, Scoring } from "../games/schema";
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
  if (cycleCounts.has(game)) return cycleCounts.get(game);
  const count = countCycles(game);
  cycleCounts.set(game, count);
  return count;
}

/** Definitions are frozen (built-ins, session copies), so per-definition values are cached. */
const cycleCounts = new WeakMap<GameDefinition, number | undefined>();

function countCycles(game: GameDefinition): number | undefined {
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

const DEFAULT_SCORING: Scoring = { autoEnd: [], bankruptPlayers: "eliminated", tieBreak: "shared" };

/**
 * The game's scoring rules (research R16): its own `scoring` block, else the block of the built-in
 * game it comes from (sessions and custom games saved before feature 007), else the defaults.
 */
export function scoringOf(game: GameDefinition): Scoring {
  return game.scoring ?? builtInBase(game)?.scoring ?? DEFAULT_SCORING;
}

/**
 * The fired end triggers that end the game without the table (`scoring.autoEnd`), in definition
 * order. bankBroken counts only once the set of ORs is over (RotLA B p.21).
 */
export function autoEndTriggers(game: GameDefinition, state: SessionState): EndTriggerType[] {
  const defs = autoEndDefs(game);
  if (defs.length === 0) return [];
  const fired: EndTriggerType[] = [];
  for (const def of defs) {
    if (fires(game, state, def) && (def.type !== "bankBroken" || orSetComplete(state))) fired.push(def.type);
  }
  return fired;
}

/** The game's end triggers that `scoring.autoEnd` lists (replay runs this once per group). */
function autoEndDefs(game: GameDefinition): readonly EndTriggerDef[] {
  const cached = autoEndCache.get(game);
  if (cached) return cached;
  const auto = new Set<EndTriggerType>(scoringOf(game).autoEnd);
  const defs = game.endTriggers.filter((d) => auto.has(d.type));
  autoEndCache.set(game, defs);
  return defs;
}
const autoEndCache = new WeakMap<GameDefinition, readonly EndTriggerDef[]>();

/**
 * Whether the game has ended on its own (research R3): RotLA after its cycles, a bankruptcy or a
 * broken bank with Bank Break; 21Moon after OR 5.3. Other games leave the end to the table.
 */
export function gameOver(game: GameDefinition, state: SessionState): boolean {
  return autoEndTriggers(game, state).length > 0;
}

/**
 * Game-end conditions the definition lists, computed from state and never stored (data-model
 * §9). Warnings only: the table decides how the final rounds are played (1830 §8.0, 1848 §13.1).
 */
export function endTriggers(game: GameDefinition, state: SessionState): EndTrigger[] {
  const result: EndTrigger[] = [];
  for (const def of game.endTriggers) {
    const fired = fires(game, state, def);
    if (fired) result.push({ type: def.type, messageEs: fired });
  }
  return result;
}

/** The trigger's Spanish message when it fires in this state, else undefined. */
function fires(game: GameDefinition, state: SessionState, def: EndTriggerDef): string | undefined {
  switch (def.type) {
    case "bankBroken":
      return game.bank !== "unlimited" && cashOf(state, "bank") <= 0 ? "Banca quebrada: se termina el set de rondas de operaciones." : undefined;
    case "topCell":
      return Object.values(state.companies).some((c) => cellTagsAt(game, c.position).includes("top"))
        ? "Una compañía llegó a la casilla final del mercado."
        : undefined;
    case "loansIssued": {
      const loans = game.loans;
      if (!loans) return undefined;
      const held = Object.entries(state.assets).filter(([a, h]) => a.startsWith("loan:") && h === loans.lender).length;
      return loans.supply - held >= def.count ? `Se han emitido ${loans.supply - held} préstamos (fin con ${def.count}).` : undefined;
    }
    case "takeovers": {
      const n = counterOf(state, "bank", "nationalTakeovers");
      return n >= def.count ? `${n} compañías en administración: fin de la partida.` : undefined;
    }
    case "lastRound": {
      const schedule = game.roundSchedule;
      return schedule.type === "fixed" && state.turn.scheduleIndex === schedule.sequence.length - 1 ? "Última ronda de la partida." : undefined;
    }
    case "scheduleComplete": {
      const schedule = game.roundSchedule;
      return schedule.type === "fixed" && state.turn.scheduleIndex === schedule.sequence.length - 1 && orSetComplete(state)
        ? "Fin de la partida: se jugó la última ronda de operaciones."
        : undefined;
    }
    case "cyclesComplete": {
      const cycles = cycleCount(game);
      return cycles !== undefined && cyclesComplete(game, state, cycles) ? `Fin de la partida: se completaron los ${cycles} ciclos.` : undefined;
    }
    case "bankruptcy": {
      const company = Object.values(state.companies).some((c) => c.status === "bankrupt");
      const player = Object.keys(state.counters).some((subject) => {
        const h = parseHolder(subject as never);
        return h.kind === "player" && isPlayerBankrupt(state, h.id);
      });
      return company || player ? "Hay una quiebra: fin de la partida." : undefined;
    }
  }
}
