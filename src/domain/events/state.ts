import type { GameDefinition } from "../games/schema";
import type { AssetId, CellRef, CompanyId, HolderRef, Player, PlayerId } from "../types";
import { assetKind, parseHolder } from "../types";
import type { CompanyStatus, Round } from "./types";

/**
 * The raw reduced state. Everything here is derived from the log (constitution I). Per-entity
 * views (PlayerState, CompanyState of data-model §3 and §5) are computed by the selectors below.
 */

export interface CompanyRecord {
  readonly status: CompanyStatus;
  readonly parPrice?: number;
  readonly position?: CellRef;
  /** Arrival sequence within a cell: higher = underneath (1848 §11.3). */
  readonly stackOrder: number;
  readonly floatConfirmed: boolean;
  readonly capitalPending: boolean;
  readonly shareCount: number;
}

export interface TurnState {
  readonly round: Round;
  readonly srNumber: number;
  readonly orSet: number;
  readonly orIndex: number;
  readonly orsInSet: number;
  readonly scheduleIndex?: number;
  readonly operatingOrder: readonly CompanyId[];
  readonly currentCompany?: CompanyId;
  readonly phase: string;
  /** Derived: loan markers received per company in this OR. */
  readonly loansThisOR: Readonly<Record<CompanyId, number>>;
  /** Derived: companies with a recorded run in this OR. */
  readonly operatedThisOR: readonly CompanyId[];
  /** Derived: the current round's end step has been applied. */
  readonly roundEnded?: true;
}

export interface SessionState {
  readonly money: Readonly<Record<string, number>>;
  /** holder → company → units */
  readonly holdings: Readonly<Record<string, Readonly<Record<CompanyId, number>>>>;
  /** company → holder of the presidency certificate (null for a national company) */
  readonly presidency: Readonly<Record<CompanyId, HolderRef | null>>;
  /** asset → holder */
  readonly assets: Readonly<Record<AssetId, HolderRef>>;
  readonly companies: Readonly<Record<CompanyId, CompanyRecord>>;
  /** subject → key → value (debt, runs, bankrupt, eastWestTokens, nationalTakeovers, …) */
  readonly counters: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly turn: TurnState;
  /** Derived: companies each player sold to the pool in the current SR. */
  readonly soldThisSR: Readonly<Record<PlayerId, readonly CompanyId[]>>;
}

export function trainAssetIds(game: GameDefinition): { inBank: AssetId[]; reserve: AssetId[] } {
  const inBank: AssetId[] = [];
  const reserve: AssetId[] = [];
  for (const train of game.trains) {
    if (train.count === "unlimited") continue;
    for (let n = 1; n <= train.count; n++) inBank.push(`train:${train.type}:${n}`);
    for (let n = 1; n <= (train.reserve ?? 0); n++) reserve.push(`train:${train.type}:${train.count + n}`);
  }
  return { inBank, reserve };
}

/**
 * The state before the first group: the bank holds its total, initial treasuries hold their
 * money and assets (outside the bank total), every share is in its IPO with the presidency
 * there too, and privates and trains are in the bank (reserve trains in `removed`).
 */
export function initialState(game: GameDefinition, players: readonly Player[]): SessionState {
  const money: Record<string, number> = { bank: game.bank === "unlimited" ? 0 : game.bank.total };
  for (const p of players) money[`player:${p.id}`] = 0;
  for (const c of game.companies) money[`company:${c.id}`] = 0;

  const holdings: Record<string, Record<CompanyId, number>> = {};
  const presidency: Record<CompanyId, HolderRef | null> = {};
  const companies: Record<CompanyId, CompanyRecord> = {};
  for (const c of game.companies) {
    holdings[`ipo:${c.id}`] = { [c.id]: c.shareCount };
    presidency[c.id] = c.presidencyUnits > 0 ? `ipo:${c.id}` : null;
    companies[c.id] = {
      status: "unstarted",
      stackOrder: 0,
      floatConfirmed: false,
      capitalPending: false,
      shareCount: c.shareCount,
    };
  }

  const assets: Record<AssetId, HolderRef> = {};
  for (const p of game.privates) assets[`private:${p.id}`] = "bank";
  const trains = trainAssetIds(game);
  for (const t of trains.inBank) assets[t] = "bank";
  for (const t of trains.reserve) assets[t] = "removed";

  for (const t of game.initialTreasuries) {
    const ref: HolderRef = `company:${t.company}`;
    money[ref] = (money[ref] ?? 0) + t.money;
    for (const a of t.assets) assets[a] = ref;
  }

  const firstPhase = game.phases[0];
  return {
    money,
    holdings,
    presidency,
    assets,
    companies,
    counters: {},
    turn: {
      round: "PRIVATES",
      srNumber: 0,
      orSet: 0,
      orIndex: 0,
      orsInSet: firstPhase?.orsPerSet ?? 1,
      ...(game.roundSchedule.type === "fixed" ? { scheduleIndex: 0 } : {}),
      operatingOrder: [],
      phase: firstPhase?.id ?? "",
      loansThisOR: {},
      operatedThisOR: [],
    },
    soldThisSR: {},
  };
}

// ---------------------------------------------------------------------------------------------
// Selectors

export const cashOf = (s: SessionState, holder: HolderRef): number => s.money[holder] ?? 0;

export const unitsOf = (s: SessionState, holder: HolderRef, company: CompanyId): number =>
  s.holdings[holder]?.[company] ?? 0;

export const presidencyHolder = (s: SessionState, company: CompanyId): HolderRef | null =>
  s.presidency[company] ?? null;

/** The president is always a player (data-model §5). */
export function presidentOf(s: SessionState, company: CompanyId): PlayerId | undefined {
  const holder = presidencyHolder(s, company);
  if (!holder) return undefined;
  const parsed = parseHolder(holder);
  return parsed.kind === "player" ? parsed.id : undefined;
}

/** Every holder with a non-zero number of units of a company. */
export function holdersOf(s: SessionState, company: CompanyId): [HolderRef, number][] {
  const result: [HolderRef, number][] = [];
  for (const [holder, byCompany] of Object.entries(s.holdings)) {
    const units = byCompany[company] ?? 0;
    if (units !== 0) result.push([holder as HolderRef, units]);
  }
  return result;
}

export function assetsHeldBy(s: SessionState, holder: HolderRef, kind?: "train" | "private" | "loan"): AssetId[] {
  return Object.entries(s.assets)
    .filter(([asset, h]) => h === holder && (!kind || assetKind(asset) === kind))
    .map(([asset]) => asset)
    .sort(compareAssetIds);
}

export function compareAssetIds(a: AssetId, b: AssetId): number {
  const pa = a.split(":");
  const pb = b.split(":");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "";
    const y = pb[i] ?? "";
    const nx = Number(x);
    const ny = Number(y);
    const cmp = Number.isFinite(nx) && Number.isFinite(ny) && x !== "" && y !== "" ? nx - ny : x.localeCompare(y);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

export const counterOf = (s: SessionState, subject: HolderRef, key: string): number => s.counters[subject]?.[key] ?? 0;

export const hasOperated = (s: SessionState, company: CompanyId): boolean =>
  counterOf(s, `company:${company}`, "runs") > 0;

export const isPlayerBankrupt = (s: SessionState, player: PlayerId): boolean =>
  counterOf(s, `player:${player}`, "bankrupt") > 0;

/** Units that have left the IPO by any route (floatCounts: "soldFromIpo"). */
export function unitsOutOfIpo(s: SessionState, company: CompanyId): number {
  const record = s.companies[company];
  if (!record) return 0;
  return record.shareCount - unitsOf(s, `ipo:${company}`, company);
}

/** Certificates a player holds, where a presidency counts once (data-model §3). */
export function certificateCount(game: GameDefinition, s: SessionState, player: PlayerId): number {
  const ref: HolderRef = `player:${player}`;
  let count = 0;
  for (const c of game.companies) {
    const units = unitsOf(s, ref, c.id);
    if (units <= 0) continue;
    if (presidencyHolder(s, c.id) === ref) count += 1 + Math.max(0, units - c.presidencyUnits);
    else count += units;
  }
  return count;
}
