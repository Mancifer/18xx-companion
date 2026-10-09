import type { SessionState } from "../domain/events/state";
import { assetsHeldBy, cashOf, unitsOf } from "../domain/events/state";
import type { GameDefinition } from "../domain/games/schema";
import { roundLabel, summaryEs } from "../domain/i18n/es";
import { formatMoney } from "../domain/i18n/format";
import type { EffectiveGroup } from "../domain/ledger/effectiveLog";
import { priceOf } from "../domain/mechanics/market";
import { trainsHeldBy } from "../domain/mechanics/phases";
import { trainTypeOf, type Player } from "../domain/types";

export interface SnapshotInput {
  readonly game: GameDefinition;
  readonly players: readonly Player[];
  readonly state: SessionState;
  readonly effective: readonly EffectiveGroup[];
  readonly transcript: string;
  /** The option the user tapped after askClarification. */
  readonly clarification?: string;
}

/**
 * The volatile user message (research R9): round, operating company, cash and holdings, trains
 * on sale, the last 5 entries, then the transcript. Everything stable lives in the system prompt.
 */
export function snapshotAndTranscript(input: SnapshotInput): string {
  const { game, players, state } = input;
  const money = (n: number) => formatMoney(n, game);
  const lines: string[] = [];
  const current = state.turn.currentCompany;
  lines.push(`Ronda: ${roundLabel(state.turn)}. Fase ${state.turn.phase}.${current ? ` Opera: ${current}.` : ""}`);
  lines.push(`Banco: ${game.bank === "unlimited" ? "ilimitado" : money(cashOf(state, "bank"))}.`);
  lines.push("Jugadores:");
  for (const p of [...players].sort((a, b) => a.seat - b.seat)) {
    const ref = `player:${p.id}` as const;
    const held = game.companies
      .filter((c) => unitsOf(state, ref, c.id) > 0)
      .map((c) => `${c.id} ${(unitsOf(state, ref, c.id) * 100) / c.shareCount}%`);
    lines.push(`- ${p.name} (${p.id}): ${money(cashOf(state, ref))}${held.length ? `; ${held.join(", ")}` : ""}`);
  }
  lines.push("Compañías:");
  for (const c of game.companies) {
    const record = state.companies[c.id];
    if (!record || record.status === "unstarted") continue;
    const price = priceOf(game, state, c.id);
    const trains = assetsHeldBy(state, `company:${c.id}`, "train").map(trainTypeOf);
    lines.push(
      `- ${c.id}: ${record.status}, caja ${money(cashOf(state, `company:${c.id}`))}${price !== undefined ? `, precio ${money(price)}` : ""}${trains.length ? `, trenes ${trains.join(" ")}` : ""}`,
    );
  }
  const onSale = game.trains
    .map((t) => ({ t, left: t.count === "unlimited" ? "∞" : String(trainsHeldBy(state, "bank", t.type).length) }))
    .filter(({ left }) => left !== "0");
  lines.push(`Trenes en el banco: ${onSale.map(({ t, left }) => `${t.type} (${money(t.variants[0]?.cost ?? 0)}, quedan ${left})`).join(", ")}.`);
  const recent = input.effective.slice(-5);
  if (recent.length > 0) {
    lines.push("Últimas entradas:");
    for (const g of recent) lines.push(`- ${summaryEs(g.action, { game, players, state })}`);
  }
  lines.push("", `Transcripción: «${input.transcript}»`);
  if (input.clarification !== undefined) lines.push(`Aclaración elegida: ${input.clarification}`);
  return lines.join("\n");
}
