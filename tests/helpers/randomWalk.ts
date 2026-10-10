import { assetsHeldBy, cashOf, unitsOf } from "../../src/domain/events/state";
import { isEnabled } from "../../src/domain/mechanics/custom";
import { overLimitCompanies, trainStack } from "../../src/domain/mechanics/phases";
import { effectiveTraits } from "../../src/domain/mechanics/traits";
import { parPricesFor } from "../../src/domain/mechanics/market";
import type { TestSession } from "./dispatch";

/**
 * A seeded random walk over valid high-level actions (T162, T163): candidates for the current
 * round, shuffled; callers apply the first one the pipeline accepts.
 */

export const NAMES = ["Ana", "Bruno", "Carla", "Dani", "Eva", "Fede"];

/** mulberry32: small, fast and reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type WalkAction = Record<string, unknown> & { type: string };

export function candidates(s: TestSession, rand: () => number): WalkAction[] {
  const { game, state, players } = s;
  const pick = <T,>(xs: readonly T[]): T | undefined => xs[Math.floor(rand() * xs.length)];
  const player = () => pick(players)!.id;
  const company = () => pick(game.companies)!.id;
  const amount = (max: number) => 10 * (1 + Math.floor(rand() * (max / 10)));
  const round = state.turn.round;
  const out: WalkAction[] = [];

  const unownedPrivate = game.privates.find((p) => assetsHeldBy(state, "bank", "private").some((a) => a.includes(p.id)));
  if (unownedPrivate) out.push({ type: "buyPrivate", buyer: player(), private: unownedPrivate.id, price: unownedPrivate.cost, par: null });

  if (round === "SR" || round === "PRIVATES") {
    const c = company();
    const pars = parPricesFor(game, c);
    const price = pick(pars);
    if (price !== undefined) out.push({ type: "parCompany", player: player(), company: c, price });
    for (let i = 0; i < 4; i++) {
      out.push({ type: "buyShare", buyer: `player:${player()}`, company: company(), source: rand() < 0.75 ? "ipo" : "pool", count: 1 });
    }
    const p = player();
    const held = game.companies.filter((x) => unitsOf(state, `player:${p}`, x.id) > 0);
    const sold = pick(held);
    if (sold) out.push({ type: "sellShares", seller: `player:${p}`, company: sold.id, count: 1 });
    if (rand() < 0.15) out.push({ type: "endSR" });
    if (rand() < 0.1) out.push({ type: "startOR" });
    if (round === "PRIVATES" || rand() < 0.05) out.push({ type: "startSR" });
  }

  if (round === "CR") {
    out.push({ type: "issueShares", company: company(), count: 1 });
    out.push({ type: "buyShare", buyer: `company:${company()}`, company: company(), source: "ipo", count: 1 });
    out.push({ type: "endCR" }, { type: "startOR" });
  }

  if (round === "OR") {
    const current = state.turn.currentCompany;
    if (current) {
      const forSale = game.trains.filter((t) => assetsHeldBy(state, "bank", "train").some((a) => a.startsWith(`train:${t.type}:`)));
      const t = forSale[0];
      if (t && rand() < 0.5) {
        out.push({ type: "buyTrain", company: null, trainType: t.type, variant: null, from: "bank", seller: null, price: null, tradeIn: null });
      }
      const parts = game.revenueParts.map((p) => ({ part: p.id, amount: amount(300) }));
      const choice = game.revenueParts.some((p) => p.to === "choice");
      const mode = choice ? (pick(game.payoutModes) ?? "full") : null;
      out.push({ type: "runAndPayout", company: null, parts, mode });
      if (game.loans) out.push({ type: "takeLoan", company: null, count: 1 + Math.floor(rand() * 2) });
      if (rand() < 0.3) out.push({ type: "payCost", company: null, amount: amount(120), reason: null });
      if (rand() < 0.2 && cashOf(state, `company:${current}`) < 0) {
        out.push({ type: "transferMoney", from: `player:${player()}`, to: `company:${current}`, amount: amount(200) });
      }
      if (isEnabled(game, "nationalBank")) out.push({ type: "nationalPayout", extra: amount(60) });
    }
    out.push({ type: "privateIncome" });
    out.push({ type: "nextCompany" });
    if (!current) out.push({ type: rand() < 0.5 ? "startOR" : "startSR" });
  }

  if (isEnabled(game, "auctionLaunch")) out.push(...rotlaCandidates(s, rand));

  if (round !== "CR" && isEnabled(game, "corporateRound") && rand() < 0.05) out.push({ type: "startCR" });
  if (rand() < 0.03) out.push({ type: "transferMoney", from: `player:${player()}`, to: `player:${player()}`, amount: amount(50) });

  // Shuffle, so the first valid candidate is a random one.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Tried last, so a walk never dead-ends on an unlucky draw. */
export const FLOW: readonly WalkAction[] = [{ type: "nextCompany" }, { type: "startOR" }, { type: "startSR" }];


/**
 * RotLA (T098): launches, treasury trades, the 7/∞ with trade-ins, abilities, forced purchases,
 * over-limit discards, the Merger Round and mergers, on top of the generic candidates.
 */
function rotlaCandidates(s: TestSession, rand: () => number): WalkAction[] {
  const { game, state, players } = s;
  const pick = <T,>(xs: readonly T[]): T | undefined => xs[Math.floor(rand() * xs.length)];
  const status = (id: string) => state.companies[id]?.status;
  const minors = game.companies.filter((c) => c.tier === "minor");
  const out: WalkAction[] = [];
  const round = state.turn.round;

  if (round === "SR") {
    const unstarted = pick(minors.filter((c) => status(c.id) === "unstarted"));
    const bid = 120 + 5 * Math.floor(rand() * 20);
    if (unstarted) out.push({ type: "launchCompany", player: pick(players)!.id, company: unstarted.id, bid, price: null });
    const open = pick(game.companies.filter((c) => status(c.id) === "floated"));
    if (open) out.push({ type: "buyShare", buyer: `player:${pick(players)!.id}`, company: open.id, source: rand() < 0.7 ? "treasury" : "pool", count: 1 });
  }

  if (round === "OR") {
    const current = state.turn.currentCompany;
    if (current) {
      out.push({ type: "issueShares", company: current, count: 1 }, { type: "redeemShare", company: null, count: null });
      for (const p of effectiveTraits(game, state, current).payments ?? []) {
        out.push({ type: "namedPayment", company: null, payment: p.id, amount: p.amount > 0 ? null : 10 + 10 * Math.floor(rand() * 5) });
      }
      const top = trainStack(game, state)[0];
      if (top && rand() < 0.4) {
        const def = game.trains.find((t) => t.type === top.type)!;
        const variant = pick(def.variants)!.name;
        const held = assetsHeldBy(state, `company:${current}`, "train");
        const tradeIn = def.tradeIn && held.length > 0 && rand() < 0.5 ? (held[0]!.split(":")[1] ?? null) : null;
        out.push({ type: "buyTrain", company: null, trainType: top.type, variant, from: "bank", seller: null, price: null, tradeIn });
        if (held.length === 0 && rand() < 0.3) {
          const president = state.presidency[current];
          const owned = game.companies.filter((c) => president && unitsOf(state, president, c.id) > 0 && status(c.id) === "floated");
          const sold = pick(owned);
          out.push({
            type: "forcedTrainPurchase",
            company: null,
            trainType: top.type,
            variant: null,
            from: "bank",
            sales: sold ? [{ company: sold.id, count: 1 }] : [],
          });
        }
      }
    }
    for (const o of overLimitCompanies(game, state)) {
      const train = assetsHeldBy(state, `company:${o.company}`, "train")[0];
      if (train) out.push({ type: "discardTrain", company: o.company, train });
    }
    if (!current) out.push({ type: "startMR" });
  }

  if (round === "MR") {
    const floated = minors.filter((c) => status(c.id) === "floated");
    const a = pick(floated);
    const b = pick(floated.filter((c) => c.id !== a?.id));
    const into = pick(game.companies.filter((c) => c.tier === "major" && status(c.id) === "unstarted"));
    if (a && b && into) out.push({ type: "mergeCompanies", a: a.id, b: b.id, into: into.id, identity: rand() < 0.3 ? "alt" : null });
    out.push({ type: "startSR" });
  }
  return out;
}
