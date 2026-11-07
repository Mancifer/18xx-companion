import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionState } from "../../src/domain/events/state";
import { parseImport } from "../../src/persistence/exportImport";

/** Feature 014 T002: the 0.1.0 session files kept as fixed copies (never regenerated), and how to replay them. */

export const LEGACY_DIR = join(__dirname, "..", "fixtures", "legacy-0.1.0");
export const legacyFiles = (): string[] => readdirSync(LEGACY_DIR).filter((f) => f.endsWith(".json")).sort();

/** The parts of a replayed state a player can see: money, shares, companies, assets, counters, turn. */
export function replaySummary(state: SessionState) {
  const sorted = <T>(o: Readonly<Record<string, T>>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  return {
    money: sorted(state.money),
    holdings: sorted(Object.fromEntries(Object.entries(state.holdings).map(([h, units]) => [h, sorted(units)]))),
    presidency: sorted(state.presidency),
    assets: sorted(state.assets),
    companies: sorted(state.companies),
    counters: sorted(state.counters),
    turn: state.turn,
  };
}

export async function replayLegacy(file: string) {
  const json: unknown = JSON.parse(readFileSync(join(LEGACY_DIR, file), "utf8"));
  const parsed = await parseImport(json);
  if (!parsed.ok) throw new Error(`${file}: ${JSON.stringify(parsed)}`);
  return parsed;
}
