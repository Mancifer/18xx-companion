import { ActionSchema, type Action, type ActionOf, type ActionType } from "../../domain/actions/schemas";
import type { SessionState, TurnState } from "../../domain/events/state";
import type { CompanyStatus, EventOf, PrimitiveEvent } from "../../domain/events/types";
import type { EndTriggerType, GameDefinition } from "../../domain/games/schema";
import type { BalanceChange, Movement } from "../../domain/ledger/breakdown";
import { mergePreview } from "../../domain/mechanics/custom/mergers";
import { cycleCount } from "../../domain/mechanics/endTriggers";
import { launchPrice, priceAt, priceOf } from "../../domain/mechanics/market";
import { perShareAmount } from "../../domain/mechanics/payout";
import { RUSTED } from "../../domain/mechanics/phases";
import type { ExportPreview } from "../../domain/mechanics/schedule";
import { effectiveTraits } from "../../domain/mechanics/traits";
import { parseHolder, trainTypeOf, type CompanyId, type HolderRef, type Player } from "../../domain/types";
import type { DomainText, GameEndText, IncomeText, MissingChips, Summarized, SummaryContext, UndoRangeText } from "../contract/domain";
import { formatMoney } from "../format";
import { gameText } from "../gameText";
import { companyName, companyTrains, fullName, mention, singleTransfer, startedOR } from "../shared";

/**
 * English text for cards, toasts and History (feature 014). Mirrors ../es/domain.ts function by
 * function; terms follow the English 1830/1848 rulebooks (research R12).
 */

const money = (n: number, ctx: Pick<SummaryContext, "game">) => formatMoney(n, ctx.game, "en");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function holderName(holder: HolderRef, game: GameDefinition, players: readonly Player[]): string {
  const h = parseHolder(holder);
  switch (h.kind) {
    case "bank":
      return "the bank";
    case "pool":
      return "the pool";
    case "removed":
      return "out of the game";
    case "player":
      return players.find((p) => p.id === h.id)?.name ?? h.id;
    case "company":
      return game.companies.find((c) => c.id === h.id)?.shortName ?? h.id;
    case "ipo":
      return `the ${game.companies.find((c) => c.id === h.id)?.shortName ?? h.id} IPO`;
  }
}

const statusLabel: Readonly<Record<CompanyStatus, string>> = {
  unstarted: "not started",
  parred: "parred",
  floated: "floated",
  receivership: "in receivership",
  bankrupt: "bankrupt",
  closed: "closed",
};

function roundLabel(turn: Pick<TurnState, "round" | "srNumber" | "orSet" | "orIndex">): string {
  switch (turn.round) {
    case "PRIVATES":
      return "Privates";
    case "SR":
      return `SR ${turn.srNumber}`;
    case "CR":
      return `CR ${turn.srNumber}`;
    case "OR":
      return `OR ${turn.orSet}.${turn.orIndex}`;
    case "MR":
      return `MR ${turn.srNumber}`;
  }
}

const ROUND_SHORT: Readonly<Record<"SR" | "OR" | "MR", string>> = { SR: "SR", OR: "OR", MR: "MR" };

/** "Cycle 2 of 6 · OR 1/2", "Cycle 3 of 6 · MR"; undefined for games not played in cycles. */
function cycleRoundLabel(game: GameDefinition, turn: Pick<TurnState, "round" | "srNumber" | "orIndex" | "orsInSet">): string | undefined {
  const cycles = cycleCount(game);
  if (cycles === undefined || turn.round === "PRIVATES" || turn.round === "CR") return undefined;
  const round = turn.round === "OR" ? `OR ${turn.orIndex}/${turn.orsInSet}` : ROUND_SHORT[turn.round];
  return `Cycle ${Math.max(1, turn.srNumber)} of ${cycles} · ${round}`;
}

/** "Operating Round 2.1", "Stock Round 3"; in cycles, "Cycle 2 · Operating Round 1/2". */
function roundTitle(game: GameDefinition, turn: Pick<TurnState, "round" | "srNumber" | "orSet" | "orIndex" | "orsInSet">): string {
  const cycle = cycleCount(game) !== undefined && turn.round !== "PRIVATES" && turn.round !== "CR" ? `Cycle ${Math.max(1, turn.srNumber)} · ` : undefined;
  switch (turn.round) {
    case "PRIVATES":
      return "Privates";
    case "SR":
      return cycle ? `${cycle}Stock Round` : `Stock Round ${turn.srNumber}`;
    case "OR":
      return cycle ? `${cycle}Operating Round ${turn.orIndex}/${turn.orsInSet}` : `Operating Round ${turn.orSet}.${turn.orIndex}`;
    case "MR":
      return cycle ? `${cycle}Merger Round` : `Merger Round ${turn.srNumber}`;
    case "CR":
      return `Corporate Round ${turn.srNumber}`;
  }
}

function phaseName(game: GameDefinition, id: string): string {
  return gameText(game, "en").phase(id) ?? id;
}

function trainsHead(count: number, limit: number): string {
  return Number.isFinite(limit) ? `Trains ${count}/${limit}` : `Trains ${count}`;
}

function trainsLine(game: GameDefinition, state: SessionState, company: CompanyId): { text: string; warn: boolean } {
  const { cards, count, limit, over } = companyTrains(game, state, company);
  if (cards.length === 0) return { text: "No trains", warn: true };
  const types = cards.map((c) => (c.rusted ? `${c.label} (rusted)` : c.label));
  return { text: `${trainsHead(count, limit)} · ${types.join(", ")}${over ? " · over the limit" : ""}`, warn: over };
}

type Summarizer<T extends ActionType> = (a: ActionOf<T>, ctx: SummaryContext, events?: readonly PrimitiveEvent[]) => string;
type SummaryMap = { [K in ActionType]?: Summarizer<K> };

const name = (h: string, ctx: SummaryContext) => {
  const holder = parseHolder(h as HolderRef);
  if (holder.kind === "company") return companyName(holder.id, ctx);
  if (holder.kind === "ipo") return `the ${companyName(holder.id, ctx)} IPO`;
  return holderName(h as HolderRef, ctx.game, ctx.players);
};

/** "A, B and C". */
const listOf = (items: readonly string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

const summaries: SummaryMap = {
  createSession: (a, ctx) => `New ${ctx.game.name} game with ${a.players.map((p) => p.name).join(", ")}`,
  transferMoney: (a, ctx) =>
    a.to === "bank"
      ? `${capitalize(name(a.from, ctx))} pays ${money(a.amount, ctx)} to the bank`
      : a.from === "bank"
        ? `The bank pays ${money(a.amount, ctx)} to ${name(a.to, ctx)}`
        : `${capitalize(name(a.from, ctx))} pays ${money(a.amount, ctx)} to ${name(a.to, ctx)}`,
  adjustMoney: (a, ctx, events) => {
    if (a.setTo === null) return `Adjustment of ${money(a.delta ?? 0, ctx)} to ${name(a.holder, ctx)}`;
    const moved = events?.find((e): e is EventOf<"moneyTransfer"> => e.t === "moneyTransfer");
    const diff = moved ? ` (${signedMoney(moved.to === a.holder ? moved.amount : -moved.amount, ctx)})` : "";
    return `${capitalize(name(a.holder, ctx))}: money set to ${money(a.setTo, ctx)}${diff}`;
  },
  transferShares: (a, ctx) =>
    `${plural(a.units, "share", "shares")} of ${companyName(a.company, ctx)}${a.presidency ? " (presidency)" : ""}: ${name(a.from, ctx)} → ${name(a.to, ctx)}`,
  note: (a) => `Note: ${a.text}`,

  runAndPayout: (a, ctx) => {
    const company = operating(a.company, ctx);
    const choice = ctx.game.revenueParts.find((r) => r.to === "choice");
    if (choice && a.parts.length === 1) {
      const amount = a.parts[0]?.amount ?? 0;
      const id = a.company ?? ctx.state?.turn.currentCompany;
      const shares = ctx.game.companies.find((c) => c.id === id)?.shareCount ?? 10;
      if (a.mode === "withhold") return `${company} withholds ${money(amount, ctx)}`;
      if (a.mode === "half") return `${company} pays half of ${money(amount, ctx)}`;
      return `${company} pays ${money(amount, ctx)} (${money(perShareAmount(ctx.game, amount, shares), ctx)}/share)`;
    }
    const parts = a.parts
      .map((p) => `${gameText(ctx.game, "en").revenuePart(p.part).toLocaleLowerCase("en")} ${money(p.amount, ctx)}`)
      .join(", ");
    return `${company}: ${parts}`;
  },
  buyTrain: (a, ctx, events) => {
    const company = operating(a.company, ctx);
    const train = a.variant ?? a.trainType;
    const from = a.from === "bank" ? "from the bank" : a.from === "pool" ? "from the pool" : `from ${companyName(a.seller ?? "", ctx)}`;
    const price = a.price !== null ? ` for ${money(a.price, ctx)}` : paid(events, ctx);
    const tradeIn = a.tradeIn !== null ? ` trading in a ${a.tradeIn}` : "";
    return `${company} buys a ${train} ${from}${price}${tradeIn}`;
  },
  payCost: (a, ctx) => `${operating(a.company, ctx)} pays ${money(a.amount, ctx)}${a.reason ? ` (${a.reason})` : ""}`,
  bankPays: (a, ctx) => `The bank pays ${money(a.amount, ctx)} to ${operating(a.company, ctx)} (${a.reason})`,
  privateIncome: () => "Private income",
  buyPrivateByCompany: (a, ctx) => `${operating(a.company, ctx)} buys the private ${privateName(a.private, ctx)} for ${money(a.price, ctx)}`,
  discardTrain: (a, ctx) => `${companyName(a.company, ctx)} discards a ${a.train.includes(":") ? (a.train.split(":")[1] ?? a.train) : a.train}`,
  changeTrainSupply: (a) => (a.op === "add" ? `A ${a.trainType} is added to the supply` : `A ${a.trainType} is removed from the supply`),
  startOR: (_a, ctx, events) => `The operating round starts${capital(events, ctx)}`,
  nationalPayout: (a, ctx) => `National bank payout (+${money(a.extra, ctx)} from cities)`,
  takeLoan: (a, ctx) =>
    `${operating(a.company, ctx)} takes ${plural(a.count, "loan", "loans")}: +${money(a.count * (ctx.game.loans?.amount ?? 0), ctx)}`,
  enterReceivership: (a, ctx) =>
    ctx.game.customRules.some((r) => r.id === "nationalTakeover")
      ? `${companyName(a.company, ctx)} goes into receivership with the national bank`
      : `${companyName(a.company, ctx)} goes into receivership`,
  declareBankruptcy: (a, ctx, events) => {
    if (a.player === null) return `${companyName(a.company ?? "", ctx)} goes bankrupt`;
    const who = name(`player:${a.player}`, ctx);
    const closed = (events ?? []).flatMap((e) => (e.t === "companyStatus" && e.status === "closed" ? [fullName(e.company, ctx)] : []));
    if (closed.length === 0) return `${who} declares bankruptcy`;
    const paidOut = (events ?? []).reduce(
      (sum, e) => sum + (e.t === "moneyTransfer" && e.from === "bank" && e.to.startsWith("player:") && e.to !== `player:${a.player}` ? e.amount : 0),
      0,
    );
    const verb = closed.length === 1 ? "closes" : "close";
    return `${who} goes bankrupt: out of the game; ${listOf(closed)} ${verb}${paidOut > 0 ? `; ${money(paidOut, ctx)} paid to other shareholders` : ""}`;
  },
  closeCompany: (a, ctx) => `${companyName(a.company, ctx)} closes`,
  parCompany: (a, ctx, events) => {
    const transfer = singleTransfer(events);
    const base = `${name(`player:${a.player}`, ctx)} pars ${companyName(a.company, ctx)} at ${money(a.price, ctx)}`;
    return transfer ? `${base} and pays ${money(transfer.amount, ctx)}` : base;
  },
  buyShare: (a, ctx, events) => `${capitalize(name(a.buyer, ctx))} buys ${a.count ?? 1} ${companyName(a.company, ctx)} ${SOURCE[a.source]}${paid(events, ctx)}`,
  sellShares: (a, ctx, events) => `${capitalize(name(a.seller, ctx))} sells ${a.count} ${companyName(a.company, ctx)}${paid(events, ctx)}`,
  swapCertificates: (a, ctx) =>
    `${name(`player:${a.player}`, ctx)} swaps ${a.give.units} ${companyName(a.give.company, ctx)} for ${a.take.units} ${companyName(a.take.company, ctx)} with the ${companyName(a.company, ctx)} treasury`,
  buyPrivate: (a, ctx) =>
    `${name(`player:${a.buyer}`, ctx)} buys the private ${privateName(a.private, ctx)} for ${money(a.price, ctx)}${a.par !== null ? ` (par ${money(a.par, ctx)})` : ""}`,
  exchangePrivate: (a, ctx) => {
    const owner = ctx.state?.assets[`private:${a.private}`];
    const company = a.company ?? ctx.game.privates.find((p) => p.id === a.private)?.exchange?.company ?? "";
    return `${owner ? `${capitalize(name(owner, ctx))} exchanges` : "Exchange of"} the private ${privateName(a.private, ctx)} for 1 ${companyName(company, ctx)}`;
  },
  launchCompany: (a, ctx) => {
    const def = ctx.game.companies.find((c) => c.id === a.company);
    const price = a.price ?? (ctx.state ? launchPrice(ctx.game, ctx.state, a.bid).price : undefined);
    const shares = def ? def.shareCount - def.presidencyUnits : 0;
    const treasury = a.bid - (def?.traits?.launchFee ?? 0);
    return [
      `${name(`player:${a.player}`, ctx)} launches ${mention(a.company, def?.name ?? a.company, ctx)} for ${money(a.bid, ctx)}`,
      ...(price !== undefined ? [`price ${money(price, ctx)}`] : []),
      `treasury ${money(treasury, ctx)}${def?.traits?.launchFee ? ` (${money(def.traits.launchFee, ctx)} to the bank)` : ""}`,
      `${plural(shares, "share", "shares")} in the treasury`,
      ...(def?.traits?.launchAssets?.length ? ["with its own train"] : []),
    ].join(" · ");
  },
  stockBatch: (a, ctx) => `Batch: ${a.items.map((item) => summary(item, ctx)).join("; ")}`,
  startSR: (_a, ctx, events) => {
    const exported = events ? exportedLine(events, ctx) : undefined;
    return exported ? `The stock round starts · ${exported}` : "The stock round starts";
  },
  endSR: () => "End of the stock round",
  endGame: (a) => `Game over ${endConditions(a.triggers ?? [])}`,
  reopenGame: () => "Game reopened",
  confirmFloatCondition: (a, ctx) => `Float condition confirmed for ${companyName(a.company, ctx)}`,
  issueShares: (a, ctx, events) =>
    ctx.game.market.moves.issue?.from === "treasury"
      ? `${companyName(a.company, ctx)} issues ${plural(a.count, "share", "shares")} from its treasury to the pool${paid(events, ctx)}`
      : `${companyName(a.company, ctx)} issues ${a.count}${paid(events, ctx)}`,
  redeemShare: (a, ctx) => {
    const id = a.company ?? ctx.state?.turn.currentCompany ?? "";
    const price = ctx.state ? priceOf(ctx.game, ctx.state, id) : undefined;
    const count = a.count ?? 1;
    return `${operating(a.company, ctx)} redeems ${plural(count, "share", "shares")} from the pool${price !== undefined ? ` for ${money(price * count, ctx)}` : ""}`;
  },
  forcedTrainPurchase: (a, ctx) => {
    const from = a.from === "bank" ? "from the bank" : "from the pool";
    const sales = a.sales.map((s) => `${s.count} ${companyName(s.company, ctx)}`);
    const sold = sales.length > 0 ? ` · the president sells ${listOf(sales)}` : "";
    return `Forced purchase: ${operating(a.company, ctx)} buys a ${a.variant ?? a.trainType} ${from}${sold}`;
  },
  namedPayment: (a, ctx) => {
    const id = a.company ?? ctx.state?.turn.currentCompany ?? "";
    const company = ctx.game.companies.find((c) => c.id === id);
    const payments = ctx.state
      ? (effectiveTraits(ctx.game, ctx.state, id).payments ?? [])
      : ctx.game.companies.flatMap((c) => c.traits?.payments ?? []);
    const payment = payments.find((p) => p.id === a.payment);
    const label = gameText(ctx.game, "en").payment(a.payment, payment?.labelEs).toLocaleLowerCase("en");
    const amount = money(a.amount ?? payment?.amount ?? 0, ctx);
    const lines = payment?.cost
      ? [`${label} −${money(payment.cost, ctx)}`, `bonus +${amount}`]
      : [`${label} ${payment?.direction === "companyPays" ? "−" : "+"}${amount}`];
    return `${company ? fullName(company.id, ctx) : id}: ${lines.join(" · ")}`;
  },
  mergeCompanies: (a, ctx, events) => {
    const def = ctx.game.companies.find((c) => c.id === a.into);
    const into = mention(a.into, a.identity === "alt" ? (def?.altName ?? a.into) : (def?.name ?? a.into), ctx);
    const head = `${fullName(a.a, ctx)} + ${fullName(a.b, ctx)} → ${into}`;
    const player = (id: string | undefined) => ctx.players.find((p) => p.id === id)?.name ?? id ?? "?";
    const treasuryRef = `company:${a.into}`;
    let details: { president: string; price: number; treasury: number; trains: number } | undefined;
    if (events) {
      const president = events.find((e) => e.t === "shareTransfer" && e.company === a.into && e.presidency);
      const move = events.find((e) => e.t === "marketMove" && e.company === a.into);
      details = {
        president: president?.t === "shareTransfer" ? name(president.to, ctx) : "?",
        price: move?.t === "marketMove" ? (priceAt(ctx.game, a.into, move.to) ?? 0) : 0,
        treasury: events.reduce((sum, e) => sum + (e.t === "moneyTransfer" && e.to === treasuryRef ? e.amount : 0), 0),
        trains: events.filter((e) => e.t === "assetTransfer" && e.to === treasuryRef && e.asset.startsWith("train:")).length,
      };
    } else if (ctx.state) {
      const p = mergePreview(ctx.game, ctx.players, ctx.state, a.a, a.b);
      details = { president: player(p.president), price: p.price, treasury: p.treasury, trains: p.trains.length };
    }
    if (!details) return head;
    return `${head} · president ${details.president} · price ${money(details.price, ctx)} · treasury ${money(details.treasury, ctx)} · ${plural(details.trains, "train", "trains")}`;
  },
  startMR: () => "The merger round starts",
  rockFormation: (a, ctx) => `${operating(a.company, ctx)}: rock formation (+2)`,
  cliffSale: (a, ctx) => {
    const type = a.train.includes(":") ? (a.train.split(":")[1] ?? a.train) : a.train;
    const cost = ctx.game.trains.find((t) => t.type === type)?.variants[0]?.cost ?? 0;
    return `${operating(a.company, ctx)} sells the ${type} at the cliff: +${money(Math.floor(cost / 2), ctx)}`;
  },
  canyonTrain: (a, ctx) => {
    const type = ctx.game.trains.find((t) => t.rustsOnPhase !== undefined && !t.special)?.type ?? "2";
    return `${operating(a.company, ctx)} gets the canyon train (a ${type} that doesn't rust)`;
  },
  startCR: () => "The corporate round starts",
  endCR: () => "End of the corporate round",

  correctTrain: (a, ctx, events) => {
    const moved = events?.find((e) => e.t === "assetTransfer" && e.asset.startsWith("train:"));
    const type = trainTypeOf(moved?.t === "assetTransfer" ? moved.asset : a.train.includes(":") ? a.train : `train:${a.train}:0`);
    const co = companyName(a.company, ctx);
    const amount = events ? (singleTransfer(events)?.amount ?? 0) : (a.amount ?? 0);
    const shown = amount > 0 ? money(amount, ctx) : undefined;
    if (a.op === "add") return `Correction: ${co} gets a ${type} from the supply${shown ? ` and pays ${shown}` : ""}`;
    if (a.to === "pool") return `Correction: ${co}'s ${type} goes to the pool${shown ? ` and ${co} gets ${shown}` : ""}`;
    if (a.to === "removed") return `Correction: ${co}'s ${type} leaves the game${shown ? ` and ${co} gets ${shown}` : ""}`;
    const refund = events ? shown : a.amount === null ? "the list price" : shown;
    return `Correction: ${co} returns a ${type} to the supply${refund ? ` and gets ${refund}` : ""}`;
  },

  nextCompany: (_a, ctx, events) => roundEnd(events, ctx) ?? "Next company",
  setPhase: (a) => `Phase set by hand: ${a.phase}`,
  setTurn: (a, ctx) => {
    const parts = [
      a.round !== null ? a.round : null,
      a.srNumber !== null ? `SR ${a.srNumber}` : null,
      a.orSet !== null || a.orIndex !== null ? `OR ${a.orSet ?? "?"}.${a.orIndex ?? "?"}` : null,
      a.orsInSet !== null ? `${a.orsInSet} ORs per set` : null,
      a.company !== null ? `${companyName(a.company, ctx)} operates` : null,
    ].filter((x) => x !== null);
    return `Turn set by hand: ${parts.join(", ")}`;
  },
  setMarket: (a, ctx) => {
    const price = priceAt(ctx.game, a.company, a.cell);
    return `${companyName(a.company, ctx)} moved by hand${price !== undefined ? ` to ${money(price, ctx)}` : ""}`;
  },

  compound: (a, ctx) =>
    a.actions
      .map((raw) => {
        const parsed = ActionSchema.safeParse(raw);
        return parsed.success ? summary(parsed.data, ctx) : "?";
      })
      .join("; "),

  adjustCounter: (a, ctx) =>
    `${capitalize(COUNTER_LABELS[a.key] ?? a.key)} of ${name(a.subject, ctx)}: ${a.delta > 0 ? "+" : ""}${a.key === "debt" ? money(a.delta, ctx) : a.delta}`,
};

const SOURCE: Readonly<Record<"ipo" | "pool" | "treasury", string>> = {
  ipo: "from the IPO",
  pool: "from the pool",
  treasury: "from the treasury",
};

const END_TRIGGER_LABELS: Readonly<Record<EndTriggerType, string>> = {
  bankBroken: "bank broken",
  topCell: "top cell of the market",
  loansIssued: "loans issued",
  takeovers: "companies in receivership",
  lastRound: "last round",
  bankruptcy: "bankruptcy",
  cyclesComplete: "cycles complete",
  scheduleComplete: "last operating round",
};

const GAME_END: GameEndText = {
  noEndCondition: "No end-of-game condition has been met yet.",
  alreadyEnded: "The game was already over: the ending moves to this entry.",
  notEnded: "The game is not over",
};

function endConditions(triggers: readonly EndTriggerType[]): string {
  return triggers.length > 0 ? `(${triggers.map((t) => END_TRIGGER_LABELS[t]).join(", ")})` : "(no end condition)";
}

const COUNTER_LABELS: Readonly<Record<string, string>> = {
  debt: "debt",
  eastWestTokens: "East-West tokens",
  runs: "runs",
  bankrupt: "bankruptcy",
  nationalTakeovers: "receiverships",
};

/** " for $X" from the group's only transfer: the price actually paid. */
function paid(events: readonly PrimitiveEvent[] | undefined, ctx: SummaryContext): string {
  const transfer = singleTransfer(events);
  return transfer ? ` for ${money(transfer.amount, ctx)}` : "";
}

/** " · PRR capital: $X" for each company paid its capital at the end of the round. */
function capital(events: readonly PrimitiveEvent[] | undefined, ctx: SummaryContext): string {
  return (events ?? [])
    .filter((e): e is EventOf<"moneyTransfer"> => e.t === "moneyTransfer" && e.from === "bank" && e.to.startsWith("company:"))
    .map((e) => ` · ${name(e.to, ctx)} capital: ${money(e.amount, ctx)}`)
    .join("");
}

function signedMoney(delta: number, ctx: SummaryContext): string {
  return delta < 0 ? money(delta, ctx) : `+${money(delta, ctx)}`;
}

function operating(id: string | null, ctx: SummaryContext): string {
  const resolved = id ?? ctx.state?.turn.currentCompany;
  return resolved ? companyName(resolved, ctx) : "The operating company";
}

function privateName(id: string, ctx: SummaryContext): string {
  return ctx.game.privates.find((p) => p.id === id)?.name ?? id;
}

function effects(events: readonly PrimitiveEvent[], ctx: SummaryContext): string[] {
  const out: string[] = [];
  const moves = new Map<string, string>();
  const removedTrains = new Map<string, number>();
  let closedPrivates = 0;
  for (const e of events) {
    switch (e.t) {
      case "marketMove": {
        if (e.reason === "par" || e.reason === "manual") break;
        if (e.reason === "restack") {
          moves.set(e.company, `${companyName(e.company, ctx)} goes to the bottom of the stack`);
          break;
        }
        const price = priceAt(ctx.game, e.company, e.to);
        if (price === undefined) break;
        const tags = "index" in e.to ? [] : (ctx.game.market.cells[e.to.row]?.[e.to.col]?.tags ?? []);
        const where = tags.includes("receivership") ? "receivership zone" : tags.includes("closed") ? "closed cell" : money(price, ctx);
        moves.set(e.company, `${companyName(e.company, ctx)} → ${where}`);
        break;
      }
      case "turnAdvance":
        if (e.roundEnd === "SR") out.push("end of the stock round");
        if (e.roundEnd === "CR") out.push("end of the corporate round");
        if (e.phase !== undefined && e.round === undefined) out.push(`phase ${phaseName(ctx.game, e.phase)}`);
        if (e.round === "OR" && e.orSet !== undefined && e.orIndex !== undefined) out.push(`OR ${e.orSet}.${e.orIndex}`);
        if (e.company) out.push(`${companyName(e.company, ctx)}'s turn`);
        break;
      case "shareTransfer":
        if (e.presidency && e.to !== "removed" && (e.from.startsWith("player:") || e.from === "pool")) {
          out.push(`${companyName(e.company, ctx)} presidency: ${name(e.from, ctx)} → ${name(e.to, ctx)}`);
        }
        break;
      case "assetTransfer":
        if (e.to !== "removed") break;
        if (e.asset.startsWith("train:")) {
          const type = e.asset.split(":")[1] ?? "";
          removedTrains.set(type, (removedTrains.get(type) ?? 0) + 1);
        } else if (e.asset.startsWith("private:")) {
          closedPrivates += 1;
        }
        break;
      case "companyStatus":
        if (e.status === "receivership") out.push(`${companyName(e.company, ctx)} in receivership`);
        else if (e.status === "closed" && events.some((m) => m.t === "marketMove" && m.company === e.company && !("index" in m.to) && (ctx.game.market.cells[m.to.row]?.[m.to.col]?.tags ?? []).includes("closed"))) {
          out.push(`${companyName(e.company, ctx)} dissolves`);
        }
        else if (e.status === "bankrupt") out.push(`${companyName(e.company, ctx)} bankrupt`);
        else if (e.status === "floated" && e.capitalPending) {
          out.push(`${companyName(e.company, ctx)} floats (capital at the end of the round)`);
        } else if (e.status === "floated" && e.capitalPending === undefined) {
          out.push(`${companyName(e.company, ctx)} floats`);
        }
        break;
      case "counterChange":
        if (e.key.startsWith(RUSTED) && e.delta > 0) {
          out.push(`${name(e.subject, ctx)}: the ${e.key.split(":")[2] ?? ""} rusts, last run`);
        }
        if (e.key === "debt") {
          const sign = e.delta > 0 ? "+" : "−";
          out.push(`${name(e.subject, ctx)} debt ${sign}${money(Math.abs(e.delta), ctx)}`);
        }
        break;
      default:
        break;
    }
  }
  for (const [type, n] of removedTrains) out.push(`out of the game: ${n} × ${type}`);
  if (closedPrivates > 0) out.push(closedPrivates === 1 ? "a private closes" : `${closedPrivates} privates close`);
  return [...moves.values(), ...out];
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("en") + text.slice(1);
}

function noRunSummary(events: readonly PrimitiveEvent[], ctx: SummaryContext): string | undefined {
  const run = events.find((e) => e.t === "counterChange" && e.key === "runs");
  if (run?.t !== "counterChange") return undefined;
  const company = parseHolder(run.subject);
  if (company.kind !== "company") return undefined;
  const moved = events.some((e) => e.t === "marketMove" && e.company === company.id);
  return moved ? `${companyName(company.id, ctx)} didn't run` : undefined;
}

/** "End of OR 2.1 · OR 2.2 starts", or "End of the operating rounds" when the set is complete. */
function roundEnd(events: readonly PrimitiveEvent[] | undefined, ctx: SummaryContext): string | undefined {
  const or = startedOR(events);
  if (or) {
    const [set, index] = [or.orSet ?? 0, or.orIndex ?? 0];
    if (cycleCount(ctx.game) !== undefined) {
      const of = or.orsInSet ?? index;
      return `End of OR ${index - 1}/${of} · OR ${index}/${of} starts`;
    }
    return `End of OR ${set}.${index - 1} · OR ${set}.${index} starts`;
  }
  const done = events?.some((e) => e.t === "turnAdvance" && e.company === null && e.round === undefined);
  return done ? "End of the operating rounds" : undefined;
}

function undone(groups: readonly Summarized[], ctx: SummaryContext): string {
  const newest = groups[0];
  const oldest = groups[groups.length - 1];
  if (!newest || !oldest) return "";
  const line = (g: Summarized) => summary(g.action, ctx, g.events);
  return groups.length === 1 ? `Undone: ${line(newest)}` : `Undid ${groups.length} entries: from ${line(oldest)} to ${line(newest)}`;
}

const INCOME: IncomeText = {
  title: "OR income",
  take: (m: string) => `Collects ${m} from the bank`,
  pay: (m: string) => `Pays ${m} to the bank`,
  none: "Nothing to settle",
  allSettled: "Nobody has anything to settle.",
  out: "Out of the game",
  rule: "During the ORs players don't touch their chips: at the end, each one collects or pays the difference to the bank.",
  since: (or: string) => `Since the start of OR ${or}`,
  startCash: "At the start",
  cashNow: "Now",
  orHeading: (set: number, index: number) => `OR ${set}.${index}`,
};

const UNDO_RANGE: UndoRangeText = {
  title: (count: number) => `Undo ${count} entries?`,
  from: (s: string) => `From: ${s}`,
  to: (s: string) => `To: ${s}`,
  note: "They stay in the history, marked as undone. Then record again whatever is needed.",
  confirm: (count: number) => `Undo ${count}`,
  cancel: "Cancel",
  undoBackToHere: "Undo back to here",
};

const SELF_DESCRIBED: ReadonlySet<string> = new Set(["launchCompany", "mergeCompanies", "correctTrain"]);

function summary(action: Action, ctx: SummaryContext, events?: readonly PrimitiveEvent[]): string {
  const fn = summaries[action.type] as Summarizer<ActionType> | undefined;
  const title = fn ? fn(action, ctx, events) : action.type;
  const noRun = events && action.type === "nextCompany" ? noRunSummary(events, ctx) : undefined;
  const base = noRun ? (roundEnd(events, ctx) ? `${noRun} · ${title}` : noRun) : title;
  let list =
    events && !SELF_DESCRIBED.has(action.type) && !(action.type === "startSR" && exportedLine(events, ctx)) ? effects(events, ctx) : [];
  const or = action.type === "nextCompany" ? startedOR(events) : undefined;
  if (or) list = list.filter((e) => e !== `OR ${or.orSet}.${or.orIndex}`);
  return list.length > 0 ? `${base} · ${list.join(" · ")}` : base;
}

function proposalSummary(action: Action, ctx: SummaryContext, events?: readonly PrimitiveEvent[]): string {
  if (action.type === "endGame") return `End the game ${endConditions(action.triggers ?? [])}`;
  return summary(action, ctx, events);
}

function lineHolder(holder: HolderRef, ctx: SummaryContext): string {
  const h = parseHolder(holder);
  switch (h.kind) {
    case "bank":
      return "Bank";
    case "pool":
      return "Pool";
    case "removed":
      return "Out of the game";
    case "ipo":
      return "IPO";
    default:
      return name(holder, ctx);
  }
}

function movementLine(m: Movement, ctx: SummaryContext): string | undefined {
  switch (m.kind) {
    case "money":
      return `${money(m.amount, ctx)}: ${lineHolder(m.from, ctx)} → ${lineHolder(m.to, ctx)}`;
    case "shares":
      return `${m.units} ${companyName(m.company, ctx)}: ${lineHolder(m.from, ctx)} → ${lineHolder(m.to, ctx)}${m.presidency ? " (presidency)" : ""}`;
    case "asset": {
      const [kind, id = ""] = m.asset.split(":");
      const what = kind === "train" ? `train ${id}` : kind === "private" ? `private ${id}` : m.asset;
      return `${what}: ${lineHolder(m.from, ctx)} → ${lineHolder(m.to, ctx)}`;
    }
    case "price": {
      const company = companyName(m.company, ctx);
      if (m.reason === "restack") return `${company}: goes to the bottom of the stack`;
      const from = m.from === null ? "no price" : money(m.from, ctx);
      const to = m.to === null ? "no price" : money(m.to, ctx);
      return `${company}: ${from} → ${to}${m.zone ? ` (${m.zone === "receivership" ? "receivership zone" : "closed cell"})` : ""}`;
    }
    case "status":
      return `${companyName(m.company, ctx)}: ${statusLabel[m.from]} → ${statusLabel[m.to]}`;
    case "counter": {
      const label = COUNTER_LABELS[m.key] ?? m.key;
      const amount = m.key === "debt" ? signedMoney(m.delta, ctx) : `${m.delta > 0 ? "+" : "−"}${Math.abs(m.delta)}`;
      return `${label} of ${name(m.subject, ctx)}: ${amount}`;
    }
    case "turn": {
      const words = effects([m.event], ctx);
      return words.length > 0 ? words.join(" · ") : undefined;
    }
  }
}

function balanceLine(b: BalanceChange, ctx: SummaryContext): string {
  const who = lineHolder(b.holder, ctx);
  if (b.before === null || b.after === null) return `${who}: ${signedMoney(b.delta, ctx)}`;
  return `${who}: ${money(b.before, ctx)} → ${money(b.after, ctx)} (${signedMoney(b.delta, ctx)})`;
}

/** "A 3 train is exported: the green phase starts; the 2s rust." */
function exportInfo(preview: ExportPreview, game?: GameDefinition): string {
  const what = preview.count === 1 ? `A ${preview.displayName} train is exported` : `${preview.count} ${preview.displayName} trains are exported`;
  const phaseLabel = preview.phase ? ((game ? gameText(game, "en").phase(preview.phase.id) : undefined) ?? preview.phase.color ?? preview.phase.id) : "";
  const phase = preview.phase ? `: the ${phaseLabel.toLocaleLowerCase("en")} phase starts` : "";
  const rust = preview.rusts.length > 0 ? `; the ${preview.rusts.join(", ")} rust` : "";
  return `${what}${phase}${rust}.`;
}

/** "Exported: 3 → green phase; the 2 rust". */
function exportedLine(events: readonly PrimitiveEvent[], ctx: SummaryContext): string | undefined {
  const sr = events.findIndex((e) => e.t === "turnAdvance" && e.round === "SR");
  const exported = events
    .slice(0, sr < 0 ? events.length : sr)
    .filter((e) => e.t === "assetTransfer" && e.from === "bank" && e.to === "removed" && e.asset.startsWith("train:"));
  const first = exported[0];
  if (first?.t !== "assetTransfer") return undefined;
  const type = first.asset.split(":")[1] ?? "";
  const display = ctx.game.trains.find((t) => t.type === type)?.displayName ?? type;
  const after = events.slice(sr < 0 ? events.length : sr);
  const phase = after.find((e) => e.t === "turnAdvance" && e.phase !== undefined && e.round === undefined);
  const rusted = new Set<string>();
  for (const e of after) {
    if (e.t === "assetTransfer" && e.to === "removed" && e.asset.startsWith("train:")) rusted.add(e.asset.split(":")[1] ?? "");
    if (e.t === "counterChange" && e.key.startsWith(RUSTED) && e.delta > 0) rusted.add(e.key.split(":")[2] ?? "");
  }
  const what = exported.length === 1 ? display : `${exported.length} × ${display}`;
  const into = phase?.t === "turnAdvance" && phase.phase ? ` → ${phaseName(ctx.game, phase.phase).toLocaleLowerCase("en")} phase` : "";
  const rust = rusted.size > 0 ? `; the ${[...rusted].join(", ")} rust` : "";
  return `Exported: ${what}${into}${rust}`;
}

/** Feature 014: English domain text. */
const COLOR_NAMES: Readonly<Record<string, string>> = {
  "#2e7d32": "green",
  "#c62828": "red",
  "#212121": "black",
  "#1565c0": "blue",
  "#f5f5f5": "white",
};

const chipColor = (color: string): string | undefined => COLOR_NAMES[color.toLowerCase()];

/** "Missing 8 green chips (500), 1 red (100)", or "worth {value}" for a color outside the defaults. */
function missingChips(missing: readonly MissingChips[]): string | null {
  if (missing.length === 0) return null;
  const parts = missing.map(({ value, count, color }, i) => {
    const name = color === undefined ? undefined : chipColor(color);
    const noun = i === 0 ? (count === 1 ? " chip" : " chips") : "";
    return name === undefined ? `${count}${noun} worth ${value}` : `${count} ${name}${noun} (${value})`;
  });
  return `Missing ${parts.join(", ")}`;
}

export const domain: DomainText = {
  lang: "en",
  holderName,
  status: statusLabel,
  roundLabel,
  cycleRoundLabel,
  roundTitle,
  phaseName,
  trainsLine,
  trainsHead,
  endTriggerLabels: END_TRIGGER_LABELS,
  endConditions,
  counterLabels: COUNTER_LABELS,
  summary,
  proposalSummary,
  effects,
  undone,
  movementLine,
  balanceLine,
  exportInfo,
  income: INCOME,
  undoRange: UNDO_RANGE,
  gameEnd: GAME_END,
  systemNotes: { gameOver: "Game over", gameReopened: "Game reopened" },
  setup: "Setup",
  chipColor,
  missingChips,
};
