/**
 * Feature 014 (contracts/catalogs.md): the custom-rule (mechanics) message codes and their
 * params: mergers, landmarks, auctions, loans, forced purchases, private grants, the corporate
 * round, float conditions. Params hold raw ids, amounts and counts.
 */

type None = Record<string, never>;

export interface MechanicsMessages {
  readonly notMergerRound: None;
  readonly unknownIdentity: None;
  /** `president`: a player id; `minor`: the minor whose presidency decides. */
  readonly presidencyTie: { readonly units: number; readonly president: string; readonly minor: string };
  readonly "merge.sameMinor": None;
  readonly "merge.notFloated": None;
  readonly "merge.intoNotUnstarted": None;
  readonly "merge.notDue": None;
  readonly "landmark.notOnMarket": None;
  readonly landmarkUsed: { readonly landmark: "rock" | "canyon" };
  readonly cliffTwice: None;
  readonly trainNotOwned: None;
  readonly "landmark.noRustedTrain": None;
  readonly canyonEarly: { readonly type: string };
  readonly minBid: { readonly amount: number };
  readonly bidStep: { readonly step: number };
  readonly launchPriceClamped: { readonly half: number; readonly price: number };
  readonly notTrackPrice: { readonly price: number };
  readonly noLeadoffTrain: None;
  readonly "launch.notAuction": None;
  readonly "loan.none": None;
  readonly "loan.notYet": { readonly phase: string };
  readonly "loan.noneLeft": None;
  readonly loanLimit: { readonly count: number; readonly limit: number };
  readonly loanSupply: { readonly left: number };
  readonly hasTrain: None;
  readonly presidencyChange: None;
  /** `trigger`: 1 when the forced purchase is already happening (21Moon trigger). */
  readonly presidentShort: { readonly trigger?: number };
  readonly "company.noPresident": None;
  readonly grantPar: None;
  readonly "private.notPlayers": None;
  readonly "exchange.notExchangeable": None;
  readonly "exchange.pickCompany": None;
  readonly "exchange.onlyFor": { readonly company: string };
  readonly "exchange.onlyIpo": None;
  readonly "exchange.onlyPool": None;
  readonly "exchange.noneInIpo": None;
  readonly "exchange.noneInPool": None;
  readonly "round.onlyCR": None;
  readonly "round.crEnded": None;
  readonly "float.noCondition": None;
  readonly "float.alreadyConfirmed": None;
  readonly "nationalBank.none": None;
  /** With `difference`: 1, the president pays the difference (corporate bankruptcy rule). */
  readonly forcedPurchase: { readonly fromPresident?: number; readonly lent?: number; readonly difference?: number };
}
