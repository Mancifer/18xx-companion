/**
 * Feature 014 (contracts/catalogs.md): game-level message codes: end-of-game notices, New Session
 * and option warnings. Params hold raw ids, amounts and counts.
 */

type None = Record<string, never>;

export interface GameMessages {
  readonly "end.bankBroken": None;
  readonly "end.topCell": None;
  readonly "end.loansIssued": { readonly issued: number; readonly count: number };
  readonly "end.takeovers": { readonly count: number };
  readonly "end.lastRound": None;
  readonly "end.scheduleComplete": None;
  readonly "end.cyclesComplete": { readonly cycles: number };
  readonly "end.bankruptcy": None;
  /** `option`, `value`: the chosen option and choice, named through the game text. */
  readonly recommendedPlayers: { readonly option: string; readonly value: string; readonly min: number; readonly max: number };
  /** A company subset of the wrong size; `option` is its id. */
  readonly subsetSize: { readonly option: string; readonly count: number; readonly expected: number };
  /** The table's chip set (feature 008): values out of order, repeated, or not positive. */
  readonly "chips.order": None;
  readonly "chips.duplicate": None;
  readonly "chips.positive": None;
}
