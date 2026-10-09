import { z } from "zod";
import { AVAILABLE, unavailable, warning, type ActionContext } from "../../actions/context";
import { payWarnings } from "../../actions/expand/manual";
import { companyTarget, requireCompany } from "../../actions/resolve";
import type { ActionOf, Warning } from "../../actions/schemas";
import type { PrimitiveEvent } from "../../events/types";
import { parseHolder, type AssetId, type HolderRef } from "../../types";
import { moveTarget } from "../market";
import { phaseReached } from "../phases";
import type { Mechanic } from "./mechanic";

const loanNumber = (asset: AssetId) => Number(asset.split(":")[1] ?? 0);

function markersWith(ctx: ActionContext, holder: HolderRef): AssetId[] {
  return Object.entries(ctx.state.assets)
    .filter(([asset, h]) => h === holder && asset.startsWith("loan:"))
    .map(([asset]) => asset)
    .sort((a, b) => loanNumber(a) - loanNumber(b));
}

/**
 * takeLoan (FR-112, 1848 §5.6). Each loan: `amount` from the lender plus its lowest loan marker,
 * the company's price left `first` (or `subsequentInOR` for each later loan in the same OR),
 * and the national company's track one step up. There is no repay action and no interest:
 * those LoanDef fields are data only in v1 (constitution VII).
 */
function expandLoan(ctx: ActionContext, a: ActionOf<"takeLoan">): PrimitiveEvent[] {
  const loans = ctx.game.loans;
  if (!loans) return [];
  const company = requireCompany(ctx, a.company);
  const treasury: HolderRef = `company:${company}`;
  const lender = loans.lender as HolderRef;
  const available = markersWith(ctx, lender);
  const taken = available.slice(0, a.count);
  const lenderHolder = parseHolder(lender);
  const national = lenderHolder.kind === "company" && ctx.game.market.tracks?.[lenderHolder.id] ? lenderHolder.id : undefined;
  const issuedBefore = loans.supply - available.length;
  const earlierThisOR = ctx.state.turn.loansThisOR[company] ?? 0;

  const events: PrimitiveEvent[] = [];
  let position = ctx.state.companies[company]?.position;
  taken.forEach((marker, i) => {
    events.push({ t: "moneyTransfer", from: lender, to: treasury, amount: loans.amount });
    events.push({ t: "assetTransfer", asset: marker, from: lender, to: treasury });
    const steps = earlierThisOR + i === 0 ? loans.marketEffect.first : loans.marketEffect.subsequentInOR;
    const target = moveTarget(ctx.game, position, "left", steps);
    if (target) {
      events.push({ t: "marketMove", company, to: target, reason: "loan" });
      position = target;
    }
    if (national && loans.marketEffect.nationalTrackStep) {
      const index = issuedBefore + (i + 1) * loans.marketEffect.nationalTrackStep;
      events.push({ t: "marketMove", company: national, to: { index }, reason: "loan" });
    }
  });
  return events;
}

/** 1848 loans (FR-112). Terms live in `game.loans`; this mechanic adds the loan actions. */
export const loans: Mechanic<Record<string, never>> = {
  id: "loans",
  configSchema: z.object({}).strict(),
  handlers: {
    takeLoan: {
      available: (ctx, a) => {
        const def = ctx.game.loans;
        if (!def) return unavailable("Este juego no tiene préstamos");
        if (!phaseReached(ctx.game, ctx.state, def.availableFromPhase)) {
          return unavailable(`Los préstamos empiezan en la fase ${def.availableFromPhase}`);
        }
        const target = companyTarget(ctx, a?.company);
        if (!target.ok) return target;
        if (markersWith(ctx, def.lender as HolderRef).length === 0) return unavailable("No quedan préstamos");
        return AVAILABLE;
      },
      validate: (ctx, a) => {
        const def = ctx.game.loans;
        if (!def) return [];
        const company = requireCompany(ctx, a.company);
        const warnings: Warning[] = [];
        const held = markersWith(ctx, `company:${company}`).length;
        if (held + a.count > def.voluntaryLimit) {
          warnings.push(
            warning("loanLimit", `Tendría ${held + a.count} préstamos; el límite voluntario es ${def.voluntaryLimit}.`),
          );
        }
        const left = markersWith(ctx, def.lender as HolderRef).length;
        if (left < a.count) warnings.push(warning("loanSupply", `Solo quedan ${left} préstamos.`));
        warnings.push(...payWarnings(ctx, def.lender as HolderRef, def.amount * Math.min(left, a.count)));
        return warnings;
      },
      expand: expandLoan,
    },
  },
};
