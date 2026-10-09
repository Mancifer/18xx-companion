import { z } from "zod";
import type { PrimitiveEvent } from "./types";

/**
 * Zod mirror of the primitive event vocabulary (contracts/events.md), used to validate imported
 * session files (research R5). The TS union in ./types stays the source of truth.
 */
const holder = z.string().regex(/^(bank|pool|removed|(player|company|ipo):.+)$/);
const cell = z.union([
  z.object({ row: z.number().int(), col: z.number().int() }),
  z.object({ index: z.number().int() }),
]);
const round = z.enum(["PRIVATES", "SR", "CR", "OR"]);

export const PrimitiveEventSchema: z.ZodType<PrimitiveEvent> = z.discriminatedUnion("t", [
  z.object({ t: z.literal("moneyTransfer"), from: holder, to: holder, amount: z.number().int() }),
  z.object({
    t: z.literal("shareTransfer"),
    company: z.string(),
    from: holder,
    to: holder,
    units: z.number().int(),
    presidency: z.boolean().optional(),
  }),
  z.object({
    t: z.literal("marketMove"),
    company: z.string(),
    to: cell,
    reason: z.enum(["payout", "withhold", "half", "sell", "soldOut", "poolPenalty", "issue", "loan", "par", "manual", "receivership"]),
  }),
  z.object({
    t: z.literal("companyStatus"),
    company: z.string(),
    status: z.enum(["unstarted", "parred", "floated", "receivership", "bankrupt", "closed"]),
    parPrice: z.number().int().optional(),
    floatConfirmed: z.boolean().optional(),
    capitalPending: z.boolean().optional(),
  }),
  z.object({ t: z.literal("assetTransfer"), asset: z.string(), from: holder, to: holder }),
  z.object({
    t: z.literal("turnAdvance"),
    round: round.optional(),
    srNumber: z.number().int().optional(),
    scheduleIndex: z.number().int().optional(),
    orSet: z.number().int().optional(),
    orIndex: z.number().int().optional(),
    orsInSet: z.number().int().optional(),
    operatingOrder: z.array(z.string()).optional(),
    company: z.string().nullable().optional(),
    phase: z.string().optional(),
  }),
  z.object({ t: z.literal("counterChange"), subject: holder, key: z.string(), delta: z.number().int() }),
  z.object({ t: z.literal("note"), text: z.string() }),
]) as unknown as z.ZodType<PrimitiveEvent>;
