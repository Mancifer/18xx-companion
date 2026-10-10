import { getMechanic, isMechanicId } from "../mechanics/custom";
import { GameDefinitionSchema, type GameDefinition } from "./schema";

export type ValidationResult =
  | { readonly ok: true; readonly definition: GameDefinition }
  | { readonly ok: false; readonly errors: readonly string[] };

/**
 * Zod parse plus the semantic checks of data-model §4. Runs on built-ins in tests and on custom
 * games before they are saved.
 */
export function validateDefinition(input: unknown, opts: { readonly patched?: boolean } = {}): ValidationResult {
  const parsed = GameDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const def = parsed.data;
  const errors = semanticErrors(def, opts.patched ?? false);
  return errors.length === 0 ? { ok: true, definition: def } : { ok: false, errors };
}

function semanticErrors(def: GameDefinition, patched: boolean): string[] {
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

  errors.push(...feature004Errors(def, patched));

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

/** data-model §6 rules 1–8 (rule 9, starting cash, is the general check above). */
function feature004Errors(def: GameDefinition, patched: boolean): string[] {
  const errors: string[] = [];
  const cellPrices = new Set<number>();
  for (const row of def.market.cells) for (const cell of row) if (cell) cellPrices.add(cell.price);

  // 1–2. Auction launches need the auction data and a launch range of track prices in every phase.
  if (def.companies.some((c) => c.start === "auction")) {
    if (!def.auction) errors.push("auction: required by companies with start \"auction\"");
    for (const p of def.phases) {
      if (!p.launchPriceRange) errors.push(`phases.${p.id}.launchPriceRange: required by companies with start "auction"`);
    }
  }
  for (const p of def.phases) {
    for (const bound of p.launchPriceRange ?? []) {
      if (!cellPrices.has(bound)) errors.push(`phases.${p.id}.launchPriceRange: ${bound} is not a market price`);
    }
  }

  // 3. A merger major has as many shares as its two smallest-and-largest minors together.
  const minors = def.companies.filter((c) => c.tier === "minor").map((c) => c.shareCount);
  if (minors.length > 0) {
    const expected = Math.min(...minors) + Math.max(...minors);
    for (const c of def.companies) {
      if (c.tier === "major" && c.start === "merger" && c.shareCount !== expected) {
        errors.push(`companies.${c.id}.shareCount: a merger major needs ${expected} (two minors), not ${c.shareCount}`);
      }
    }
  }

  // 4. Launch assets are special trains.
  const special = new Set(def.trains.filter((t) => t.special).map((t) => t.type));
  for (const c of def.companies) {
    for (const asset of c.traits?.launchAssets ?? []) {
      if (!special.has(asset.split(":")[1] ?? "")) {
        errors.push(`companies.${c.id}.traits.launchAssets: ${asset} is not a special train`);
      }
    }
  }

  // 5. Exported types exist.
  const trainTypes = new Set(def.trains.map((t) => t.type));
  for (const type of def.trainExport?.allOfType ?? []) {
    if (!trainTypes.has(type)) errors.push(`trainExport.allOfType: train "${type}" is not defined`);
  }

  // 6. Conditional slots name a phase.
  const phaseIds = new Set(def.phases.map((p) => p.id));
  if (def.roundSchedule.type === "fixed") {
    for (const c of def.roundSchedule.conditional ?? []) {
      if (!phaseIds.has(c.phaseReached)) {
        errors.push(`roundSchedule.conditional: phase "${c.phaseReached}" is not defined`);
      }
    }
  }

  // 7. Per-player counts lie within the player range.
  for (const t of def.trains) {
    for (const key of Object.keys(t.countByPlayers ?? {})) {
      const n = Number(key);
      if (!Number.isInteger(n) || n < def.playerCount.min || n > def.playerCount.max) {
        errors.push(`trains.${t.type}.countByPlayers: ${key} players is outside playerCount`);
      }
    }
  }

  // 8. Company subsets name known companies: in play, or added or removed by an option. A
  // session copy (patched) has already dropped the companies its subsets left out.
  if (patched) return errors;
  const companyIds = new Set([
    ...def.companies.map((c) => c.id),
    ...def.options.flatMap((o) => o.choices.flatMap((ch) => [...(ch.addCompanies ?? []).map((c) => c.id), ...(ch.removeCompanies ?? [])])),
  ]);
  for (const o of def.options) {
    if (o.kind !== "companySubset") continue;
    for (const id of o.from ?? []) {
      if (!companyIds.has(id)) errors.push(`options.${o.id}.from: unknown company ${id}`);
    }
  }
  return errors;
}
