/** Identity, holders and cells (data-model §1). */

export type PlayerId = string; // "p1".."p7"
export type CompanyId = string; // from the game definition: "PRR", "QR", "BOE", ...
export type PrivateId = string; // "SV", "P1", ...
/** "train:<type>:<n>", "private:<id>", "loan:<n>" */
export type AssetId = string;

export type HolderRef =
  | "bank"
  | `player:${PlayerId}`
  | `company:${CompanyId}`
  | `ipo:${CompanyId}`
  | "pool"
  | "removed";

export type CellRef = { readonly row: number; readonly col: number } | { readonly index: number };

export type ParsedHolder =
  | { kind: "bank" }
  | { kind: "player"; id: PlayerId }
  | { kind: "company"; id: CompanyId }
  | { kind: "ipo"; id: CompanyId }
  | { kind: "pool" }
  | { kind: "removed" };

export const playerRef = (id: PlayerId): HolderRef => `player:${id}`;
export const companyRef = (id: CompanyId): HolderRef => `company:${id}`;
export const ipoRef = (id: CompanyId): HolderRef => `ipo:${id}`;

export function parseHolder(holder: HolderRef): ParsedHolder {
  if (holder === "bank" || holder === "pool" || holder === "removed") return { kind: holder };
  const colon = holder.indexOf(":");
  const kind = holder.slice(0, colon);
  const id = holder.slice(colon + 1);
  if (kind === "player" || kind === "company" || kind === "ipo") return { kind, id };
  throw new Error(`Unknown holder ${holder}`);
}

export function isHolderRef(value: string): value is HolderRef {
  if (value === "bank" || value === "pool" || value === "removed") return true;
  return /^(player|company|ipo):.+$/.test(value);
}

/** Money can be held by the bank, players and company treasuries only. */
export function holdsMoney(holder: HolderRef): boolean {
  const kind = parseHolder(holder).kind;
  return kind === "bank" || kind === "player" || kind === "company";
}

/** Shares can be held by players, companies, IPOs, the pool and `removed`. */
export function holdsShares(holder: HolderRef): boolean {
  return parseHolder(holder).kind !== "bank";
}

export type AssetKind = "train" | "private" | "loan";

export function assetKind(asset: AssetId): AssetKind {
  const kind = asset.slice(0, asset.indexOf(":"));
  if (kind === "train" || kind === "private" || kind === "loan") return kind;
  throw new Error(`Unknown asset ${asset}`);
}

/** "train:4:2" → "4" */
export function trainTypeOf(asset: AssetId): string {
  const parts = asset.split(":");
  return parts[1] ?? "";
}

/** Assets can be held by any holder except an IPO. Only trains may be held by the pool. */
export function holdsAsset(holder: HolderRef, asset: AssetId): boolean {
  const kind = parseHolder(holder).kind;
  if (kind === "ipo") return false;
  if (kind === "pool") return assetKind(asset) === "train";
  return true;
}

export function cellEquals(a: CellRef | undefined, b: CellRef | undefined): boolean {
  if (!a || !b) return false;
  if ("index" in a || "index" in b) return "index" in a && "index" in b && a.index === b.index;
  return a.row === b.row && a.col === b.col;
}

export interface Player {
  readonly id: PlayerId;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly color: string;
  readonly seat: number;
}

export interface Chip {
  readonly value: number;
  readonly color: string;
  readonly label?: string | undefined;
  readonly countAvailable?: number | undefined;
}

export interface ChipSet {
  readonly chips: readonly Chip[];
}

export type WalletMode = "appTruth" | "bankOnly";
