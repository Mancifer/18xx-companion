import type { CompanyDef } from "../games/schema";
import type { CompanyId } from "../types";
import { AVAILABLE, unavailable, type ActionContext, type AvailabilityResult } from "./context";

/** A null company means the operating company (contracts/actions.md). */
export function resolveCompany(ctx: ActionContext, id: CompanyId | null | undefined): CompanyId | undefined {
  return id ?? ctx.state.turn.currentCompany;
}

export function companyDef(ctx: Pick<ActionContext, "game">, id: CompanyId): CompanyDef | undefined {
  return ctx.game.companies.find((c) => c.id === id);
}

/** Availability of an action aimed at a company (or the operating one when null). */
export function companyTarget(ctx: ActionContext, id: CompanyId | null | undefined): AvailabilityResult {
  const company = resolveCompany(ctx, id);
  if (company === undefined) return unavailable("No hay compañía operando: elige una");
  if (!companyDef(ctx, company)) return unavailable(`Compañía desconocida: ${company}`);
  return AVAILABLE;
}

/** Resolves the company or throws: expanders run only after availability passed. */
export function requireCompany(ctx: ActionContext, id: CompanyId | null | undefined): CompanyId {
  const company = resolveCompany(ctx, id);
  if (company === undefined) throw new Error("No operating company");
  return company;
}

export const CURRENT_COMPANY_ACTIONS: ReadonlySet<string> = new Set(["runAndPayout", "buyTrain", "payCost", "bankPays", "buyPrivateByCompany", "takeLoan"]);

/**
 * Records the operating company instead of null, so History and amends name it explicitly
 * (null means "the company operating now", which changes as the game moves on).
 */
export function withCurrentCompany<A extends { readonly type: string }>(ctx: ActionContext, action: A): A {
  const current = ctx.state.turn.currentCompany;
  if (!current || !CURRENT_COMPANY_ACTIONS.has(action.type)) return action;
  const record = action as unknown as { company?: string | null };
  return record.company === null ? ({ ...action, company: current }) : action;
}
