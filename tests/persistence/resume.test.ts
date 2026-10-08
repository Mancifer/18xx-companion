import { describe, expect, it } from "vitest";
import { SessionStore } from "../../src/app/SessionStore";
import { startSession } from "../../src/app/sessions";
import { openCompanionDb } from "../../src/persistence/db";
import { SessionRepo } from "../../src/persistence/sessionRepo";
import { SettingsRepo } from "../../src/persistence/settingsRepo";
import { getBuiltInGame } from "../../src/domain/games";
import { cashOf } from "../../src/domain/events/state";
import { makePlayers } from "../helpers/dispatch";
import { freshDbName } from "../helpers/session";

describe("resume (FR-090, SC-007, US1-3)", () => {
  it("a reopened session has the identical state and log", async () => {
    const db = await openCompanionDb(freshDbName());
    const repo = new SessionRepo(db);
    const settings = new SettingsRepo(db);
    const store = await startSession(repo, settings, {
      game: getBuiltInGame("1830"),
      options: {},
      players: makePlayers(["Ana", "Bruno", "Carla", "Dani"]),
      walletMode: "appTruth",
    });
    await store.dispatch({ type: "transferMoney", from: "player:p1", to: "bank", amount: 100 });

    const id = store.getSnapshot().meta.id;
    expect((await settings.get()).lastSessionId).toBe(id);

    const reopened = await SessionStore.open(new SessionRepo(await openCompanionDb(db.name)), id);
    expect(reopened?.getSnapshot().state).toEqual(store.getSnapshot().state);
    expect(reopened?.getSnapshot().log).toEqual(store.getSnapshot().log);
    expect(cashOf(reopened!.getSnapshot().state, "player:p1")).toBe(500);
  });

  it("stores the frozen definition with options applied (FR-005)", async () => {
    const db = await openCompanionDb(freshDbName());
    const store = await startSession(new SessionRepo(db), new SettingsRepo(db), {
      game: getBuiltInGame("1830"),
      options: { ruleset: "classic" },
      players: makePlayers(["Ana", "Bruno", "Carla"]),
      walletMode: "bankOnly",
    });
    const meta = store.getSnapshot().meta;
    expect(meta.game.customRules.map((r) => r.id)).toContain("corporateBankruptcy");
    expect(meta.walletMode).toBe("bankOnly");
    expect(meta.name).toMatch(/^1830 · /);
    expect(meta.chipSet.chips.length).toBeGreaterThan(0);
  });
});
