import type { HolderRef } from "../../../domain/types";
import type { MessageContext } from "../../contract/domain";
import { formatMoney } from "../../format";
import { gameText } from "../../gameText";
import { domain } from "../domain";

/** Shared by the Spanish message modules: names and money resolved at render time. */

export const money = (n: number, ctx: MessageContext) => formatMoney(n, ctx.game, "es");
export const holder = (ref: string, ctx: MessageContext) => domain.holderName(ref as HolderRef, ctx.game, ctx.players);
export const player = (id: string, ctx: MessageContext) => ctx.players.find((p) => p.id === id)?.name ?? id;
export const company = (id: string, ctx: MessageContext) => ctx.game.companies.find((c) => c.id === id)?.shortName ?? id;

/** A company payment's label (RotLA abilities), from the game text, else the definition's own. */
export const paymentLabel = (id: string, ctx: MessageContext) => {
  const own = ctx.game.companies.flatMap((c) => c.traits?.payments ?? []).find((p) => p.id === id)?.labelEs;
  return gameText(ctx.game, "es").payment(id, own);
};
