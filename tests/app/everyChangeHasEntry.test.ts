import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SessionStore } from "../../src/app/SessionStore";
import { applyOptions, getBuiltInGame } from "../../src/domain/games";
import { replay } from "../../src/domain/ledger/replay";
import { makePlayers, type TestSession } from "../helpers/dispatch";
import { FLOW, NAMES, candidates, rng } from "../helpers/randomWalk";
import { makeMeta } from "../helpers/session";

/**
 * FR-009 (feature 010, R11): no change to the game without a history entry. The store is the
 * only writer: every accepted action appends exactly one group, and the state is always the
 * replay of the log.
 */

const GAMES = [
  getBuiltInGame("1830"),
  getBuiltInGame("1848"),
  getBuiltInGame("21moon"),
  applyOptions(getBuiltInGame("rotla"), {}),
  applyOptions(getBuiltInGame("rotla"), { expansion: "landmarks" }),
];

describe("every state change has an entry (FR-009)", () => {
  it("each accepted action appends exactly one group, and the state equals the log's replay", async () => {
    const seen = new Set<string>();
    for (const [index, game] of GAMES.entries()) {
      const players = makePlayers(NAMES.slice(0, 4));
      const appended: string[] = [];
      const store = new SessionStore(
        {
          appendEntry: (_id, entry) => {
            appended.push(entry.kind);
            return Promise.resolve();
          },
        },
        makeMeta({ game, players }),
        [],
      );
      await store.dispatch({ type: "createSession", players, walletMode: "appTruth" });
      const rand = rng(500 + index);
      for (let step = 0; step < 120; step++) {
        const view = { game, players, state: store.getSnapshot().state } as unknown as TestSession;
        let applied = false;
        for (const action of [...candidates(view, rand), ...FLOW]) {
          const before = store.getSnapshot();
          const count = appended.length;
          const result = await store.dispatch(action);
          if (!result.ok) {
            // A refused action writes nothing and changes nothing.
            expect(appended).toHaveLength(count);
            expect(store.getSnapshot()).toBe(before);
            continue;
          }
          expect(appended.slice(count)).toEqual(["group"]);
          expect(store.getSnapshot().log).toHaveLength(before.log.length + 1);
          seen.add(result.group.action.type);
          applied = true;
          break;
        }
        if (!applied) break;
      }
      const { log, state } = store.getSnapshot();
      expect(state).toEqual(replay(game, players, log).state);
    }
    // The walks reach a broad set of action types.
    expect(seen.size).toBeGreaterThanOrEqual(15);
  }, 60_000);

  it("no module under src/ other than the store and its repository calls appendEntry", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name)) files.push(path.replace(/\\/g, "/"));
      }
    };
    walk("src");
    const callers = files.filter((f) => /\bappendEntry\s*\(/.test(readFileSync(f, "utf8")));
    expect(callers.sort()).toEqual(["src/app/SessionStore.ts", "src/persistence/sessionRepo.ts"]);
  });
});
