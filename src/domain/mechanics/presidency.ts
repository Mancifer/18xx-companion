import type { Trigger } from "../actions/context";
import { counterOf, unitsOf, type SessionState } from "../events/state";
import type { PrimitiveEvent } from "../events/types";
import type { GameDefinition } from "../games/schema";
import { parseHolder, type CompanyId, type HolderRef, type Player } from "../types";

/**
 * FR-021, data-model §5: the presidency moves only when another *player* holds strictly more
 * units than the president. Ties keep the president; a tie for most among the others goes to the
 * first of them in seat order after the old president. A company never becomes president, and
 * the presidency is frozen while the company owes the Bank (1830 Base receivership). The swap is
 * the president's certificate one way and the same number of standard units back.
 */
export function presidencyChange(
  game: GameDefinition,
  players: readonly Player[],
  state: SessionState,
  company: CompanyId,
): PrimitiveEvent[] {
  const def = game.companies.find((c) => c.id === company);
  if (!def || def.presidencyUnits <= 0) return [];
  const holder = state.presidency[company];
  if (!holder || parseHolder(holder).kind === "ipo") return [];
  if (counterOf(state, `company:${company}`, "debt") > 0) return [];

  const parsed = parseHolder(holder);
  const current = parsed.kind === "player" ? parsed.id : undefined;
  const currentUnits = current ? unitsOf(state, holder, company) : def.presidencyUnits - 1;
  const seated = [...players].sort((a, b) => a.seat - b.seat);
  const candidates = seated.filter((p) => p.id !== current && unitsOf(state, `player:${p.id}`, company) > currentUnits);
  if (candidates.length === 0) return [];
  const best = Math.max(...candidates.map((p) => unitsOf(state, `player:${p.id}`, company)));
  const tied = candidates.filter((p) => unitsOf(state, `player:${p.id}`, company) === best);
  const seat = seated.find((p) => p.id === current)?.seat ?? 0;
  const next = [...tied].sort((a, b) => cyclic(a.seat, seat, seated.length) - cyclic(b.seat, seat, seated.length))[0];
  if (!next) return [];

  const to: HolderRef = `player:${next.id}`;
  return [
    { t: "shareTransfer", company, from: holder, to, units: def.presidencyUnits, presidency: true },
    { t: "shareTransfer", company, from: to, to: holder, units: def.presidencyUnits },
  ];
}

/** Distance in seat order after `from` (1..n). */
function cyclic(seat: number, from: number, n: number): number {
  return (((seat - from - 1) % n) + n) % n;
}

/**
 * Runs after share transfers (and when a company's debt is repaid, which unfreezes it). A manual
 * presidency transfer is the table's decision and is left alone (constitution III).
 */
export const presidencyTrigger: Trigger = (ctx) => {
  if (ctx.action.type === "transferShares" && ctx.action.presidency) return [];
  const companies = new Set<CompanyId>();
  for (const e of ctx.events) {
    if (e.t === "shareTransfer") companies.add(e.company);
    if (e.t === "counterChange" && e.key === "debt") {
      const subject = parseHolder(e.subject);
      if (subject.kind === "company") companies.add(subject.id);
    }
  }
  for (const company of companies) {
    const events = presidencyChange(ctx.game, ctx.players, ctx.state, company);
    if (events.length > 0) return events;
  }
  return [];
};
