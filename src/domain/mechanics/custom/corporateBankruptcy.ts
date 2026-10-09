import { z } from "zod";
import type { Trigger } from "../../actions/context";
import { cashOf, presidencyHolder, type SessionState } from "../../events/state";
import type { PrimitiveEvent } from "../../events/types";
import type { GameDefinition } from "../../games/schema";
import { assetKind, type CompanyId, type HolderRef, type PlayerId } from "../../types";
import { cellTagsAt } from "../market";
import { mechanicConfigOf } from "./config";
import type { Mechanic } from "./mechanic";

export const CorporateBankruptcyConfig = z.object({
  trigger: z.enum(["closedCell", "manual"]),
  endsGame: z.boolean().optional(),
});
export type CorporateBankruptcyConfig = z.infer<typeof CorporateBankruptcyConfig>;

function moveAllShares(
  game: GameDefinition,
  state: SessionState,
  from: HolderRef,
  to: HolderRef,
  only?: CompanyId,
): PrimitiveEvent[] {
  const events: PrimitiveEvent[] = [];
  for (const c of game.companies) {
    if (only !== undefined && c.id !== only) continue;
    const units = state.holdings[from]?.[c.id] ?? 0;
    if (units <= 0) continue;
    events.push({
      t: "shareTransfer",
      company: c.id,
      from,
      to,
      units,
      ...(presidencyHolder(state, c.id) === from ? { presidency: true } : {}),
    });
  }
  return events;
}

function moveAssets(state: SessionState, from: HolderRef, kinds: readonly string[]): PrimitiveEvent[] {
  return Object.entries(state.assets)
    .filter(([asset, holder]) => holder === from && kinds.includes(assetKind(asset)))
    .map(([asset]): PrimitiveEvent => ({ t: "assetTransfer", asset, from, to: "removed" }));
}

/**
 * 21Moon §12 company bankruptcy: its shares leave the game, the treasury goes to the Bank, the
 * shares it holds go to the pool, and its assets are removed.
 */
export function companyBankruptcyEvents(game: GameDefinition, state: SessionState, company: CompanyId): PrimitiveEvent[] {
  const treasury: HolderRef = `company:${company}`;
  const events: PrimitiveEvent[] = [];
  for (const holder of Object.keys(state.holdings) as HolderRef[]) {
    if (holder === "removed") continue;
    events.push(...moveAllShares(game, state, holder, "removed", company));
  }
  const cash = cashOf(state, treasury);
  if (cash > 0) events.push({ t: "moneyTransfer", from: treasury, to: "bank", amount: cash });
  for (const c of game.companies) {
    if (c.id === company) continue;
    events.push(...moveAllShares(game, state, treasury, "pool", c.id));
  }
  events.push(...moveAssets(state, treasury, ["train", "private", "loan"]));
  events.push({ t: "companyStatus", company, status: "bankrupt" });
  return events;
}

/**
 * Player bankruptcy (21Moon §11.8.1, 1830 Classic C-2.5): money to the Bank, shares to the pool,
 * privates removed, and the player marked bankrupt.
 */
export function playerBankruptcyEvents(game: GameDefinition, state: SessionState, player: PlayerId): PrimitiveEvent[] {
  const ref: HolderRef = `player:${player}`;
  const events: PrimitiveEvent[] = [];
  const cash = cashOf(state, ref);
  if (cash > 0) events.push({ t: "moneyTransfer", from: ref, to: "bank", amount: cash });
  events.push(...moveAllShares(game, state, ref, "pool"));
  events.push(...moveAssets(state, ref, ["private"]));
  events.push({ t: "counterChange", subject: ref, key: "bankrupt", delta: 1 });
  return events;
}

/** §12: a price entering the Closed cell bankrupts the company. */
const cellTrigger: Trigger = (ctx) => {
  const cfg = mechanicConfigOf(ctx.game, "corporateBankruptcy", CorporateBankruptcyConfig);
  if (cfg?.trigger !== "closedCell") return [];
  for (const e of ctx.events) {
    if (e.t !== "marketMove" || !cellTagsAt(ctx.game, e.to).includes("closed")) continue;
    if (ctx.state.companies[e.company]?.status === "bankrupt") continue;
    return companyBankruptcyEvents(ctx.game, ctx.state, e.company);
  }
  return [];
};

/** 21Moon §12 and the 1830 Classic game end. */
export const corporateBankruptcy: Mechanic<CorporateBankruptcyConfig> = {
  id: "corporateBankruptcy",
  configSchema: CorporateBankruptcyConfig,
  triggers: [cellTrigger],
  hooks: {
    /**
     * 1830 Classic forced purchase: the president makes up the difference from their own cash;
     * if that is not enough, they must sell shares or go bankrupt (C-2.3–2.5). The app records
     * what they pay and warns; the table decides on the bankruptcy.
     */
    trainShortfall: (ctx, company, shortfall) => {
      const cfg = mechanicConfigOf(ctx.game, "corporateBankruptcy", CorporateBankruptcyConfig);
      if (cfg?.trigger !== "manual") return undefined;
      const president = ctx.state.presidency[company];
      if (!president?.startsWith("player:")) return undefined;
      const paid = Math.min(shortfall, Math.max(0, cashOf(ctx.state, president)));
      const events: PrimitiveEvent[] =
        paid > 0 ? [{ t: "moneyTransfer", from: president, to: `company:${company}`, amount: paid }] : [];
      const warnings =
        paid < shortfall
          ? [
              {
                code: "presidentShort",
                messageEs: "Al presidente no le alcanza: debe vender acciones o declararse en quiebra.",
                severity: "warn" as const,
              },
            ]
          : [{ code: "forcedPurchase", messageEs: "Compra forzada: el presidente pone la diferencia.", severity: "info" as const }];
      return { events, warnings };
    },
  },
};
