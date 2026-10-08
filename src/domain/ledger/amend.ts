import { runPipeline } from "../actions/pipeline";
import type { GameDefinition } from "../games/schema";
import type { Player } from "../types";
import { effectiveLog, groupHistory } from "./effectiveLog";
import type { AmendEntry, LogEntry } from "./entries";
import { advance, startCursor } from "./replay";

export type AmendResult =
  | { readonly ok: true; readonly entry: AmendEntry }
  | { readonly ok: false; readonly reasonEs: string; readonly issues?: readonly string[] };

/**
 * Builds an amend entry (research R3): the corrected action is expanded against the state at
 * the original group's position. Later groups keep their stored events.
 */
export function buildAmend(
  game: GameDefinition,
  players: readonly Player[],
  log: readonly LogEntry[],
  groupId: string,
  action: unknown,
  at: { readonly seq: number; readonly at: string },
): AmendResult {
  const history = groupHistory(log).find((h) => h.group.id === groupId);
  if (!history) return { ok: false, reasonEs: "Esa entrada no existe" };
  if (history.status === "reverted") {
    return { ok: false, reasonEs: "No se puede corregir una entrada deshecha" };
  }

  let cursor = startCursor(game, players);
  for (const g of effectiveLog(log)) {
    if (g.seq >= history.group.seq) break;
    cursor = advance(game, cursor, g);
  }

  const result = runPipeline({ game, players, state: cursor.state }, action);
  if (result.kind === "invalid") return { ok: false, reasonEs: "Corrección no válida", issues: result.issues };
  if (result.kind === "unavailable") return { ok: false, reasonEs: result.reasonEs };
  return {
    ok: true,
    entry: {
      kind: "amend",
      seq: at.seq,
      at: at.at,
      groupId,
      action: result.action,
      events: result.events,
      touches: result.touches,
    },
  };
}
