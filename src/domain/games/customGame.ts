import type { GameDefinition } from "./schema";
import { validateDefinition, type ValidationResult } from "./validateDefinition";

/**
 * Copy-and-edit custom games (FR-007; contracts/game-definition.md rule 4). Only these values
 * are editable in v1; market, phases, payout modes, revenue parts, rounding, capitalization,
 * round schedule and custom rules are not.
 */
export interface CustomGameEdit {
  readonly name?: string;
  readonly bank?: GameDefinition["bank"];
  readonly startingCash?: Readonly<Record<string, number>>;
  readonly companies?: Readonly<
    Record<string, Partial<Pick<GameDefinition["companies"][number], "name" | "shortName" | "aliases" | "color" | "altName">>>
  >;
  readonly privates?: Readonly<Record<string, Partial<Pick<GameDefinition["privates"][number], "name" | "cost" | "income">>>>;
  readonly trains?: Readonly<Record<string, { readonly cost?: number; readonly count?: number | "unlimited" }>>;
  readonly chipPreset?: GameDefinition["chipPreset"];
}

const EDITABLE = new Set(["name", "bank", "startingCash", "companies", "privates", "trains", "chipPreset"]);

function newId(): string {
  return `custom-${crypto.randomUUID()}`;
}

export function createCustomGame(builtIn: GameDefinition, name: string): GameDefinition {
  return { ...structuredClone(builtIn), id: newId(), basedOn: builtIn.basedOn ?? builtIn.id, name };
}

export function editCustomGame(def: GameDefinition, edit: CustomGameEdit): ValidationResult {
  const forbidden = Object.keys(edit).filter((k) => !EDITABLE.has(k));
  if (forbidden.length > 0) {
    return { ok: false, errors: forbidden.map((k) => `${k}: no se puede editar en un juego personalizado`) };
  }
  const next: GameDefinition = structuredClone(def);
  if (edit.name !== undefined) next.name = edit.name;
  if (edit.bank !== undefined) next.bank = edit.bank;
  if (edit.startingCash) next.startingCash = { ...next.startingCash, ...edit.startingCash };
  if (edit.chipPreset) next.chipPreset = [...edit.chipPreset];
  if (edit.companies) {
    const patches = edit.companies;
    next.companies = next.companies.map((c) => ({ ...c, ...patches[c.id] }));
  }
  if (edit.privates) {
    const patches = edit.privates;
    next.privates = next.privates.map((p) => ({ ...p, ...patches[p.id] }));
  }
  if (edit.trains) {
    const patches = edit.trains;
    next.trains = next.trains.map((t) => {
      const patch = patches[t.type];
      if (!patch) return t;
      const variants = patch.cost === undefined ? t.variants : t.variants.map((v, i) => (i === 0 ? { ...v, cost: patch.cost ?? v.cost } : v));
      return { ...t, variants, ...(patch.count !== undefined ? { count: patch.count } : {}) };
    });
  }
  return validateDefinition(next);
}
