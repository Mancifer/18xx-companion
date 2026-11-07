import type { ActionContext } from "../../domain/actions/context";
import type { Action } from "../../domain/actions/schemas";
import type { SessionState, TurnState } from "../../domain/events/state";
import type { CompanyStatus, PrimitiveEvent } from "../../domain/events/types";
import type { EndTriggerType, GameDefinition } from "../../domain/games/schema";
import type { BalanceChange, Movement } from "../../domain/ledger/breakdown";
import type { ExportPreview } from "../../domain/mechanics/schedule";
import type { CompanyId, HolderRef, Player } from "../../domain/types";
import type { Lang } from "../lang";
import type { FlowMessages } from "./messages/flow";
import type { GameMessages } from "./messages/game";
import type { ImportMessages } from "./messages/import";
import type { MechanicsMessages } from "./messages/mechanics";
import type { OperatingMessages } from "./messages/operating";
import type { StockMessages } from "./messages/stock";
import type { StoreMessages } from "./messages/store";
import type { VoiceMessages } from "./messages/voice";

/**
 * Feature 014 (data-model §4, contracts/catalogs.md): what every language provides for domain
 * text. The contract owns the message codes, so a language can't add or drop one.
 */

export type MessageParamValue = string | number;
export type MessageParamsRecord = Readonly<Record<string, MessageParamValue>>;

/** A domain message as data: rendered in the display language when shown. */
export interface Message {
  readonly code: string;
  readonly params?: MessageParamsRecord;
  /**
   * A message this one wraps ("Acción 2: …"), rendered first and passed in as the `reason`
   * param. Only on messages that are never stored (availability reasons).
   */
  readonly inner?: Message;
}

/** What a message needs to resolve names: the game, the players and, when known, the state. */
export interface MessageContext {
  readonly game: GameDefinition;
  readonly players: readonly Player[];
  readonly state?: SessionState;
}

/** Every area's codes, merged. */
export type MessageParamMap = StockMessages &
  OperatingMessages &
  FlowMessages &
  MechanicsMessages &
  GameMessages &
  StoreMessages &
  ImportMessages &
  VoiceMessages;

export type MessageCode = keyof MessageParamMap;
export type MessageParams<C extends MessageCode> = MessageParamMap[C];

/** One language's text for one area: a function per code of that area. */
export type AreaText<Area> = { readonly [C in keyof Area]: (params: Area[C], ctx: MessageContext) => string };

/** One language's text for every message. */
export type MessageText = AreaText<MessageParamMap>;

/** A typed message for a known code. */
export function message<C extends MessageCode>(code: C, params: MessageParams<C>): Message {
  const p = params as unknown as MessageParamsRecord;
  return Object.keys(p).length > 0 ? { code, params: p } : { code };
}

/** Codes whose text wraps another message, given to them as `reason`. */
export type WrappingCode = { [C in MessageCode]: MessageParams<C> extends { readonly reason: string } ? C : never }[MessageCode];

/** A message wrapping another one: the inner message is rendered as this one's `reason`. */
export function messageWith<C extends WrappingCode>(code: C, params: Omit<MessageParams<C>, "reason">, inner: Message): Message {
  const p = params as unknown as MessageParamsRecord;
  return Object.keys(p).length > 0 ? { code, params: p, inner } : { code, inner };
}

/**
 * `marks`: company names come wrapped as mentions, for the screens that render them as badges
 * (feature 013). Without it the text is plain, as voice, exports and labels need it.
 */
export type SummaryContext = Pick<ActionContext, "game" | "players"> &
  Partial<Pick<ActionContext, "state">> & { readonly marks?: true };

/** A group as the undo toast and History read it. */
export interface Summarized {
  readonly action: Action;
  readonly events: readonly PrimitiveEvent[];
}

export type TurnLabelInput = Pick<TurnState, "round" | "srNumber" | "orSet" | "orIndex" | "orsInSet">;

/** The OR income summary (feature 012). Money comes formatted. */
export interface IncomeText {
  readonly title: string;
  readonly take: (money: string) => string;
  readonly pay: (money: string) => string;
  readonly none: string;
  readonly allSettled: string;
  readonly out: string;
  readonly rule: string;
  readonly since: (or: string) => string;
  readonly startCash: string;
  readonly cashNow: string;
  readonly orHeading: (set: number, index: number) => string;
}

/** The "undo back to here" confirmation (feature 010). */
export interface UndoRangeText {
  readonly title: (count: number) => string;
  readonly from: (summary: string) => string;
  readonly to: (summary: string) => string;
  readonly note: string;
  readonly confirm: (count: number) => string;
  readonly cancel: string;
  readonly undoBackToHere: string;
}

export interface GameEndText {
  readonly noEndCondition: string;
  readonly alreadyEnded: string;
  readonly notEnded: string;
}

export type SystemNoteKey = "gameOver" | "gameReopened";

/** One language's domain text: labels and the sentences built from actions and events. */
export interface DomainText {
  readonly lang: Lang;
  readonly holderName: (holder: HolderRef, game: GameDefinition, players: readonly Player[]) => string;
  readonly status: Readonly<Record<CompanyStatus, string>>;
  /** "SR 3", "OR 2.1", "Privates". */
  readonly roundLabel: (turn: Pick<TurnState, "round" | "srNumber" | "orSet" | "orIndex">) => string;
  /** "Cycle 2 of 6 · OR 1/2"; undefined for games not played in cycles. */
  readonly cycleRoundLabel: (game: GameDefinition, turn: Pick<TurnState, "round" | "srNumber" | "orIndex" | "orsInSet">) => string | undefined;
  /** History's section title: "Operating Round 2.1". */
  readonly roundTitle: (game: GameDefinition, turn: TurnLabelInput) => string;
  /** The phase's display name ("Green"), else its id. */
  readonly phaseName: (game: GameDefinition, id: string) => string;
  /** "Trains 2/4 · 2, 3", "No trains", "· over the limit". */
  readonly trainsLine: (game: GameDefinition, state: SessionState, company: CompanyId) => { text: string; warn: boolean };
  /** "Trains 2/4", or "Trains 2" when the phase has no limit. */
  readonly trainsHead: (count: number, limit: number) => string;
  readonly endTriggerLabels: Readonly<Record<EndTriggerType, string>>;
  /** "(bank broken, bankruptcy)" or "(no end condition)". */
  readonly endConditions: (triggers: readonly EndTriggerType[]) => string;
  readonly counterLabels: Readonly<Record<string, string>>;
  readonly summary: (action: Action, ctx: SummaryContext, events?: readonly PrimitiveEvent[]) => string;
  readonly proposalSummary: (action: Action, ctx: SummaryContext, events?: readonly PrimitiveEvent[]) => string;
  readonly effects: (events: readonly PrimitiveEvent[], ctx: SummaryContext) => string[];
  readonly undone: (groups: readonly Summarized[], ctx: SummaryContext) => string;
  readonly movementLine: (m: Movement, ctx: SummaryContext) => string | undefined;
  readonly balanceLine: (b: BalanceChange, ctx: SummaryContext) => string;
  readonly exportInfo: (preview: ExportPreview, game?: GameDefinition) => string;
  readonly income: IncomeText;
  readonly undoRange: UndoRangeText;
  readonly gameEnd: GameEndText;
  readonly systemNotes: Readonly<Record<SystemNoteKey, string>>;
  /** History's first section, before the game starts. */
  readonly setup: string;
  /** A default chip color's name ("verde", "green"); undefined for any other color. */
  readonly chipColor: (color: string) => string | undefined;
  /** "Faltan 8 fichas verdes (500), 1 roja (100)"; null when nothing is missing. */
  readonly missingChips: (missing: readonly MissingChips[]) => string | null;
}

/** Chips of one value the table lacks; `color` is the set's color for that value. */
export interface MissingChips {
  readonly value: number;
  readonly count: number;
  readonly color: string | undefined;
}
