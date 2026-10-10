import { applyOptions, getBuiltInGame } from "../../src/domain/games";
import type { PrimitiveEvent } from "../../src/domain/events/types";
import { floorToTrack } from "../../src/domain/mechanics/market";
import type { AssetId, HolderRef } from "../../src/domain/types";
import { TestSession, makePlayers } from "./dispatch";

/** Helpers for RotLA domain tests (feature 004). */

export const ROTLA_NAMES = ["Ana", "Bruno", "Carla", "Dani", "Eva"];

export function rotlaGame(options: Readonly<Record<string, string>> = {}) {
  return applyOptions(getBuiltInGame("rotla"), options);
}

/** A started RotLA session (createSession applied) with the first n of Ana, Bruno, Carla, … */
export function rotlaSession({ players = 3, options = {} }: { players?: number; options?: Readonly<Record<string, string>> } = {}) {
  return TestSession.start(rotlaGame(options), makePlayers(ROTLA_NAMES.slice(0, players)));
}

export interface RotlaSeed {
  /** A track price; the token arrives at the bottom of that cell's stack. */
  readonly price: number;
  /**
   * Units per holder ("player:p1", "company:TUN", "pool"), taken from the IPO. The first player
   * listed gets the president's certificate.
   */
  readonly holders?: Readonly<Record<string, number>>;
  /** Treasury cash. */
  readonly treasury?: number;
  readonly trains?: readonly AssetId[];
  /** Sets the `runs` counter, so the company has operated. */
  readonly operated?: boolean;
}

/** Places a minor or major in play with raw primitives (no launch or merger action). */
export function seedCompany(s: TestSession, company: string, seed: RotlaSeed): TestSession {
  const events: PrimitiveEvent[] = [
    { t: "companyStatus", company, status: "floated", parPrice: seed.price },
    { t: "marketMove", company, to: floorToTrack(s.game, seed.price), reason: "par" },
  ];
  let presidentDone = false;
  for (const [holder, units] of Object.entries(seed.holders ?? {})) {
    const president = !presidentDone && holder.startsWith("player:");
    if (president) presidentDone = true;
    events.push({
      t: "shareTransfer",
      company,
      from: `ipo:${company}`,
      to: holder as HolderRef,
      units,
      ...(president ? { presidency: true } : {}),
    });
  }
  if (seed.treasury) events.push({ t: "moneyTransfer", from: "bank", to: `company:${company}`, amount: seed.treasury });
  for (const asset of seed.trains ?? []) {
    events.push({ t: "assetTransfer", asset, from: s.state.assets[asset] ?? "bank", to: `company:${company}` });
  }
  if (seed.operated) events.push({ t: "counterChange", subject: `company:${company}`, key: "runs", delta: 1 });
  return s.apply(...events);
}

/** Bank-held trains by type, in definition order: "7/5/4/3/2" style counts. */
export function bankTrainCounts(s: TestSession): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [asset, holder] of Object.entries(s.state.assets)) {
    if (holder !== "bank" || !asset.startsWith("train:")) continue;
    const type = asset.split(":")[1]!;
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}
