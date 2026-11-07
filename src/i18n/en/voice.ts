import { assetsHeldBy, cashOf, holdersOf, isPlayerBankrupt, presidentOf, unitsOf } from "../../domain/events/state";
import { isSetup } from "../../domain/ledger/undo";
import { enabledMechanics } from "../../domain/mechanics/custom";
import { priceOf } from "../../domain/mechanics/market";
import { trainsHeldBy } from "../../domain/mechanics/phases";
import { trainTypeOf, type CompanyId, type HolderRef, type PlayerId } from "../../domain/types";
import type { QueryContext, VoiceText } from "../contract/voice";
import { formatMoney } from "../format";
import { gameText } from "../gameText";
import { domain } from "./domain";

/**
 * Feature 014 (contracts/voice.md): the English voice text. The same instructions as the Spanish
 * prompt, in the same order; the same tools with English descriptions; the same snapshot lines.
 */

const RECENT_ENTRIES = 15;

const systemPrompt: VoiceText["systemPrompt"] = ({ game, players }) => {
  const lines: string[] = [];
  lines.push(
    "You interpret spoken commands for an app that keeps the money of an 18xx game.",
    "You get the transcript of what a player said (in English, with speech-recognition errors) and a snapshot of the state.",
    "ALWAYS answer by calling at least one tool. Don't write text for the user: the app ignores your text.",
    "- A game command: call that action's tool. If the sentence has several commands (\"buy a 4 and pay 290\"), call several tools in the order said.",
    "- A question about the state: call query; the app answers with its own data.",
    "- If it's ambiguous (two similar players, the company or the amount is missing): call askClarification with 2 to 6 options; value is the id.",
    "- If it isn't a game command, or no tool expresses it: call notUnderstood. Don't guess.",
    "- \"undo\" → undo (groupId null); \"undo back to X\" → undo with X's id; \"no, it was 260\" → amendLast. \"yes\" / \"confirm\" with a proposal on screen → confirmProposal.",
    "Numbers: understand digits and words (\"two hundred forty\" = 240). Amounts are whole numbers in the game's currency.",
    "company null means the company operating now; use it when no other is named.",
    "",
    `Game: ${game.name}. Currency: ${game.currency.symbol}.`,
  );
  const part = (id: string) => gameText(game, "en").revenuePart(id);
  if (game.revenueParts.length > 1) {
    lines.push(`Revenue in parts: ${game.revenueParts.map((p) => `${p.id} = ${part(p.id)}`).join(", ")}. There is no payout choice (mode null).`);
  } else {
    lines.push(`Allowed payout modes: ${game.payoutModes.join(", ")}.`);
  }
  const mechanics = enabledMechanics(game).map((m) => m.id);
  if (mechanics.length > 0) lines.push(`Special rules in play: ${mechanics.join(", ")}.`);
  if (mechanics.includes("auctionLaunch")) {
    lines.push("\"open X for N\" = launchCompany in games launched by auction (not parCompany): N is the bid.");
  }
  if (game.defaultBuySource === "treasury") {
    lines.push(
      "buyShare with no source said = source treasury (the company's treasury); this game has no IPO to buy from. In share purchases, \"from the bank\" / \"from the pool\" = source pool.",
    );
  } else {
    lines.push("buyShare with no source said = source ipo; in share purchases, \"from the bank\" / \"from the pool\" = source pool.");
  }
  if (game.loans) lines.push(`Loans of ${formatMoney(game.loans.amount, game, "en")}, with no interest and no repayment.`);
  lines.push(`Trains: ${game.trains.map((t) => t.variants.map((v) => `${v.name} ${formatMoney(v.cost, game, "en")}`).join(" / ")).join("; ")}.`);
  lines.push(`Privates: ${game.privates.map((p) => `${p.id} = ${p.name}${p.aliases.length ? ` (${p.aliases.join(", ")})` : ""}`).join("; ")}.`);
  lines.push("", "Players (id = name; aliases):");
  for (const p of [...players].sort((a, b) => a.seat - b.seat)) {
    lines.push(`- ${p.id} = ${p.name}${p.aliases.length ? `; ${p.aliases.join(", ")}` : ""}`);
  }
  lines.push("", "Companies (id = name; aliases):");
  for (const c of game.companies) {
    const alt = c.altName ? ` (second identity: ${c.altName}${c.altAliases?.length ? `; ${c.altAliases.join(", ")}` : ""} → identity alt)` : "";
    lines.push(`- ${c.id} = ${c.name}${alt}${c.aliases.length ? `; ${c.aliases.join(", ")}` : ""}`);
  }
  return lines.join("\n");
};

const toolDescriptions: VoiceText["toolDescriptions"] = {
  runAndPayout:
    "The operating company's revenue and how it is paid out. company null = the operating one; mode null = pay out. \"240, pays\" · \"withholds 180\" · \"half pays 300\" · \"local 120, port 240\".",
  buyTrain:
    "A company buys a train: from the bank, from the pool or from another company (at an agreed price). \"buys a three\" · \"the Pennsy buys the 4 from the B&O for 300\" · \"diesel trading in the four\".",
  payCost: "The company pays a cost to the bank (terrain, station, token). \"pays 120 for a mountain\" · \"80 for a station\".",
  bankPays: "The bank pays a company a one-off amount. \"the bank pays VH 60 for the bridge\".",
  privateIncome: "Pay the privates' income to their owners. \"privates pay out\" · \"private income\".",
  buyPrivateByCompany: "A company buys a private from its owner. \"the PRR buys the Delaware for 140\".",
  takeLoan: "A company takes loans (no interest, never repaid). \"Victoria takes a loan\" · \"two loans\".",
  nationalPayout: "The national bank's dividend: the phase minimum plus the city extra. \"the Bank of England pays 40 extra\".",
  parCompany: "A player pars a company at a par price. \"Ana pars the NYC at 82\" · \"Bruno starts the Erie at 90\".",
  buyShare:
    "Buy shares from the IPO, the pool or the treasury. count null = 1. \"Bruno buys a B&O from the pool\" · \"Carla buys two PRR from the IPO\".",
  sellShares: "Sell shares to the pool. \"Carla sells two Erie\" · \"Ana sells one NYC\".",
  swapCertificates: "The president swaps a certificate with the treasury, with no money. \"Ana swaps a VH for an SSF from the treasury\".",
  issueShares:
    "The company issues shares to the pool and collects their price (in the corporate round, or while operating if the game allows it). \"VH issues one\" · \"issues two\" · \"issues a share\".",
  redeemShare: "The company buys back one of its shares from the pool at the current price. company null = the operating one. \"redeems a share\" · \"Express redeems one\".",
  launchCompany:
    "The auction winner opens a minor: the whole bid goes to its treasury; price null = half the bid (the app adjusts it). \"Ana opens Tunneling for 140\" · \"Bruno launches Express at 165\".",
  mergeCompanies:
    "Merger round: two minors merge into an unstarted corporation. identity alt = its second identity (if that name is said). \"Express and Tunneling merge into Union\" · \"… into Conglomerate\" (Consortium, alt).",
  startMR: "The merger round starts (after the second operating round, from the green phase). \"merger round\".",
  forcedTrainPurchase:
    "Forced purchase: the company has no train and not enough money; the president puts in the difference, selling shares if needed (sales). \"forced purchase of a 4, Ana sells two Express\".",
  namedPayment:
    "Money from a company ability (Tunneling: mountain; Expansive: extra token; Headquarters). amount null = the ability's amount. \"tunnel bonus\" · \"Expansive's extra token\" · \"headquarters, 40\".",
  rockFormation: "Rock formation (Landmarks): the company's share moves up two cells, before the payout. company null = the operating one. \"rock formation\".",
  cliffSale:
    "Cliff (Landmarks): the company sells a train to the bank for half its printed price; the train goes to the pool. train = type. \"sells the 5 at the cliff\".",
  canyonTrain: "Canyon (Landmarks): the company gets a rusted 2 that no longer rusts. company null = the operating one. \"canyon train\".",
  buyPrivate: "A player buys a private at the price paid. \"Ana buys the Camden for 160\".",
  exchangePrivate: "Exchange a private for a share, closing it. \"Dani exchanges the Mohawk for an NYC\".",
  stockBatch:
    "Several stock-round buys and sales at once, in the order said. \"Ana bought two PRR, Bruno sold three B&O\".",
  startSR: "The stock round starts. \"start the stock round\".",
  endSR: "The stock round ends. \"end of the stock round\".",
  startCR: "The corporate round starts. \"corporate round\".",
  endCR: "The corporate round ends. \"end of the corporate round\".",
  startOR: "An operating round starts. \"start the operating round\" · \"next OR\".",
  nextCompany: "Moves on to the next company. \"next company\" · \"next\".",
  endGame: "End the game. No arguments.",
  transferMoney: "A direct payment between the bank, players and companies. \"Ana pays Bruno 50\" · \"Carla pays 100 to the bank\".",
  adjustMoney: "Correct someone's money: add/subtract (delta) or set it (setTo). \"Ana has 520\" · \"add 20 to Bruno\".",
  correctTrain:
    "Correct a company's trains after a recording mistake (not a purchase or a discard). remove: the train goes to the supply (bank, with the list price refunded unless amount), to the pool or out of the game (removed). add: give a train from the supply (amount = what it pays, null = nothing). \"the PRR didn't have that two, give it back to the bank\" · \"take the three off the B&O, out of the game\" · \"give the NYC a two for free\".",
  setMarket: "Move a company's token on the market by hand. \"put the PRR at 90\".",
  askClarification:
    "Ask the user when the command is ambiguous (two similar players, the company is missing). Give 2 to 6 options. \"Ana buys one\" (Ana or Anabel? which company?).",
  query: "A question about the state; the app answers with its own data. \"how much does Ana have?\" · \"who is president of the Erie?\" · \"what's the PRR at?\".",
  notUnderstood: "Use it when the sentence isn't a game command or can't be expressed with the tools. \"table chatter\".",
  undo: "Undo. No target (null) = the latest entry. \"undo back to …\" = that entry's id in Latest entries. \"undo\" · \"scratch that\" · \"undo back to the EXP's train purchase\".",
  amendLast: "A request to correct an amount or an earlier entry. The app doesn't correct: it explains how to undo. \"no, it was 260\" · \"sorry, 300\".",
  confirmProposal: "Confirm the proposal on screen. \"yes\" · \"confirm\" · \"OK\".",
};

const snapshot: VoiceText["snapshot"] = (input) => {
  const { game, players, state } = input;
  const money = (n: number) => formatMoney(n, game, "en");
  const lines: string[] = [];
  const current = state.turn.currentCompany;
  const round = domain.cycleRoundLabel(game, state.turn) ?? domain.roundLabel(state.turn);
  lines.push(`Round: ${round}. Phase ${state.turn.phase}.${current ? ` Operating: ${current}.` : ""}`);
  lines.push(`Bank: ${game.bank === "unlimited" ? "unlimited" : money(cashOf(state, "bank"))}.`);
  lines.push("Players:");
  for (const p of [...players].sort((a, b) => a.seat - b.seat)) {
    const ref = `player:${p.id}` as const;
    const held = game.companies
      .filter((c) => unitsOf(state, ref, c.id) > 0)
      .map((c) => `${c.id} ${(unitsOf(state, ref, c.id) * 100) / c.shareCount}%`);
    if (isPlayerBankrupt(state, p.id)) {
      lines.push(`- ${p.name} (${p.id}): out of the game (bankrupt); don't propose actions for them`);
      continue;
    }
    lines.push(`- ${p.name} (${p.id}): ${money(cashOf(state, ref))}${held.length ? `; ${held.join(", ")}` : ""}`);
  }
  lines.push("Companies:");
  for (const c of game.companies) {
    const record = state.companies[c.id];
    if (!record || record.status === "unstarted") continue;
    const price = priceOf(game, state, c.id);
    const trains = assetsHeldBy(state, `company:${c.id}`, "train").map(trainTypeOf);
    const tier = c.tier ? ` (${c.tier})` : "";
    const shares = [
      ["IPO", unitsOf(state, `ipo:${c.id}`, c.id)],
      ["treasury", unitsOf(state, `company:${c.id}`, c.id)],
      ["pool", unitsOf(state, "pool", c.id)],
    ] as const;
    const available = shares.filter(([, n]) => n > 0).map(([where, n]) => `${where} ${n}`);
    lines.push(
      `- ${c.id}${tier}: ${record.status}, treasury ${money(cashOf(state, `company:${c.id}`))}${price !== undefined ? `, price ${money(price)}` : ""}, shares ${available.join(" · ") || "none free"}${trains.length ? `, trains ${trains.join(" ")}` : ""}`,
    );
  }
  const unstarted = (tier: "minor" | "major") =>
    game.companies.filter((c) => c.tier === tier && state.companies[c.id]?.status === "unstarted");
  if (game.companies.some((c) => c.tier !== undefined)) {
    lines.push(`Minors not yet opened: ${unstarted("minor").map((c) => c.id).join(", ") || "none"}.`);
    const majors = unstarted("major").map((c) => `${c.id} (${c.name}${c.altName ? ` / ${c.altName}` : ""})`);
    lines.push(`Corporations not yet opened: ${majors.join(", ") || "none"}.`);
  }
  const onSale = game.trains
    .map((t) => ({ t, left: t.count === "unlimited" ? "∞" : String(trainsHeldBy(state, "bank", t.type).length) }))
    .filter(({ left }) => left !== "0");
  lines.push(`Trains in the bank: ${onSale.map(({ t, left }) => `${t.type} (${money(t.variants[0]?.cost ?? 0)}, ${left} left)`).join(", ")}.`);
  const recent = input.effective.filter((g) => !isSetup(g)).slice(-RECENT_ENTRIES);
  if (recent.length > 0) {
    lines.push("Latest entries (id in brackets, newest last):");
    for (const g of recent) lines.push(`- [${g.id}] ${domain.summary(g.action, { game, players, state })}`);
  }
  lines.push("", `Transcript: "${input.transcript}"`);
  if (input.clarification !== undefined) lines.push(`Clarification chosen: ${input.clarification}`);
  return lines.join("\n");
};

const queryAnswer: VoiceText["queryAnswer"] = (ctx: QueryContext, q) => {
  const { game, players, state } = ctx;
  const money = (n: number) => formatMoney(n, game, "en");
  const playerName = (id: PlayerId) => players.find((p) => p.id === id)?.name ?? id;
  const short = (id: CompanyId) => game.companies.find((c) => c.id === id)?.shortName ?? id;
  const shareCount = (id: CompanyId) => state.companies[id]?.shareCount ?? 10;
  const percent = (units: number, id: CompanyId) => `${(units * 100) / shareCount(id)}%`;
  const askCompany = "Which company?";
  switch (q.kind) {
    case "cash":
      if (q.player) return `${playerName(q.player)} has ${money(cashOf(state, `player:${q.player}`))}`;
      if (q.company) return `${short(q.company)} has ${money(cashOf(state, `company:${q.company}`))} in its treasury`;
      return "Whose?";
    case "treasury":
      if (!q.company) return askCompany;
      return `${short(q.company)} has ${money(cashOf(state, `company:${q.company}`))} in its treasury`;
    case "shares": {
      if (q.player && q.company) {
        const units = unitsOf(state, `player:${q.player}`, q.company);
        return `${playerName(q.player)} has ${units} ${short(q.company)} ${units === 1 ? "share" : "shares"} (${percent(units, q.company)})`;
      }
      if (q.player) {
        const ref: HolderRef = `player:${q.player}`;
        const held = game.companies.filter((c) => unitsOf(state, ref, c.id) > 0);
        if (held.length === 0) return `${playerName(q.player)} has no shares`;
        return `${playerName(q.player)} has: ${held.map((c) => `${c.shortName} ${percent(unitsOf(state, ref, c.id), c.id)}`).join(", ")}`;
      }
      if (q.company) {
        const company = q.company;
        const parts = holdersOf(state, company)
          .filter(([, units]) => units > 0)
          .sort((a, b) => b[1] - a[1] || Number(!a[0].startsWith("player:")) - Number(!b[0].startsWith("player:")))
          .map(([h, units]) => {
            const name = h.startsWith("ipo:") ? "IPO" : h === "pool" ? "pool" : domain.holderName(h, game, players);
            return `${name} ${percent(units, company)}`;
          });
        return `${short(company)}: ${parts.join(", ")}`;
      }
      return "Whose, or which company?";
    }
    case "price": {
      if (!q.company) return askCompany;
      const price = priceOf(game, state, q.company);
      return price === undefined ? `${short(q.company)} has no price yet` : `${short(q.company)} is at ${money(price)}`;
    }
    case "trains": {
      if (q.company) {
        const trains = assetsHeldBy(state, `company:${q.company}`, "train").map(trainTypeOf);
        return trains.length === 0 ? `${short(q.company)} has no trains` : `${short(q.company)} has trains: ${trains.join(", ")}`;
      }
      const onSale = game.trains
        .map((t) => ({ t, left: t.count === "unlimited" ? "∞" : String(trainsHeldBy(state, "bank", t.type).length) }))
        .filter(({ left }) => left !== "0")
        .map(({ t, left }) => `${t.type} (${left} at ${money(t.variants[0]?.cost ?? 0)})`);
      return `In the bank: ${onSale.join(", ")}`;
    }
    case "bank":
      return game.bank === "unlimited" ? "The bank is unlimited" : `The bank has ${money(cashOf(state, "bank"))}`;
    case "president": {
      if (!q.company) return askCompany;
      const president = presidentOf(state, q.company);
      return president ? `${short(q.company)}'s president: ${playerName(president)}` : `${short(q.company)} has no president`;
    }
    case "turn": {
      const current = state.turn.currentCompany;
      return `${domain.roundLabel(state.turn)} · phase ${state.turn.phase}${current ? ` · ${short(current)} operating` : ""}`;
    }
  }
};

export const voice: VoiceText = { lang: "en", systemPrompt, toolDescriptions, snapshot, queryAnswer };
