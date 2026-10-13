import { z } from "zod";
import { ActionSchema, PlayerSchema, WarningSchema } from "../domain/actions/schemas";
import type { SessionState } from "../domain/events/state";
import { PrimitiveEventSchema } from "../domain/events/schema";
import { ChipSchema, GameDefinitionSchema } from "../domain/games/schema";
import type { LogEntry } from "../domain/ledger/entries";
import { replay } from "../domain/ledger/replay";
import { outcomeOf } from "../domain/mechanics/gameEnd";
import type { SessionMeta, SessionOutcome } from "../domain/session";
import { stateHash } from "./canonical";
import type { SessionRepo } from "./sessionRepo";

/**
 * Session files (FR-091, contracts/export-format.md). The exporter never reads `settings`, so the
 * AI key cannot end up in a file (FR-092). On import the log is authoritative: a state hash that
 * does not match is a warning, not a refusal.
 */

export const EXPORT_FORMAT = "18xx-companion/session";
export const EXPORT_VERSION = 2;

const GroupEntrySchema = z.object({
  kind: z.literal("group"),
  seq: z.number().int().positive(),
  id: z.string().min(1),
  at: z.string(),
  source: z.enum(["touch", "voice", "system"]),
  action: ActionSchema,
  events: z.array(PrimitiveEventSchema),
  touches: z.array(z.string()),
  transcript: z.string().optional(),
  warnings: z.array(WarningSchema),
});

const EntrySchema = z.discriminatedUnion("kind", [
  GroupEntrySchema,
  z.object({ kind: z.literal("revert"), seq: z.number().int().positive(), at: z.string(), groupId: z.string().min(1) }),
  z.object({
    kind: z.literal("amend"),
    seq: z.number().int().positive(),
    at: z.string(),
    groupId: z.string().min(1),
    action: ActionSchema,
    events: z.array(PrimitiveEventSchema),
    touches: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("undo"),
    seq: z.number().int().positive(),
    at: z.string(),
    groupIds: z.array(z.string().min(1)).min(1),
  }),
]);

export const SessionExportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exportedAt: z.string(),
  appVersion: z.string(),
  session: z.object({
    id: z.string().min(1),
    name: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    game: GameDefinitionSchema,
    options: z.record(z.string(), z.string()).optional(),
    players: z.array(PlayerSchema).min(1),
    walletMode: z.enum(["appTruth", "bankOnly"]),
    chipSet: z.object({ chips: z.array(ChipSchema) }),
    /** Feature 008: optional, so older files import with no pins. */
    bankPins: z.record(z.string(), z.number().int().nonnegative()).optional(),
  }),
  entries: z.array(EntrySchema),
  stateHash: z.string(),
});

export type SessionExport = z.infer<typeof SessionExportSchema>;

/** Upgrades older files to the current version. Keyed by the version being upgraded from. */
const migrations: Readonly<Record<number, (old: Record<string, unknown>) => Record<string, unknown>>> = {
  // Version 2 (feature 010) only adds the `undo` entry kind, which version-1 files never contain.
  1: (old) => ({ ...old, version: 2 }),
};

export async function buildExport(
  repo: SessionRepo,
  sessionId: string,
  options: { readonly appVersion: string; readonly now?: Date },
): Promise<SessionExport> {
  const loaded = await repo.loadSession(sessionId);
  if (!loaded) throw new Error(`Unknown session ${sessionId}`);
  const { meta, entries } = loaded;
  const { state } = replay(meta.game, meta.players, entries);
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: (options.now ?? new Date()).toISOString(),
    appVersion: options.appVersion,
    session: {
      id: meta.id,
      name: meta.name,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      game: meta.game,
      options: { ...meta.options },
      players: meta.players.map((p) => ({ ...p, aliases: [...p.aliases] })),
      walletMode: meta.walletMode,
      chipSet: { chips: meta.chipSet.chips.map((c) => ({ ...c })) },
      ...(meta.bankPins ? { bankPins: { ...meta.bankPins } } : {}),
    },
    entries: entries as SessionExport["entries"],
    stateHash: await stateHash(state),
  };
}

/** "18xx-<game>-<yyyyMMdd-HHmm>.json", in local time. */
export function exportFileName(exp: Pick<SessionExport, "exportedAt" | "session">): string {
  const d = new Date(exp.exportedAt);
  const two = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`;
  return `18xx-${exp.session.game.id}-${stamp}.json`;
}

export type ParsedImport =
  | {
      readonly ok: true;
      readonly file: SessionExport;
      readonly state: SessionState;
      /** Derived from the replayed log, never read from the file (feature 007, FR-018). */
      readonly outcome: SessionOutcome | null;
      readonly hashMatches: boolean;
      readonly warningEs?: string;
    }
  | { readonly ok: false; readonly errorEs: string };

/** Brings an older file up to EXPORT_VERSION, before schema validation. */
export function upgradeExport(json: unknown): { readonly ok: true; readonly data: unknown } | { readonly ok: false; readonly errorEs: string } {
  if (!json || typeof json !== "object" || (json as { format?: unknown }).format !== EXPORT_FORMAT) {
    return { ok: false, errorEs: "El archivo no es una partida de 18xx Companion." };
  }
  let data = json as Record<string, unknown>;
  const version = typeof data["version"] === "number" ? data["version"] : NaN;
  if (!Number.isInteger(version) || version < 1) return { ok: false, errorEs: "Versión de archivo desconocida." };
  if (version > EXPORT_VERSION) {
    return { ok: false, errorEs: `El archivo es de una versión más nueva de la app (${version}). Actualiza la app.` };
  }
  for (let v = version; v < EXPORT_VERSION; v++) {
    const migrate = migrations[v];
    if (!migrate) return { ok: false, errorEs: `No se puede convertir un archivo de la versión ${v}.` };
    data = migrate(data);
  }
  return { ok: true, data };
}

export async function parseImport(json: unknown): Promise<ParsedImport> {
  const upgraded = upgradeExport(json);
  if (!upgraded.ok) return upgraded;
  const parsed = SessionExportSchema.safeParse(upgraded.data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, errorEs: `Archivo dañado: ${first ? `${first.path.join(".")}: ${first.message}` : "formato inválido"}` };
  }
  const file = parsed.data;
  const replayed = replay(file.session.game, file.session.players, file.entries as LogEntry[]);
  const { state } = replayed;
  const outcome = outcomeOf(file.session.game, file.session.players, replayed);
  const hashMatches = (await stateHash(state)) === file.stateHash;
  return hashMatches
    ? { ok: true, file, state, outcome, hashMatches }
    : { ok: true, file, state, outcome, hashMatches, warningEs: "el estado reproducido no coincide" };
}

/** Writes an imported session: replacing one with the same id, or as a copy with a new id. */
export async function importSession(
  repo: SessionRepo,
  parsed: Extract<ParsedImport, { ok: true }>,
  options: { readonly mode: "replace" | "copy" },
): Promise<SessionMeta> {
  const { session, entries } = parsed.file;
  const copy = options.mode === "copy";
  const meta: SessionMeta = {
    id: copy ? crypto.randomUUID() : session.id,
    name: copy ? `${session.name} (copia)` : session.name,
    game: session.game,
    options: session.options ?? {},
    players: session.players,
    walletMode: session.walletMode,
    chipSet: session.chipSet,
    ...(session.bankPins ? { bankPins: session.bankPins } : {}),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    entryCount: entries.length,
    outcome: parsed.outcome,
  };
  if (!copy) await repo.deleteSession(meta.id);
  await repo.importSession(meta, entries as LogEntry[]);
  return meta;
}
