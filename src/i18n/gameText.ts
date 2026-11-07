import type { GameDefinition } from "../domain/games/schema";
import type { GameTextPack, GameTextPacks } from "./contract/games";
import { games as en } from "./en/games";
import { games as es } from "./es/games";
import type { Lang } from "./lang";

/**
 * Feature 014 (data-model §6, research R5): a game's display text in a language. Built-in games
 * read their text pack by element id, so even a session that keeps an old copy of the definition
 * shows the current wording; anything a pack lacks falls back to English, then to the definition's
 * own text. Custom games have no pack and always show their own text.
 */

const PACKS: Readonly<Record<Lang, GameTextPacks>> = { en, es };

export interface GameText {
  readonly option: (optionId: string) => string;
  readonly choice: (optionId: string, value: string) => string;
  readonly revenuePart: (partId: string) => string;
  /** A payment's label; `fallback` is the definition's own (`labelEs`). */
  readonly payment: (paymentId: string, fallback?: string) => string;
  readonly ruleText: (ruleId: string, field: string) => string;
  /** A schedule note by its slot, or undefined when the game has none there. */
  readonly note: (slot: string) => string | undefined;
  /** A schedule note written in a session (stored as the Spanish text) in this language. */
  readonly noteFromStored: (stored: string) => string | undefined;
  readonly phase: (phaseId: string) => string | undefined;
}

export function gameText(game: GameDefinition, lang: Lang): GameText {
  const own: GameTextPack | undefined = PACKS[lang][game.id];
  const english: GameTextPack | undefined = PACKS.en[game.id];
  const spanish: GameTextPack | undefined = PACKS.es[game.id];
  const pick = <T>(read: (p: GameTextPack) => T | undefined): T | undefined =>
    (own ? read(own) : undefined) ?? (english ? read(english) : undefined);

  const defOption = (id: string) => game.options.find((o) => o.id === id);
  return {
    option: (id) => pick((p) => p.options?.[id]?.label) ?? defOption(id)?.label ?? id,
    choice: (id, value) =>
      pick((p) => p.options?.[id]?.choices?.[value]) ?? defOption(id)?.choices.find((c) => c.value === value)?.label ?? value,
    revenuePart: (id) => pick((p) => p.revenueParts?.[id]) ?? game.revenueParts.find((r) => r.id === id)?.label ?? id,
    payment: (id, fallback) => pick((p) => p.payments?.[id]) ?? fallback ?? id,
    ruleText: (ruleId, field) => {
      const fromPack = pick((p) => p.rules?.[ruleId]?.[field]);
      if (fromPack !== undefined) return fromPack;
      const value = game.customRules.find((r) => r.id === ruleId)?.config[field];
      return typeof value === "string" ? value : "";
    },
    note: (slot) => pick((p) => p.notes?.[slot]),
    noteFromStored: (stored) => {
      const slot = Object.entries(spanish?.notes ?? {}).find(([, text]) => text === stored)?.[0];
      return slot === undefined ? undefined : pick((p) => p.notes?.[slot]);
    },
    phase: (id) => pick((p) => p.phases?.[id]) ?? game.phases.find((p) => p.id === id)?.color,
  };
}
