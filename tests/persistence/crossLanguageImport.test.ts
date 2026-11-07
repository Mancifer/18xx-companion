import { describe, expect, it } from "vitest";
import { z } from "zod";
import { APP_VERSION } from "../../src/app/version";
import type { LogEntry } from "../../src/domain/ledger/entries";
import { checkInvariants } from "../../src/domain/mechanics/invariants";
import { domainText } from "../../src/i18n";
import { renderWarning } from "../../src/i18n/render";
import { openCompanionDb } from "../../src/persistence/db";
import { buildExport, importSession, parseImport } from "../../src/persistence/exportImport";
import { SessionRepo } from "../../src/persistence/sessionRepo";
import { legacyFiles, replayLegacy, replaySummary } from "../helpers/legacy";
import { freshDbName } from "../helpers/session";

/**
 * Feature 014 T055 (SC-006, US3): a 0.1.0 export imports and replays exactly, reads in both
 * languages, and exports again in a form a 0.1.0 app can still read.
 */

/** The 0.1.0 warning, before feature 014 added `params`. */
const LegacyWarningSchema = z.object({ code: z.string(), messageEs: z.string().min(1), severity: z.enum(["info", "warn"]) });

const RAW_REF = /\b(player|company|ipo|private|train):[\w#-]+/;

describe("0.1.0 files across languages (feature 014 T055)", () => {
  for (const file of legacyFiles()) {
    it(`${file}: replays exactly and every History line reads in English and Spanish`, async () => {
      const parsed = await replayLegacy(file);
      expect(parsed.hashMatches).toBe(true);
      expect(checkInvariants(parsed.file.session.game, parsed.state)).toEqual([]);

      const { game, players } = parsed.file.session;
      const ctx = { game, players, state: parsed.state };
      for (const entry of parsed.file.entries as LogEntry[]) {
        if (entry.kind !== "group") continue;
        for (const lang of ["en", "es"] as const) {
          const line = domainText(lang).summary(entry.action, ctx, entry.events);
          expect(line, `${entry.id} in ${lang}`).not.toBe("");
          expect(line).not.toMatch(RAW_REF);
          expect(line).not.toMatch(/undefined|NaN/);
          for (const w of entry.warnings) expect(renderWarning(w, ctx, lang)).not.toBe("");
        }
      }
    });

    it(`${file}: exports again as ${APP_VERSION}, without settings, readable by 0.1.0`, async () => {
      const parsed = await replayLegacy(file);
      const db = await openCompanionDb(freshDbName());
      const repo = new SessionRepo(db);
      const meta = await importSession(repo, parsed, { mode: "replace" });
      const exp = await buildExport(repo, meta.id, { appVersion: APP_VERSION });
      db.close();

      expect(exp.version).toBe(parsed.file.version);
      expect(exp.appVersion).toBe("0.3.0");
      const json = JSON.stringify(exp);
      expect(json).not.toMatch(/"language"|"voiceLocales"|"voiceLocale"/);
      for (const entry of exp.entries as LogEntry[]) {
        if (entry.kind !== "group") continue;
        for (const w of entry.warnings) expect(LegacyWarningSchema.safeParse(w).success).toBe(true);
      }

      const again = await parseImport(JSON.parse(json));
      if (!again.ok) throw new Error(JSON.stringify(again.error));
      expect(replaySummary(again.state)).toEqual(replaySummary(parsed.state));
    });
  }
});
