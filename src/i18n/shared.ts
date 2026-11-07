import { counterOf, type SessionState } from "../domain/events/state";
import type { EventOf, PrimitiveEvent, Round } from "../domain/events/types";
import type { GameDefinition } from "../domain/games/schema";
import { countedTrains, RUSTED, trainLimitFor, trainNumber, trainsHeldBy } from "../domain/mechanics/phases";
import { displayName } from "../domain/mechanics/traits";
import type { ExportPreview } from "../domain/mechanics/schedule";
import { trainTypeOf, type CompanyId } from "../domain/types";
import type { MessageContext, SummaryContext } from "./contract/domain";
import type { FlowMessages } from "./contract/messages/flow";
import { markMention } from "./mentions";

/** Feature 014: the parts of the domain text that are the same in every language. */

/** History's round icons (feature 011, FR-020): text always goes with them. */
export const ROUND_ICON: Readonly<Record<Round | "SETUP", string>> = {
  PRIVATES: "📜",
  SR: "💼",
  OR: "🚂",
  MR: "🔀",
  CR: "🏛",
  SETUP: "⚙",
};

export interface TrainCard {
  readonly asset: string;
  readonly label: string;
  /** Rusted but kept for a last run (RotLA Resourceful): shown, not counted. */
  readonly rusted: boolean;
}

/**
 * A company's trains as cards (feature 013, data-model.md "Train card"): by the definition's
 * order, then the train number, labelled with the type's display name; with the count and limit
 * the over-limit banner uses, so the two never disagree.
 */
export function companyTrains(
  game: GameDefinition,
  state: SessionState,
  company: CompanyId,
): { cards: readonly TrainCard[]; count: number; limit: number; over: boolean } {
  const ref = `company:${company}` as const;
  const order = (asset: string) => game.trains.findIndex((t) => t.type === trainTypeOf(asset));
  const held = trainsHeldBy(state, ref).sort((a, b) => order(a) - order(b) || trainNumber(a) - trainNumber(b));
  const cards = held.map((asset) => {
    const type = trainTypeOf(asset);
    return {
      asset,
      label: game.trains.find((t) => t.type === type)?.displayName ?? type,
      rusted: counterOf(state, ref, `${RUSTED}${asset}`) > 0,
    };
  });
  const count = countedTrains(game, state, company).length;
  const limit = trainLimitFor(game, state, company);
  return { cards, count, limit, over: count > limit };
}

/** A known company's words, marked as a mention when the context asks for it (feature 013). */
export const mention = (id: string, text: string, ctx: SummaryContext) =>
  ctx.marks && ctx.game.companies.some((c) => c.id === id) ? markMention(id, text) : text;
export const companyName = (id: string, ctx: SummaryContext) =>
  mention(id, ctx.game.companies.find((c) => c.id === id)?.shortName ?? id, ctx);
/** The full name; a major merged into its second identity goes by that name (FR-005a). */
export const fullName = (id: string, ctx: SummaryContext) =>
  mention(id, ctx.state ? displayName(ctx.game, ctx.state, id) : (ctx.game.companies.find((c) => c.id === id)?.name ?? id), ctx);

/** The group's only money transfer, if it has exactly one (FR-014). */
export function singleTransfer(events: readonly PrimitiveEvent[] | undefined): EventOf<"moneyTransfer"> | undefined {
  const transfers = (events ?? []).filter((e): e is EventOf<"moneyTransfer"> => e.t === "moneyTransfer");
  return transfers.length === 1 ? transfers[0] : undefined;
}

/** The OR that a nextCompany group started, if it started one (feature 011, data-model §3). */
export function startedOR(events: readonly PrimitiveEvent[] | undefined): EventOf<"turnAdvance"> | undefined {
  const e = events?.find((x) => x.t === "turnAdvance" && x.round === "OR" && x.orSet !== undefined && x.orIndex !== undefined);
  return e?.t === "turnAdvance" ? e : undefined;
}

/** The export preview a stored `export` warning describes, rebuilt from its params. */
export function exportPreviewOf(p: FlowMessages["export"], ctx: MessageContext): ExportPreview {
  return {
    type: p.type,
    displayName: p.displayName,
    count: p.count,
    phase: p.phase === "" ? undefined : ctx.game.phases.find((ph) => ph.id === p.phase),
    rusts: p.rusts === "" ? [] : p.rusts.split(","),
  };
}
