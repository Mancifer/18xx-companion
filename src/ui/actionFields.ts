import type { GameDefinition } from "../domain/games/schema";
import { holdsMoney, isHolderRef, type HolderRef, type Player } from "../domain/types";

/**
 * The editable fields of a recorded action, for the amend sheet (FR-013). Numbers are edited on
 * the keypad, references and enums with pickers. Nested lists other than revenue parts
 * (batches, compound actions, setup) are not editable here: undo and record them again.
 */
export type FieldKind = "number" | "signed" | "choice" | "text";

export interface ActionField {
  readonly path: readonly (string | number)[];
  readonly label: string;
  readonly kind: FieldKind;
  readonly value: unknown;
  /** Shown with the currency symbol. */
  readonly money?: boolean;
  /** For "choice": the allowed values and their labels. */
  readonly options?: readonly { readonly value: string | null; readonly label: string }[];
}

const NUMBER_LABELS: Readonly<Record<string, string>> = {
  amount: "Cantidad",
  setTo: "Nuevo valor",
  units: "Acciones",
  count: "Número",
  price: "Precio",
  extra: "Extra",
};

const NOT_MONEY = new Set(["units", "count"]);

const CHOICE_LABELS: Readonly<Record<string, string>> = {
  from: "De",
  to: "A",
  holder: "Titular",
  company: "Compañía",
  player: "Jugador",
  buyer: "Comprador",
  seller: "Vendedor",
  mode: "Modo",
  trainType: "Tren",
  source: "Origen",
  private: "Privada",
};

const MODE_LABELS: Readonly<Record<string, string>> = { full: "Pagar", withhold: "Retener", half: "Mitad" };
const SOURCE_LABELS: Readonly<Record<string, string>> = { ipo: "IPO", pool: "Banco (pool)", treasury: "Tesorería" };

export interface FieldContext {
  readonly game: GameDefinition;
  readonly players: readonly Player[];
  readonly holderName: (h: HolderRef) => string;
}

export function editableFields(action: Record<string, unknown>, ctx: FieldContext): ActionField[] | null {
  if (["createSession", "stockBatch", "compound", "undo"].includes(String(action["type"]))) return null;
  const fields: ActionField[] = [];
  for (const [key, value] of Object.entries(action)) {
    if (key === "type") continue;
    if (key === "parts" && Array.isArray(value)) {
      value.forEach((part: unknown, i) => {
        if (!part || typeof part !== "object") return;
        const p = part as { part?: string; amount?: number };
        const label = ctx.game.revenueParts.find((r) => r.id === p.part)?.label ?? "Ingresos";
        fields.push({ path: [key, i, "amount"], label, kind: "number", value: p.amount ?? 0, money: true });
      });
      continue;
    }
    if (key === "delta") {
      if (typeof value === "number") fields.push({ path: [key], label: "Ajuste", kind: "signed", value, money: true });
      continue;
    }
    const numberLabel = NUMBER_LABELS[key];
    if (numberLabel !== undefined && (typeof value === "number" || value === null)) {
      if (typeof value === "number") {
        fields.push({ path: [key], label: numberLabel, kind: "number", value, money: !NOT_MONEY.has(key) });
      }
      continue;
    }
    if (key === "text" && typeof value === "string") {
      fields.push({ path: [key], label: "Texto", kind: "text", value });
      continue;
    }
    const options = choiceOptions(String(action["type"]), key, value, ctx);
    if (options) fields.push({ path: [key], label: CHOICE_LABELS[key] ?? key, kind: "choice", value, options });
  }
  return fields;
}

function choiceOptions(
  type: string,
  key: string,
  value: unknown,
  ctx: FieldContext,
): ActionField["options"] | undefined {
  const { game, players } = ctx;
  if (key === "mode") {
    return game.payoutModes.map((m) => ({ value: m, label: MODE_LABELS[m] ?? m }));
  }
  if (key === "trainType") return game.trains.map((t) => ({ value: t.type, label: t.type }));
  if (key === "source" && typeof value === "string" && value in SOURCE_LABELS) {
    return Object.entries(SOURCE_LABELS).map(([v, label]) => ({ value: v, label }));
  }
  if (type === "buyTrain" && key === "from") {
    return [
      { value: "bank", label: "Banco" },
      { value: "pool", label: "Pool" },
      { value: "company", label: "Otra compañía" },
    ];
  }
  if (key === "private") return game.privates.map((p) => ({ value: p.id, label: p.name }));
  if (key === "player") return players.map((p) => ({ value: p.id, label: p.name }));
  if (key === "company") {
    const current = value === null ? [{ value: null, label: "La que opera" }] : [];
    return [...current, ...game.companies.map((c) => ({ value: c.id, label: c.shortName }))];
  }
  if (typeof value === "string" && isHolderRef(value)) {
    const money = holdsMoney(value);
    const all: HolderRef[] = [
      "bank",
      ...players.map((p) => `player:${p.id}` as const),
      ...game.companies.map((c) => `company:${c.id}` as const),
      ...(money ? [] : [...game.companies.map((c) => `ipo:${c.id}` as const), "pool" as const, "removed" as const]),
    ];
    return all
      .filter((h) => (money ? holdsMoney(h) : h !== "bank"))
      .map((h) => ({ value: h, label: ctx.holderName(h) }));
  }
  return undefined;
}

/** A copy of the action with one field replaced. */
export function setField<T extends Record<string, unknown>>(action: T, path: readonly (string | number)[], value: unknown): T {
  const [head, ...rest] = path;
  if (head === undefined) return value as T;
  if (Array.isArray(action)) {
    const copy = [...(action as unknown[])];
    copy[Number(head)] = setField((copy[Number(head)] ?? {}) as Record<string, unknown>, rest, value);
    return copy as unknown as T;
  }
  const child = action[head as keyof T] as unknown;
  return {
    ...action,
    [head]: rest.length === 0 ? value : setField((child ?? {}) as Record<string, unknown>, rest, value),
  };
}

export function getField(action: unknown, path: readonly (string | number)[]): unknown {
  let current: unknown = action;
  for (const key of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}
