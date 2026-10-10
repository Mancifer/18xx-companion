import type { SessionState } from "../events/state";
import type { GameDefinition } from "../games/schema";
import { holdsAsset, holdsMoney, parseHolder, type HolderRef } from "../types";

/** data-model §11. Checked after every reduce; surfaced, never corrected (constitution II). */
export type InvariantKind = "money" | "moneyHolder" | "shares" | "negativeUnits" | "assetHolder" | "loanSupply";

export interface InvariantViolation {
  readonly kind: InvariantKind;
  readonly detail: string;
}

export interface InvariantWarning extends InvariantViolation {
  readonly firstBadGroupId: string;
}

export function expectedMoneyTotal(game: GameDefinition): number | null {
  if (game.bank === "unlimited") return null;
  return game.bank.total + game.initialTreasuries.reduce((sum, t) => sum + t.money, 0);
}

export function checkInvariants(game: GameDefinition, state: SessionState): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  // 1. Money. Negative balances are allowed (bank broken, short companies) and not flagged.
  let total = 0;
  // Every holder counts toward the total (transfers conserve it); money sitting in a holder that
  // cannot hold money is reported on its own.
  for (const [holder, amount] of Object.entries(state.money)) {
    total += amount;
    if (!holdsMoney(holder as HolderRef) && amount !== 0) {
      violations.push({ kind: "moneyHolder", detail: `${holder} holds ${amount}` });
    }
  }
  const expected = expectedMoneyTotal(game);
  if (expected !== null && total !== expected) {
    violations.push({ kind: "money", detail: `total ${total} ≠ ${expected}` });
  }

  // 2. Shares, and 4. no negative units: one pass over the holdings (games with many companies
  // and holders, such as RotLA, replay this after every group).
  const totals = new Map<string, number>();
  const negative = new Map<string, InvariantViolation[]>();
  for (const holder in state.holdings) {
    const byCompany = state.holdings[holder] ?? {};
    for (const company in byCompany) {
      const u = byCompany[company] ?? 0;
      totals.set(company, (totals.get(company) ?? 0) + u);
      if (u < 0) negative.set(company, [...(negative.get(company) ?? []), { kind: "negativeUnits", detail: `${holder} holds ${u} ${company}` }]);
    }
  }
  for (const [company, record] of Object.entries(state.companies)) {
    violations.push(...(negative.get(company) ?? []));
    const units = totals.get(company) ?? 0;
    if (units !== record.shareCount) {
      violations.push({ kind: "shares", detail: `${company}: ${units} units ≠ ${record.shareCount}` });
    }
  }

  // 3. Assets: one holder each (guaranteed by the map), a holder that may hold it, and a
  //    conserved loan supply.
  let loans = 0;
  for (const asset in state.assets) {
    const holder = state.assets[asset];
    // The bank and `removed` may hold any asset (most of a long game's trains end up removed).
    if (holder !== undefined && holder !== "removed" && holder !== "bank" && !holdsAsset(holder, asset)) {
      violations.push({ kind: "assetHolder", detail: `${asset} held by ${parseHolder(holder).kind}` });
    }
    if (asset.startsWith("loan:")) loans += 1;
  }
  if (game.loans && loans !== game.loans.supply) {
    violations.push({ kind: "loanSupply", detail: `${loans} loan markers ≠ ${game.loans.supply}` });
  }

  return violations;
}
