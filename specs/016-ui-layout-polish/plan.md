# Implementation Plan: UI Layout Polish

**Branch**: `016-ui-layout-polish` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/016-ui-layout-polish/spec.md`

## Summary

Six presentation stories on the Table, its player sheet, Home and Settings. History becomes a
button in the Table's action row and the share batch moves to the ☰ menu (stock rounds). The
player sheet gets a holdings table (badge, %, ★, certificates, a per-row sell: one-tap in stock
rounds, "Vender…" with the company preselected otherwise) and a certificate total
against the game's limit, from one new tested domain function shared with the existing limit
warning. The mic and voice panel are not rendered when voice has a setup issue (no recognizer,
no recorder, missing key); Home shows a notice with a Settings link instead, and offline keeps
today's disabled mic. On the side-by-side layout, the players pane gets a matching title so both
panes align, and company cards show "Trenes". Settings is regrouped into five titled sections
with one switch control for every on/off setting and a sticky save bar. No events, stored data,
prompts or game definitions change. Details: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript (strict), React

**Primary Dependencies**: React, Vite (PWA); no new runtime dependencies

**Storage**: IndexedDB (unchanged; no new fields)

**Testing**: Vitest + Testing Library (unit/UI), Playwright (e2e)

**Target Platform**: Installable PWA; phone portrait and tablet landscape; Chrome, Safari, Firefox (incl. Firefox for Android)

**Project Type**: Single-project web app (`src/`, `tests/`, `e2e/`)

**Performance Goals**: No perceptible tap delay on the Table when voice is unavailable (SC-004)

**Constraints**: 48 px touch targets; no horizontal overflow at 360 px; color never the only cue; Spanish (Uruguayan) and English text

**Scale/Scope**: ~6 UI files changed, 2 new small components, 1 new domain function; up to 8 holdings per player

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Event-sourced ledger | ✅ | No new events or actions. Quick sell and batch dispatch the same actions as today. |
| II. Money conserved | ✅ | No money logic touched. |
| III. Rules as data, the table wins | ✅ | Limit read from `game.limits.certificates`; over-limit is a text badge, never blocks. No per-game code path. |
| IV. Propose, confirm, undo | ✅ | Undo untouched. Hiding the mic on setup issues degrades to touch, never a dead end; offline keeps its reason shown. |
| V. Voice/touch parity, minimal screen time | ✅ | History 2 → 1 tap; batch via ☰ = 2 taps; sell-one stays 2 taps; 48 px targets; text cues with color; phone portrait + tablet landscape both checked. |
| VI. Test-first domain logic | ✅ | `certificateStatus` written test-first; `holdingWarnings` refactored onto it with its tests kept green. No prompt/tool/provider change → no eval run needed. |
| VII. Local-first simplicity | ✅ | No new dependency, no backend, no stored data. |
| Workflow: `docs/spec.md` | ⚠ action | Product behavior changes (History placement, batch in menu, mic hidden + Home notice, holdings table). `docs/spec.md` MUST be updated in the same change — included as a task. |

**Post-design re-check**: still passing. The one design choice that touched a principle (sell
action per row) kept the 2-tap quick sell instead of a count picker (research R3).

## Project Structure

### Documentation (this feature)

```text
specs/016-ui-layout-polish/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ui.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/actions/limits.ts        # + certificateStatus(); holdingWarnings uses it (US2)
├── app/useVoice.ts                 # + voiceSetupIssue() (US3)
├── ui/
│   ├── screens/
│   │   ├── Table.tsx               # History in action row, batch → menu, mic gating, players title (US1, US3, US4)
│   │   ├── Home.tsx                # voice notice + "Abrir ajustes" (US3)
│   │   └── Settings.tsx            # five groups, Switch, sticky save (US5)
│   ├── components/
│   │   ├── Switch.tsx              # new: shared on/off control (US5)
│   │   ├── HoldingsTable.tsx       # new: rows + certificate total (US2)
│   │   ├── MicButton.tsx           # disabled → no pointer work (US3)
│   │   └── CompanyCard.tsx         # "Trenes" label (US6)
│   ├── sheets/PlayerSheet.tsx      # uses HoldingsTable; old quick-sell row removed (US2)
│   └── styles/{layout,components}.css
└── i18n/{es,en}/ui/*.ts            # new strings (history button, holdings, notice, groups)

tests/
├── domain/limits.test.ts           # certificateStatus (test-first)
├── app/voiceAvailability.test.ts   # voiceSetupIssue
└── ui/{stock,playerSheet,whisper,settings,home}.test.tsx  # updated/added

e2e/{offline,security}.spec.ts      # accept hidden mic; Home notice
docs/spec.md                        # product reference update
```

**Structure Decision**: Existing single-project layout; changes stay in the files that already own
each surface, plus two small shared components.

## Delivery

Stories are independent; suggested order (each shippable alone): US3 (bug) → US1 → US2 → US4 +
US6 (same breakpoint CSS) → US5.

## Complexity Tracking

None — no constitution violations.
