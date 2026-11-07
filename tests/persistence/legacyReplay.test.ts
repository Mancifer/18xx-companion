import { describe, expect, it } from "vitest";
import { checkInvariants } from "../../src/domain/mechanics/invariants";
import { legacyFiles, replayLegacy, replaySummary } from "../helpers/legacy";

/**
 * Feature 014 T002: session files exported by app version 0.1.0, kept as fixed copies (never
 * regenerated) in tests/fixtures/legacy-0.1.0/. The snapshot was recorded on the code before any
 * multi-language change; later versions must replay these files to the same state (SC-006).
 */

describe("0.1.0 session files replay to their recorded state (feature 014 T002)", () => {
  it("has the ten reference files", () => {
    expect(legacyFiles()).toHaveLength(10);
  });

  for (const file of legacyFiles()) {
    it(`${file}: same state as when it was exported, invariants clean`, async () => {
      const parsed = await replayLegacy(file);
      expect(parsed.file.appVersion).toBe("0.1.0");
      expect(parsed.hashMatches).toBe(true);
      expect(checkInvariants(parsed.file.session.game, parsed.state)).toEqual([]);
      expect(replaySummary(parsed.state)).toMatchSnapshot();
    });
  }
});
