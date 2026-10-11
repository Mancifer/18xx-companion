import type { Chip } from "../types";

/**
 * The chips every built-in game starts with (feature 008, data-model §3), highest value first.
 * Counts are what a usual table owns; they only shape the setup plan, never mid-game breakdowns.
 */
export const DEFAULT_CHIPS: readonly Chip[] = [
  { value: 500, color: "#2e7d32", countAvailable: 50 }, // green
  { value: 100, color: "#c62828", countAvailable: 150 }, // red
  { value: 25, color: "#212121", countAvailable: 50 }, // black
  { value: 5, color: "#1565c0", countAvailable: 100 }, // blue
  { value: 1, color: "#f5f5f5", countAvailable: 150 }, // white
];

const COLOR_NAMES_ES: Readonly<Record<string, string>> = {
  "#2e7d32": "verde",
  "#c62828": "roja",
  "#212121": "negra",
  "#1565c0": "azul",
  "#f5f5f5": "blanca",
};

/** The Spanish name of a default chip color, for the missing-chips warning; undefined otherwise. */
export function colorNameEs(color: string): string | undefined {
  return COLOR_NAMES_ES[color.toLowerCase()];
}
