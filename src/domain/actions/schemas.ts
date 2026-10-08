import { z } from "zod";
import { holdsMoney, holdsShares, isHolderRef, type HolderRef } from "../types";

/**
 * Source of truth for high-level actions (contracts/actions.md). Touch builds these payloads,
 * voice tools are generated from them, and imports validate against them (research R5).
 * Optional fields are nullable: null means "use the default" (the current company, the
 * current price, …). Schemas avoid transforms so they convert cleanly to JSON Schema.
 */

export const money = z.number().int().positive();
export const units = z.number().int().positive();
export const companyId = z.string().min(1);

export const holderRef = z.string().refine(isHolderRef, "invalid holder");

const isMoneyHolder = (h: string): h is HolderRef => isHolderRef(h) && holdsMoney(h);
const isShareHolder = (h: string): h is HolderRef => isHolderRef(h) && holdsShares(h);
const isPlayerOrCompany = (h: string): h is HolderRef => /^(player|company):.+$/.test(h);

/** The bank, a player or a company treasury: the only holders of money. */
export const moneyHolderRef = z.string().refine(isMoneyHolder, "only the bank, players and companies hold money");
/** Any holder except the bank. */
export const shareHolderRef = z.string().refine(isShareHolder, "the bank does not hold shares");
export const playerOrCompanyRef = z.string().refine(isPlayerOrCompany, "a player or a company");

export const WarningSchema = z.object({
  code: z.string(),
  messageEs: z.string(),
  severity: z.enum(["info", "warn"]),
});
export type Warning = z.infer<typeof WarningSchema>;

export const PlayerSchema = z.object({
  id: z.string().regex(/^p[1-7]$/, "player ids are p1..p7"),
  name: z.string().trim().min(1),
  aliases: z.array(z.string()),
  color: z.string().min(1),
  seat: z.number().int().positive(),
});

// ---------------------------------------------------------------------------------------------
// Setup and manual actions (US1)

export const createSessionAction = z
  .object({
    type: z.literal("createSession"),
    players: z.array(PlayerSchema).min(1).max(7, "at most 7 players"),
    walletMode: z.enum(["appTruth", "bankOnly"]),
  })
  .superRefine((a, ctx) => {
    const names = a.players.map((p) => p.name.trim().toLocaleLowerCase("es"));
    if (new Set(names).size !== names.length) ctx.addIssue({ code: "custom", message: "player names must be unique" });
    const ids = a.players.map((p) => p.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "player ids must be unique" });
    const seats = a.players.map((p) => p.seat).sort((x, y) => x - y);
    if (!seats.every((s, i) => s === i + 1)) {
      ctx.addIssue({ code: "custom", message: "seat order must be a permutation of 1..n" });
    }
  });

export const transferMoneyAction = z.object({
  type: z.literal("transferMoney"),
  from: moneyHolderRef,
  to: moneyHolderRef,
  amount: money,
});

export const adjustMoneyAction = z
  .object({
    type: z.literal("adjustMoney"),
    holder: playerOrCompanyRef,
    delta: z.number().int().nullable(),
    setTo: z.number().int().nullable(),
  })
  .refine((a) => (a.delta === null) !== (a.setTo === null), "give exactly one of delta or setTo");

export const transferSharesAction = z.object({
  type: z.literal("transferShares"),
  company: companyId,
  from: shareHolderRef,
  to: shareHolderRef,
  units,
  presidency: z.boolean().nullable(),
});

export const noteAction = z.object({ type: z.literal("note"), text: z.string().min(1) });

/** All actions that go through the pipeline. Later stories extend this union. */
export const ActionSchema = z.discriminatedUnion("type", [
  createSessionAction,
  transferMoneyAction,
  adjustMoneyAction,
  transferSharesAction,
  noteAction,
]);

export type Action = z.infer<typeof ActionSchema>;
export type ActionType = Action["type"];
export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>;

/** Ledger operations: handled by the store, not expanded into events. */
export const undoAction = z.object({ type: z.literal("undo"), groupId: z.string().nullable() });
export type UndoAction = z.infer<typeof undoAction>;
