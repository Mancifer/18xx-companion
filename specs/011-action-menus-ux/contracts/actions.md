# Contract: `correctTrain` action

**Feature**: [../spec.md](../spec.md) · **Data model**: [../data-model.md](../data-model.md#1-action-correcttrain-new-recorded)

## Schema (zod, in `src/domain/actions/schemas.ts`)

```ts
export const correctTrainAction = z.object({
  type: z.literal("correctTrain"),
  company: companyId,
  /** An asset id ("train:2:3") or a train type ("2"). */
  train: z.string().min(1),
  op: z.enum(["remove", "add"]),
  /** remove: where it goes. add: null. */
  to: z.enum(["bank", "pool", "removed"]).nullable(),
  /** remove → bank: refund (null = list price, 0 = none). add: payment (null = none). */
  amount: money.nullable(),
});
```

It is added to `ActionSchema`'s union and to the manual handler map, and to `ACTION_TOOLS` after
`adjustMoney`.

## Availability (`unavailable` reasons, Spanish)

| Condition | Reason |
|---|---|
| Unknown company | (existing `companyTarget` message) |
| remove, train not held by the company | "La compañía no tiene ese tren" |
| remove, `to` null | "Falta a dónde va el tren" |
| add, `to` not null | "Al dar un tren no hay destino" |
| add, no train of that type in the bank and the type is not unlimited | "No quedan trenes {type} en la oferta" |
| `to = "pool"` and the game's discarded trains do not go to the pool | "En este juego los trenes no van al pool" (the pool never holds trains in that game; same precedent as `changeTrainSupply`) |

## Warnings (never blocking)

| Code | When | Message |
|---|---|---|
| `phaseStarter` | remove, the type is the current phase's `triggeredBy`, and no train of that type remains held by a company or the pool afterwards | "La fase {phase} empezó con un {type}: la fase y los trenes oxidados no cambian solos. Si hace falta, corregilos en Fase (control de turno)." |
| `notOnSale` | remove to bank, and the type's `rustsOnPhase` has been reached (`phaseReached(game, state, def.rustsOnPhase)`); types with no `rustsOnPhase` never warn | "El {type} ya no se vende en esta fase." |
| `refundOffSupply` | remove to pool or removed with `amount > 0` (the money is still recorded) | "La devolución se registra, aunque el tren no vuelve a la oferta." |
| `bankBroken` | remove to bank, the refund exceeds a finite bank | (existing `payWarnings`) |
| `insufficientCash` | add, the payment exceeds the company's cash | (existing `payWarnings`) |

## Events

See [data-model §1](../data-model.md#1-action-correcttrain-new-recorded). The triggers exempt
`correctTrain` from the phase change and from private closing.

## Summary (`summaryEs`, history, toast, voice card)

| Case | Line |
|---|---|
| remove → bank, refund | "Corrección: la PRR devuelve un 2 a la oferta y recibe $80" |
| remove → bank, no refund | "Corrección: la PRR devuelve un 2 a la oferta" |
| remove → pool | "Corrección: el 2 de la PRR va al pool" |
| remove → removed | "Corrección: el 2 de la PRR queda fuera de juego" |
| add, no money | "Corrección: la PRR recibe un 2 de la oferta" |
| add, payment | "Corrección: la PRR recibe un 2 de la oferta y paga $80" |

## Voice tool

- **Name**: `correctTrain`. Its schema is generated from the zod schema like every tool (the
  `company` enum, the `train` string, the `op`/`to` enums, a nullable `amount`).
- **Description**: «Corregir los trenes de una compañía por un error de registro (no es una
  compra ni un descarte). remove: el tren va a la oferta (bank, con devolución del precio de
  lista salvo amount), al pool o fuera de juego (removed). add: dar un tren de la oferta (amount =
  lo que paga, null = nada). «la PRR no tenía ese dos, devolvelo al banco» · «sacale el tres a la
  B&O, fuera de juego» · «dale un dos a la NYC sin pagar».»

## Unchanged actions relied on

- `sellShares { seller: player:<id>, company, count }` and `buyShare { buyer: player:<id>,
  company, source, count }`, dispatched from the player sheet. Their schemas, availability,
  warnings and expansion do not change.
- `nextCompany`: no schema change. Only its summary changes
  ([data-model §3](../data-model.md#3-round-end-title-for-nextcompany-derived)).
