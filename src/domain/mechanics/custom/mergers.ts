import { z } from "zod";
import { AVAILABLE, unavailable, warning, type ActionContext } from "../../actions/context";
import type { ActionOf, Warning } from "../../actions/schemas";
import { cashOf, counterOf, holdersOf, presidencyHolder, presidentOf, type SessionState } from "../../events/state";
import type { PrimitiveEvent } from "../../events/types";
import type { GameDefinition } from "../../games/schema";
import { parseHolder, type AssetId, type CellRef, type CompanyId, type HolderRef, type Player, type PlayerId } from "../../types";
import { cellAt, floorToTrack, priceOf } from "../market";
import { operatingOrder } from "../operatingOrder";
import { countedTrains, currentPhase, PERMANENT, RUSTED, trainLimit, trainsHeldBy } from "../phases";
import { roundEndEvents } from "../roundEnd";
import { mergerRoundDue, slotIndex } from "../schedule";
import { effectiveTraits, MERGED_FROM } from "../traits";
import { mechanicConfigOf } from "./config";
import type { Mechanic } from "./mechanic";

/**
 * RotLA B p.18: in the Merger Round two minors become a major (research R8). Built only from
 * share, money, asset, market, status and counter primitives, in one group, so one undo restores
 * both minors exactly.
 */

export const MergersConfig = z.object({ round: z.enum(["MR"]) }).strict();
export type MergersConfig = z.infer<typeof MergersConfig>;

type MergeCompanies = ActionOf<"mergeCompanies">;

/** A holder of a minor, and where its major units go ("treasury" = the new major's treasury). */
type NewHolder = HolderRef | "treasury";

interface MergePlan {
  /** Minor units leaving the game, per minor and holder. */
  readonly minorUnits: readonly { readonly company: CompanyId; readonly holder: HolderRef; readonly units: number }[];
  /** Major units per new holder: players by seat, then the treasury, then the pool. */
  readonly holdings: readonly [NewHolder, number][];
  readonly president: PlayerId | undefined;
  readonly tie: { readonly units: number; readonly minor: CompanyId } | undefined;
  readonly cell: CellRef;
  readonly price: number;
  readonly treasury: number;
  readonly trains: readonly AssetId[];
  readonly countedTrains: number;
  readonly limit: number;
}

function holderRank(holder: HolderRef, players: readonly Player[]): number {
  const h = parseHolder(holder);
  if (h.kind === "player") return players.find((p) => p.id === h.id)?.seat ?? 99;
  if (h.kind === "company") return 100;
  if (h.kind === "pool") return 101;
  return 102;
}

function mergePlan(game: GameDefinition, players: readonly Player[], state: SessionState, a: CompanyId, b: CompanyId): MergePlan {
  const minorUnits: { company: CompanyId; holder: HolderRef; units: number }[] = [];
  const major = new Map<NewHolder, number>();
  for (const minor of [a, b]) {
    const holders = holdersOf(state, minor)
      .filter(([holder, units]) => units > 0 && holder !== "removed" && parseHolder(holder).kind !== "ipo")
      .sort(([x], [y]) => holderRank(x, players) - holderRank(y, players));
    for (const [holder, units] of holders) {
      minorUnits.push({ company: minor, holder, units });
      // A minor's own treasury shares become the major's treasury shares.
      const to: NewHolder = holder === `company:${minor}` ? "treasury" : holder;
      major.set(to, (major.get(to) ?? 0) + units);
    }
  }
  const holdings = [...major].sort(([x], [y]) => (x === "treasury" ? 100.5 : holderRank(x, players)) - (y === "treasury" ? 100.5 : holderRank(y, players)));

  // B p.18: the player with the most shares presides; a tie goes to the president of whichever
  // minor comes first in the current operating order.
  const playerUnits = holdings.filter(([h]) => h !== "treasury" && parseHolder(h).kind === "player") as [HolderRef, number][];
  const most = Math.max(0, ...playerUnits.map(([, u]) => u));
  const leaders = playerUnits.filter(([, u]) => u === most).map(([h]) => (parseHolder(h) as { id: PlayerId }).id);
  const order = operatingOrder(game, state);
  const rank = (c: CompanyId) => (order.includes(c) ? order.indexOf(c) : order.length);
  const [first, second] = rank(a) <= rank(b) ? [a, b] : [b, a];
  let president = leaders[0];
  let tie: MergePlan["tie"];
  if (leaders.length > 1) {
    const byOrder = [first, second].find((m) => {
      const p = presidentOf(state, m);
      return p !== undefined && leaders.includes(p);
    });
    president = byOrder ? presidentOf(state, byOrder) : leaders[0];
    tie = { units: most, minor: byOrder ?? first };
  }

  const pa = priceOf(game, state, a) ?? 0;
  const pb = priceOf(game, state, b) ?? 0;
  const cell = floorToTrack(game, Math.floor((pa + pb) / 2));
  const trains = [...trainsHeldBy(state, `company:${a}`), ...trainsHeldBy(state, `company:${b}`)];
  // Every major has the same tier limit; the minors' bonuses (Spacious) carry over.
  const phase = currentPhase(game, state);
  const bonus = (effectiveTraits(game, state, a).trainLimitBonus ?? 0) + (effectiveTraits(game, state, b).trainLimitBonus ?? 0);
  const limit = (phase?.trainLimitByTier?.major ?? trainLimit(game, phase)) + bonus;
  return {
    minorUnits,
    holdings,
    president,
    tie,
    cell,
    price: cellAt(game, cell)?.price ?? 0,
    treasury: cashOf(state, `company:${a}`) + cashOf(state, `company:${b}`),
    trains,
    countedTrains: countedTrains(game, state, a).length + countedTrains(game, state, b).length,
    limit,
  };
}

export interface MergePreview {
  readonly president: PlayerId | undefined;
  /** A presidency tie was broken by operating order. */
  readonly tie: boolean;
  readonly holdings: readonly [NewHolder, number][];
  readonly price: number;
  readonly treasury: number;
  readonly trains: readonly AssetId[];
  readonly overLimit: boolean;
}

/** What merging A and B would give, for the Merger sheet and the confirmation card (US7-3). */
export function mergePreview(game: GameDefinition, players: readonly Player[], state: SessionState, a: CompanyId, b: CompanyId): MergePreview {
  const plan = mergePlan(game, players, state, a, b);
  return {
    president: plan.president,
    tie: plan.tie !== undefined,
    holdings: plan.holdings,
    price: plan.price,
    treasury: plan.treasury,
    trains: plan.trains,
    overLimit: plan.countedTrains > plan.limit,
  };
}

/** Research R8 steps 1–6. */
function mergeEvents(ctx: ActionContext, m: MergeCompanies): PrimitiveEvent[] {
  const { game, state } = ctx;
  const plan = mergePlan(game, ctx.players, state, m.a, m.b);
  const into = m.into;
  const treasury: HolderRef = `company:${into}`;
  const events: PrimitiveEvent[] = [];

  // 1–2. Minor units leave the game; the same number of major units leave the major's IPO.
  for (const row of plan.minorUnits) {
    const presidency = presidencyHolder(state, row.company) === row.holder;
    events.push({ t: "shareTransfer", company: row.company, from: row.holder, to: "removed", units: row.units, ...(presidency ? { presidency: true } : {}) });
  }
  for (const [holder, units] of plan.holdings) {
    const to: HolderRef = holder === "treasury" ? treasury : holder;
    const presidency = plan.president !== undefined && to === `player:${plan.president}`;
    events.push({ t: "shareTransfer", company: into, from: `ipo:${into}`, to, units, ...(presidency ? { presidency: true } : {}) });
  }

  // 3–4. Treasuries and trains, with the trains' rusted and permanent marks.
  for (const minor of [m.a, m.b]) {
    const from: HolderRef = `company:${minor}`;
    const cash = cashOf(state, from);
    if (cash > 0) events.push({ t: "moneyTransfer", from, to: treasury, amount: cash });
  }
  for (const minor of [m.a, m.b]) {
    const from: HolderRef = `company:${minor}`;
    for (const asset of trainsHeldBy(state, from)) {
      events.push({ t: "assetTransfer", asset, from, to: treasury });
      for (const prefix of [RUSTED, PERMANENT]) {
        const key = `${prefix}${asset}`;
        const n = counterOf(state, from, key);
        if (n > 0) {
          events.push({ t: "counterChange", subject: from, key, delta: -n }, { t: "counterChange", subject: treasury, key, delta: n });
        }
      }
    }
  }

  // 5. The price, at the bottom of its stack; the major floats and the minors close.
  events.push({ t: "marketMove", company: into, to: plan.cell, reason: "merge" });
  events.push({ t: "companyStatus", company: into, status: "floated", parPrice: plan.price });
  events.push({ t: "companyStatus", company: m.a, status: "closed" }, { t: "companyStatus", company: m.b, status: "closed" });

  // 6. Where it came from (its traits) and which identity it took.
  events.push(
    { t: "counterChange", subject: treasury, key: `${MERGED_FROM}${m.a}`, delta: 1 },
    { t: "counterChange", subject: treasury, key: `${MERGED_FROM}${m.b}`, delta: 1 },
  );
  if (m.identity === "alt") events.push({ t: "counterChange", subject: treasury, key: "identity", delta: 1 });
  return events;
}

function mergeWarnings(ctx: ActionContext, m: MergeCompanies): Warning[] {
  const { game, state } = ctx;
  const warnings: Warning[] = [];
  const cfg = mechanicConfigOf(game, "mergers", MergersConfig);
  if (state.turn.round !== (cfg?.round ?? "MR")) warnings.push(warning("notMergerRound", "No es la ronda de fusiones."));
  if (m.identity === "alt" && game.companies.find((c) => c.id === m.into)?.altName === undefined) {
    warnings.push(warning("unknownIdentity", "Esta corporación no tiene segunda identidad."));
  }
  const plan = mergePlan(game, ctx.players, state, m.a, m.b);
  if (plan.countedTrains > plan.limit) {
    warnings.push(warning("trainLimit", `La corporación tendría ${plan.countedTrains} trenes; el límite es ${plan.limit}.`));
  }
  if (plan.tie && plan.president) {
    const name = ctx.players.find((p) => p.id === plan.president)?.name ?? plan.president;
    const minor = game.companies.find((c) => c.id === plan.tie?.minor)?.shortName ?? plan.tie.minor;
    warnings.push(
      warning("presidencyTie", `Empate a ${plan.tie.units}: preside ${name} (presidencia de ${minor}, que opera antes).`, "info"),
    );
  }
  return warnings;
}

const isFloatedMinor = (ctx: ActionContext, id: CompanyId) =>
  ctx.game.companies.find((c) => c.id === id)?.tier === "minor" && ctx.state.companies[id]?.status === "floated";

export const mergers: Mechanic<MergersConfig> = {
  id: "mergers",
  configSchema: MergersConfig,
  handlers: {
    mergeCompanies: {
      available: (ctx, m) => {
        if (!m) return AVAILABLE;
        if (m.a === m.b) return unavailable("Elige dos minors distintas");
        if (!isFloatedMinor(ctx, m.a) || !isFloatedMinor(ctx, m.b)) return unavailable("Solo se fusionan dos minors en juego");
        const into = ctx.game.companies.find((c) => c.id === m.into);
        if (into?.tier !== "major" || ctx.state.companies[m.into]?.status !== "unstarted") {
          return unavailable("La corporación debe estar sin abrir");
        }
        return AVAILABLE;
      },
      validate: mergeWarnings,
      expand: mergeEvents,
    },

    /** The end step of the OR being left (none), then the MR, with the minors in operating order. */
    startMR: {
      available: (ctx) => (mergerRoundDue(ctx.game, ctx.state) ? AVAILABLE : unavailable("No toca ronda de fusiones")),
      expand: (ctx) => {
        const scheduleIndex = slotIndex(ctx.game, `MR${ctx.state.turn.srNumber}`);
        const minors = operatingOrder(ctx.game, ctx.state).filter((id) => ctx.game.companies.find((c) => c.id === id)?.tier === "minor");
        return [
          ...roundEndEvents(ctx.game, ctx.state),
          { t: "turnAdvance", round: "MR", ...(scheduleIndex !== undefined ? { scheduleIndex } : {}), company: null, operatingOrder: minors },
        ];
      },
    },
  },
};
