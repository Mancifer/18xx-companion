# Quickstart & Validation Guide: 18xx Companion MVP

This guide proves the feature works end to end. Contracts:
[actions](./contracts/actions.md), [events](./contracts/events.md),
[voice tools](./contracts/voice-tools.md), [export](./contracts/export-format.md),
[game definition](./contracts/game-definition.md). Entities: [data-model.md](./data-model.md).

## Prerequisites

- Node.js 22 LTS and npm 10.
- Chrome (Android or desktop) or Safari (iOS 17+) for voice. Any modern browser for touch.
- For voice and the eval: an Anthropic API key.

## Setup and quality gates

```bash
npm install
npm run typecheck      # tsc --noEmit (strict)
npm run lint
npm test               # vitest: domain, games, persistence, components
npm run test:e2e       # playwright: phone portrait + tablet landscape projects
npm run dev            # http://localhost:5173
npm run build && npm run preview   # PWA build, used for the offline and install checks
```

All four gates must pass before merging (constitution, Quality Gates).

## Automated validation map

| Spec item | Proven by |
|---|---|
| Money and share invariants (FR-015, SC-002) | `tests/domain/invariants.test.ts`, plus a property test of random action sequences per game |
| 1830 payouts, routing, moves (US3) | `tests/games/1830.test.ts` (values from research R14) |
| 1848 loans, BoE, receivership (FR-111..113) | `tests/games/1848.test.ts`, with cases cited by rulebook § |
| Undo / amend / dependencies (US2) | `tests/domain/ledger.test.ts` |
| Chips (US6) | `tests/domain/chips.test.ts`: 287 → 2×100 1×50 3×10 1×5 2×1; 30 paid with 50 → 2×10; limited counts |
| Persistence and resume (FR-090, SC-007) | `tests/persistence/*.test.ts` (fake-indexeddb), `e2e/reload.spec.ts` |
| Export without the key (FR-092) | `tests/persistence/export.test.ts` |
| 2-tap flows (FR-100, SC-006) | `tests/ui/taps.test.tsx`: counts taps from Table to applied for payout, buy, sell, next, undo |
| Voice parsing and degradation (US5) | `tests/voice/*.test.ts` with recorded API responses (no network) |
| Voice accuracy and latency (SC-003/004) | `npm run eval:voice -- --model <id>` (needs `ANTHROPIC_API_KEY`) |

## Manual scenarios

Run against `npm run preview` on a phone (or DevTools device mode).

1. **Setup and transfers (US1)**: New session → 1830 → 4 players (Ana, Bruno, Carla, Dani) →
   wallet mode "app is the source of truth". Expect $600 each and bank $9,600. Transfer 100
   from Ana to the bank. Expect Ana $500, bank $9,700, and a toast with Undo and chips. No
   invariant badge.
2. **Resume (US1-3, SC-007)**: Kill the tab and reopen. Home → Resume. The state is identical,
   and History shows the transfer.
3. **Payout (US3-1)**: Set holdings with manual share transfers or a quick SR: Ana 60%,
   Bruno 20%, pool 20% of PRR, floated. Operate PRR → 240 → Pay. Expect Ana +144, Bruno +48,
   and the pool's 48 per the 1830 definition (company treasury). The price moves right 1.
   Tap count after entering revenue is ≤ 2.
4. **Amend (US2-2)**: History → the payout → Amend → 260. Balances reflect 260, the original
   shows as amended, and the dependent-entries warning appears if later entries touch PRR.
5. **1848 loan and receivership (US3-6)**: New 1848 session (4 players, £630 each, bank
   £7,480, BoE £2,000). Reach phase 3 (buy a 3-train), then take a loan for a floated company.
   Expect company +£100, BoE −£100, the loan count at 1, the company price 2 left, the BoE
   price up 1, and no "repay" action offered. Then use Market → drag the company into the
   hatched area. Expect the receivership card: compensation per non-director share at par,
   treasury to the bank, trains removed, status "en quiebra / administrada por el BoE".
6. **Stock batch (US4-5)**: Enter a batch of 3 buys and 2 sells. One card shows them in
   order with editable assumed prices.
7. **Voice (US5)**: Settings → API key, es-ES. With PRR operating, hold the mic and say "240,
   paga". A card appears within 3 s, and nothing changes until Confirm. Say "compra un 4 y paga
   290": one card with two actions. Say "¿cuánto tiene Ana?": the answer comes from state. Turn
   on airplane mode: the mic shows as unavailable and touch payout still works.
8. **Chips (US6)**: Chip set 1/5/10/50/100/500. A bank payout of 287 shows 2×100, 1×50, 3×10,
   1×5, 2×1.
9. **Turns and market (US7)**: Finish an SR → Start OR. The indicator shows "OR 1.1", and the
   order is by price. Next through all companies, then a prompt to start the SR. Drag a token
   on the Market: History shows a manual override.
10. **Export and import (US8)**: Export mid-game, open the JSON, and search for the key prefix
   `sk-ant`: not found. Import in a private window: identical state and no hash warning.
11. **Offline PWA (FR-093)**: Install the app, go offline, and reload. The app loads, and all
   touch flows work.
12. **21Moon (R15)**: New 21Moon session with 4 players (₡410 each, the bank shows "ilimitado").
   Ana starts VH at 70 → she pays ₡140 **to VH**, not to the bank. Three IPO buys at 70 → VH
   floats at 50% with ₡350 in its treasury. In OR 1.1 VH runs local 60 / Space Port 40. Expect
   +60 to the treasury, dividends of 4 per share to the holders (none for IPO shares), and
   **right 1** (40 ≥ 70 / 2). Amend Space Port to 30: no move (0 < 30 < 35). Amend to 0: left
   1. In CR 1, VH issues 1 share. Expect ipo → pool, bank → VH at the current price, and down 1.
   At the end of the CR, VH has a share in the pool, so it moves down 1 more.
13. **1830 capital timing (R14)**: A company reaching 60% mid-SR shows "flotada (capital al final
   de la ronda)". Its treasury receives 10 × par only on `endSR`.
14. **Security (R17)**: In DevTools, the CSP header or meta blocks an injected
   `<script src="https://example.com">`. With "no recordar la clave" on, reload → the key is gone
   and the mic shows as unavailable.
