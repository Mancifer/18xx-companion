import { getMechanic, isMechanicId } from "../mechanics/custom";
import { GameDefinitionSchema, type GameDefinition } from "./schema";

export type ValidationResult =
  | { readonly ok: true; readonly definition: GameDefinition }
  | { readonly ok: false; readonly errors: readonly string[] };

/**
 * Zod parse plus the semantic checks of data-model §4. Runs on built-ins in tests and on custom
 * games before they are saved.
 */
export function validateDefinition(input: unknown): ValidationResult {
  const parsed = GameDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const def = parsed.data;
  const errors = semanticErrors(def);
  return errors.length === 0 ? { ok: true, definition: def } : { ok: false, errors };
}

function semanticErrors(def: GameDefinition): string[] {
  const errors: string[] = [];

  for (let n = def.playerCount.min; n <= def.playerCount.max; n++) {
    const cash = def.startingCash[String(n)];
    if (cash === undefined) {
      errors.push(`startingCash: missing for ${n} players`);
    } else if (def.bank !== "unlimited" && cash * n > def.bank.total) {
      errors.push(`startingCash: ${n} × ${cash} exceeds the bank total ${def.bank.total}`);
    }
  }

  const parPrices = new Set<number>();
  def.market.cells.forEach((row, r) => {
    if (!row.some((cell) => cell !== null)) errors.push(`market: row ${r} has no cells`);
    for (const cell of row) if (cell?.tags?.includes("par")) parPrices.add(cell.price);
  });

  for (const c of def.companies) {
    const units = c.certificates.reduce((a, b) => a + b, 0);
    if (units !== c.shareCount) {
      errors.push(`companies.${c.id}.certificates: units sum to ${units}, not shareCount ${c.shareCount}`);
    }
    if (c.presidencyUnits > 0 && c.certificates[0] !== c.presidencyUnits) {
      errors.push(`companies.${c.id}.certificates: the first certificate must be the presidency`);
    }
    const options = c.parOptions === "parCells" ? [] : c.parOptions;
    for (const price of [...options, ...(c.fixedPar !== undefined ? [c.fixedPar] : [])]) {
      if (!parPrices.has(price)) errors.push(`companies.${c.id}.parOptions: ${price} is not a par cell`);
    }
  }

  const phaseIds = new Set(def.phases.map((p) => p.id));
  const trainTypes = new Set(def.trains.map((t) => t.type));
  for (const t of def.trains) {
    if (t.rustsOnPhase !== undefined && !phaseIds.has(t.rustsOnPhase)) {
      errors.push(`trains.${t.type}.rustsOnPhase: phase "${t.rustsOnPhase}" is not defined`);
    }
    if (t.availableFromPhase !== undefined && !phaseIds.has(t.availableFromPhase)) {
      errors.push(`trains.${t.type}.availableFromPhase: phase "${t.availableFromPhase}" is not defined`);
    }
  }
  for (const p of def.phases) {
    if (p.triggeredBy !== null && !trainTypes.has(p.triggeredBy)) {
      errors.push(`phases.${p.id}.triggeredBy: train "${p.triggeredBy}" is not defined`);
    }
  }

  const companyIds = new Set(def.companies.map((c) => c.id));
  for (const t of def.initialTreasuries) {
    if (!companyIds.has(t.company)) errors.push(`initialTreasuries: unknown company ${t.company}`);
  }

  for (const rule of def.customRules) {
    if (!isMechanicId(rule.id)) {
      errors.push(`customRules: unknown mechanic "${rule.id}"`);
      continue;
    }
    const config = getMechanic(rule.id).configSchema.safeParse(rule.config);
    if (!config.success) {
      errors.push(`customRules.${rule.id}: ${config.error.issues.map((i) => i.message).join("; ")}`);
    }
  }

  return errors;
}
