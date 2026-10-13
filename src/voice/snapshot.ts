import type { SessionState } from "../domain/events/state";
import { assetsHeldBy, cashOf, isPlayerBankrupt, unitsOf } from "../domain/events/state";
import type { GameDefinition } from "../domain/games/schema";
import { cycleRoundLabel, roundLabel, summaryEs } from "../domain/i18n/es";
import { formatMoney } from "../domain/i18n/format";
import type { EffectiveGroup } from "../domain/ledger/effectiveLog";
import { isSetup } from "../domain/ledger/undo";
import { priceOf } from "../domain/mechanics/market";
import { trainsHeldBy } from "../domain/mechanics/phases";
import { trainTypeOf, type Player } from "../domain/types";

/** How many recent entries the snapshot lists. */
const RECENT_ENTRIES = 15;

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
  const round = cycleRoundLabel(game, state.turn) ?? roundLabel(state.turn);
  lines.push(`Ronda: ${round}. Fase ${state.turn.phase}.${current ? ` Opera: ${current}.` : ""}`);
  lines.push(`Banco: ${game.bank === "unlimited" ? "ilimitado" : money(cashOf(state, "bank"))}.`);
  lines.push("Jugadores:");
  for (const p of [...players].sort((a, b) => a.seat - b.seat)) {
    const ref = `player:${p.id}` as const;
    const held = game.companies
      .filter((c) => unitsOf(state, ref, c.id) > 0)
      .map((c) => `${c.id} ${(unitsOf(state, ref, c.id) * 100) / c.shareCount}%`);
    if (isPlayerBankrupt(state, p.id)) {
      lines.push(`- ${p.name} (${p.id}): fuera de la partida (quiebra); no proponer acciones suyas`);
      continue;
    }
    lines.push(`- ${p.name} (${p.id}): ${money(cashOf(state, ref))}${held.length ? `; ${held.join(", ")}` : ""}`);
  }
  lines.push("Compañías:");
  for (const c of game.companies) {
    const record = state.companies[c.id];
    if (!record || record.status === "unstarted") continue;
    const price = priceOf(game, state, c.id);
    const trains = assetsHeldBy(state, `company:${c.id}`, "train").map(trainTypeOf);
    const tier = c.tier ? ` (${c.tier})` : "";
    const shares = [
      ["IPO", unitsOf(state, `ipo:${c.id}`, c.id)],
      ["tesorería", unitsOf(state, `company:${c.id}`, c.id)],
      ["pool", unitsOf(state, "pool", c.id)],
    ] as const;
    const available = shares.filter(([, n]) => n > 0).map(([where, n]) => `${where} ${n}`);
    lines.push(
      `- ${c.id}${tier}: ${record.status}, caja ${money(cashOf(state, `company:${c.id}`))}${price !== undefined ? `, precio ${money(price)}` : ""}, acciones ${available.join(" · ") || "ninguna libre"}${trains.length ? `, trenes ${trains.join(" ")}` : ""}`,
    );
  }
  // Games with minors and majors (RotLA): what can still be launched or formed.
  const unstarted = (tier: "minor" | "major") =>
    game.companies.filter((c) => c.tier === tier && state.companies[c.id]?.status === "unstarted");
  if (game.companies.some((c) => c.tier !== undefined)) {
    lines.push(`Minors sin abrir: ${unstarted("minor").map((c) => c.id).join(", ") || "ninguna"}.`);
    const majors = unstarted("major").map((c) => `${c.id} (${c.name}${c.altName ? ` / ${c.altName}` : ""})`);
    lines.push(`Corporaciones sin abrir: ${majors.join(", ") || "ninguna"}.`);
  }
  const onSale = game.trains
    .map((t) => ({ t, left: t.count === "unlimited" ? "∞" : String(trainsHeldBy(state, "bank", t.type).length) }))
    .filter(({ left }) => left !== "0");
  lines.push(`Trenes en el banco: ${onSale.map(({ t, left }) => `${t.type} (${money(t.variants[0]?.cost ?? 0)}, quedan ${left})`).join(", ")}.`);
  // With ids, so «deshacé hasta …» can name an entry (feature 010, contracts/voice-undo.md).
  const recent = input.effective.filter((g) => !isSetup(g)).slice(-RECENT_ENTRIES);
  if (recent.length > 0) {
    lines.push("Últimas entradas (id entre corchetes, la más nueva al final):");
    for (const g of recent) lines.push(`- [${g.id}] ${summaryEs(g.action, { game, players, state })}`);
  }
  lines.push("", `Transcripción: «${input.transcript}»`);
  if (input.clarification !== undefined) lines.push(`Aclaración elegida: ${input.clarification}`);
  return lines.join("\n");
}
