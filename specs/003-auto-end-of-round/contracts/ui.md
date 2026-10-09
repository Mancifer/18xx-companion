# Contract: Round Controls

**Feature**: [../spec.md](../spec.md) · Screen: `src/ui/screens/Table.tsx`

| Round | Before | After |
|-------|--------|-------|
| PRIVATES | Comprar privada · Empezar ronda de acciones · Empezar OR | unchanged |
| SR | Comprar privada · Lote de acciones · **Fin de ronda de acciones** · Empezar ronda corporativa (CR games) · Empezar OR | Comprar privada · Lote de acciones · Empezar ronda corporativa (CR games) · Empezar OR |
| CR | **Fin de ronda corporativa** · Empezar ronda de acciones · Empezar OR | Empezar ronda de acciones · Empezar OR |
| OR | unchanged (feature 002) | unchanged |

- Each "Empezar …" button dispatches its action as today. The end step is inside that action, so the button shows no extra prompt. The undo toast lists the capital flows and the effects (for example "fin de la ronda de acciones · PRR → 82").
- No button for an end step remains. "fin de la ronda de acciones" and "fin de la ronda corporativa" stay available by voice only.
- SR → OR takes one tap (SC-003).
