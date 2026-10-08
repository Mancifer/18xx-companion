import { describe, expect, it } from "vitest";
import { initialState, cashOf, unitsOf } from "../../src/domain/events/state";
import { reduce } from "../../src/domain/events/reduce";
import type { PrimitiveEvent } from "../../src/domain/events/types";
import type { HolderRef } from "../../src/domain/types";
import { miniGame, miniPlayers } from "../helpers/miniGame";
import { mulberry32, pick } from "../helpers/random";

const moneyHolders: HolderRef[] = ["bank", "player:p1", "player:p2", "company:AA", "company:BB"];
const shareHolders: HolderRef[] = ["ipo:AA", "pool", "player:p1", "player:p2", "company:AA", "company:BB", "removed"];
const assetHolders: HolderRef[] = ["bank", "pool", "player:p1", "company:AA", "company:BB", "removed"];
const assets = ["train:2:1", "train:2:2", "train:3:1", "train:3:2", "train:4:1"];

function totals(s: ReturnType<typeof initialState>) {
  const money = moneyHolders.reduce((sum, h) => sum + cashOf(s, h), 0);
  const units = shareHolders.reduce((sum, h) => sum + unitsOf(s, h, "AA"), 0);
  const assetCount = Object.keys(s.assets).length;
  return { money, units, assetCount };
}

describe("conservation (seeded property test)", () => {
  it("random transfer sequences keep money, share and asset totals", () => {
    for (let run = 0; run < 1000; run++) {
      const rand = mulberry32(run + 1);
      let s = initialState(miniGame, miniPlayers);
      const start = totals(s);
      const steps = 1 + Math.floor(rand() * 30);
      for (let i = 0; i < steps; i++) {
        const kind = rand();
        let e: PrimitiveEvent;
        if (kind < 0.5) {
          e = {
            t: "moneyTransfer",
            from: pick(rand, moneyHolders),
            to: pick(rand, moneyHolders),
            amount: 1 + Math.floor(rand() * 200),
          };
        } else if (kind < 0.8) {
          e = {
            t: "shareTransfer",
            company: "AA",
            from: pick(rand, shareHolders),
            to: pick(rand, shareHolders),
            units: 1 + Math.floor(rand() * 3),
          };
        } else {
          const asset = pick(rand, assets);
          e = { t: "assetTransfer", asset, from: s.assets[asset] ?? "bank", to: pick(rand, assetHolders) };
        }
        s = reduce(s, e);
      }
      expect(totals(s), `run ${run}`).toEqual(start);
    }
  });
});
