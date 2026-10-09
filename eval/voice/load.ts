import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LogEntry } from "../../src/domain/ledger/entries";
import { effectiveLog } from "../../src/domain/ledger/effectiveLog";
import { replay } from "../../src/domain/ledger/replay";
import { SessionExportSchema } from "../../src/persistence/exportImport";
import type { ResolveContext } from "../../src/voice/resolve";
import type { VoiceSession } from "../../src/voice/tools";

/** A fixture as the app would hold it after importing the file (research R18). */
export interface LoadedFixture {
  readonly id: string;
  /** Stable per fixture: tools and system prompt (the cached prefix) are built from it. */
  readonly session: VoiceSession;
  readonly ctx: ResolveContext;
}

export function loadFixture(dir: string, id: string): LoadedFixture {
  const file = SessionExportSchema.parse(JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8")));
  const { game, players } = file.session;
  const entries = file.entries as LogEntry[];
  const { state } = replay(game, players, entries);
  return { id, session: { game, players }, ctx: { game, players, state, effective: effectiveLog(entries) } };
}
