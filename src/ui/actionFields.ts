import type { GameDefinition } from "../domain/games/schema";
import type { UiText } from "../i18n/contract/ui";
import { gameText } from "../i18n/gameText";
import type { Lang } from "../i18n/lang";
import { holdsMoney, isHolderRef, type HolderRef, type Player } from "../domain/types";

/**
 * The editable fields of an action, for the voice card's edit (FR-060). Numbers are edited on
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

const NOT_MONEY = new Set(["units", "count"]);


export interface FieldContext {
  readonly game: GameDefinition;
  readonly players: readonly Player[];
  readonly holderName: (h: HolderRef) => string;
  /** The field labels in the display language (feature 014). */
  readonly labels: UiText["components"]["fields"];
  readonly modes: UiText["sheets"]["operate"]["modes"];
  readonly lang: Lang;
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
        const label = p.part !== undefined ? gameText(ctx.game, ctx.lang).revenuePart(p.part) : ctx.labels.revenue;
        fields.push({ path: [key, i, "amount"], label, kind: "number", value: p.amount ?? 0, money: true });
      });
      continue;
    }
    if (key === "delta") {
      if (typeof value === "number") fields.push({ path: [key], label: ctx.labels.delta, kind: "signed", value, money: true });
      continue;
    }
    const numberLabel = ctx.labels.numbers[key];
    if (numberLabel !== undefined && (typeof value === "number" || value === null)) {
      if (typeof value === "number") {
        fields.push({ path: [key], label: numberLabel, kind: "number", value, money: !NOT_MONEY.has(key) });
      }
      continue;
    }
    if (key === "text" && typeof value === "string") {
      fields.push({ path: [key], label: ctx.labels.text, kind: "text", value });
      continue;
    }
    const options = choiceOptions(String(action["type"]), key, value, ctx);
    if (options) fields.push({ path: [key], label: ctx.labels.choices[key] ?? key, kind: "choice", value, options });
  }
  return fields;
}

function choiceOptions(
  type: string,
  key: string,
  value: unknown,
  ctx: FieldContext,
): ActionField["options"] | undefined {
  const { game, players, labels } = ctx;
  if (key === "mode") {
    return game.payoutModes.map((m) => ({ value: m, label: ctx.modes[m] }));
  }
  if (key === "trainType") return game.trains.map((t) => ({ value: t.type, label: t.type }));
  if (key === "source" && typeof value === "string" && value in labels.sources) {
    return Object.entries(labels.sources).map(([v, label]) => ({ value: v, label }));
  }
  if (type === "buyTrain" && key === "from") {
    return [
      { value: "bank", label: labels.trainFrom.bank },
      { value: "pool", label: labels.trainFrom.pool },
      { value: "company", label: labels.trainFrom.company },
    ];
  }
  if (key === "private") return game.privates.map((p) => ({ value: p.id, label: p.name }));
  if (key === "player") return players.map((p) => ({ value: p.id, label: p.name }));
  if (key === "company") {
    const current = value === null ? [{ value: null, label: labels.operating }] : [];
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
