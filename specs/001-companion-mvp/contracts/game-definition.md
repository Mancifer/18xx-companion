# Contract: Game Definition

Source: `src/domain/games/schema.ts` (Zod). Built-ins: `src/domain/games/{g1830,g1848,g21moon}.ts`.
Field semantics are in [data-model.md §4](../data-model.md#4-game-definition-data-see-contractsgame-definitionmd).
Rule values and their sources are in [research.md](../research.md) R13–R15.

## Rules

1. A definition is **pure data**. Behavior that does not fit goes into `customRules: [{ id,
   config }]`, with `id` from the registry in `src/domain/mechanics/custom/index.ts`
   (`loans`, `nationalBank`, `nationalTakeover`, `bankDebt`, `forcedWithhold`,
   `corporateBankruptcy`, `manualFloatCondition`, `privateGrants`, `corporateRound`; research
   R16). An unknown id fails validation.
2. **Session options** (`options`) are named choices, each applied as a patch to the definition
   when the session is created (for example 1830 `ruleset`: `base` enables `bankDebt` +
   `forcedWithhold`, and `classic` enables `corporateBankruptcy` with game end). The frozen
   session copy is the definition *after* the patch.
3. Every rule-dependent field has an entry in `verification`. The UI shows a "reglas sin
   verificar" badge on the game picker while any entry is `unverified`. A built-in may ship
   with unverified fields only if they are listed in the plan's open items.
4. **Custom games** (FR-007): `customGame = { ...structuredClone(builtIn), id: uuid, basedOn:
   builtIn.id, name }`. Editable through the UI: `name`, `bank.total`, `startingCash`,
   company `name/shortName/aliases/color`, private `name/cost/income`, train `cost/count`,
   `chipPreset`. Not editable in v1: `market`, `phases`, `payoutModes`, `revenueParts`,
   `rounding`, `capitalization`, `roundSchedule`, `customRules`. Custom games are stored in
   IndexedDB `games`, and the built-in objects are never mutated (US1-5).
5. Semantic validation (run in tests for built-ins and on save for custom games): see
   data-model §4.

## Example (abridged 1848)

```ts
export const g1848: GameDefinition = {
  id: "1848", name: "1848 Australia", version: "1.0.0",
  currency: { symbol: "£" },
  playerCount: { min: 3, max: 6 },
  bank: { total: 10000 },
  initialTreasuries: [{ company: "BOE", money: 2000, assets: range(1, 20).map(n => `loan:${n}`) }], // BOE is a CompanyDef with kind "national"
  startingCash: { 3: 840, 4: 630, 5: 510, 6: 430 },
  capitalization: { type: "full", timing: "onFloat" },
  ipoPrice: "par",
  floatPercent: 60,
  unownedDividends: { ipo: "none", pool: "none", treasury: "none" },
  revenueParts: [{ id: "revenue", label: "Ingresos", to: "choice" }],
  payoutModes: ["full", "withhold"],
  rounding: { perShare: "floor", halfRetain: "floorToCompany", unit: 1 },
  orOrder: { by: "priceDesc", ties: ["stackTop", "columnRight"], before: ["BOE"], dynamic: true },
  loans: { amount: 100, lender: "company:BOE", supply: 20, interestPerOR: 0, repayable: false,
           voluntaryLimit: 5, availableFromPhase: "3",
           marketEffect: { first: 2, subsequentInOR: 3, nationalTrackStep: 1 } },
  customRules: [
    { id: "nationalBank", config: { company: "BOE", dividendSource: "bank",
        minDividendByPhase: { "3": 100, "5": 200, "8": 300 } } },
    { id: "nationalTakeover", config: { compensation: "parPerNonDirectorShare", directorLiable: true,
        removeCheapestPermanentTrainAt: [2, 5], endGameAt: 5 } },
    { id: "bankDebt", config: { debtors: ["player"], interest: 0, autoRepayFromIncome: true } },
    { id: "manualFloatCondition", config: { company: "COM", question: "¿Hay enlace Sídney–Adelaida?",
        droppedAtPhase: "6" } },
    { id: "privateGrants", config: {} },
  ],
  market: { /* grid: research R13 */
    tracks: { BOE: { startPrice: 70, byLoansIssued: [80, 90, 100, 110, 120, 130, 140,
              150, 160, 170, 180, 195, 210, 225, 240, 260, 280, 300, 320, 340], endGameAtIndex: 15 } } },
  verification: { /* all fields verified: rulebook, board, or user confirmation (research R13) */ },
  // companies, privates, trains, phases, market …
};
```

## Example (abridged 21Moon: the parts that differ)

```ts
export const g21moon: Partial<GameDefinition> = {
  playerCount: { min: 2, max: 5 },
  bank: "unlimited",
  startingCash: { 2: 600, 3: 540, 4: 410, 5: 340 },
  capitalization: { type: "incremental" },
  ipoPrice: "market",
  floatPercent: 50,
  revenueParts: [{ id: "local", label: "Base local", to: "treasury" },
                 { id: "spacePort", label: "Puerto espacial", to: "dividend" }],
  payoutModes: [],
  unownedDividends: { ipo: "none", pool: "none", treasury: "company" /* user-confirmed */ },
  orOrder: { by: "priceDesc", ties: ["columnRight", "stackTop"], dynamic: true },
  trainLimitScope: { perBase: 2, bases: ["local", "spacePort"] },
  options: [{ id: "lateCompany", label: "Compañía disponible desde SR3", values: ["SWP","HMQ","VH","ITC","SSF","LG","KR"] }],
  roundSchedule: { type: "fixed",
    sequence: ["PRIVATES", ...[1,2,3,4,5].flatMap(n => [`SR${n}`, `CR${n}`, `OR${n}.1`, `OR${n}.2`]), "OR5.3"],
    events: [{ at: "OR4.1", effect: "closePrivates" }] },
  customRules: [{ id: "corporateRound", config: {} }, { id: "forcedWithhold", config: {} },
                { id: "corporateBankruptcy", config: { trigger: "closedCell" } },
                { id: "privateGrants", config: {} }],
};
```
