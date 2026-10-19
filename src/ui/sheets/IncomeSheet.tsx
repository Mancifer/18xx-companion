import { useEffect, useMemo, useState } from "react";
import { useSession } from "../../app/useSession";
import { formatMoney } from "../../domain/i18n/format";
import { INCOME_ES, summaryEs } from "../../domain/i18n/es";
import { operatingPhase, type PlayerSettlement, type SettlementMovement } from "../../domain/ledger/operatingPhase";
import { breakdown } from "../../domain/mechanics/chips";
import { ChipDiscs } from "../components/ChipStrip";
import { RichText } from "../components/RichText";
import { Sheet } from "../components/Sheet";

/**
 * What each player takes from or pays to the bank at the end of the ORs (feature 012,
 * contracts/ui.md §2): cash now minus cash when the operating phase started. Read-only.
 */
export function IncomeSheet({ onClose }: { onClose: () => void }) {
  const { meta, state, effective } = useSession();
  const phase = useMemo(() => operatingPhase(meta.game, meta.players, effective, state), [meta.game, meta.players, effective, state]);
  // An undo can end the phase while the sheet is open: there is nothing left to show.
  useEffect(() => {
    if (!phase) onClose();
  }, [phase, onClose]);
  if (!phase) return null;

  const settled = phase.players.every((p) => p.out || p.delta === 0);
  return (
    <Sheet title={INCOME_ES.title} onClose={onClose}>
      <p className="muted">{INCOME_ES.since(`${phase.firstOR.orSet}.${phase.firstOR.orIndex}`)}</p>
      <p className="income-rule">{INCOME_ES.rule}</p>
      {settled ? <p>{INCOME_ES.allSettled}</p> : null}
      <ul className="income-list">
        {phase.players.map((p) => (
          <IncomeRow key={p.player} settlement={p} />
        ))}
      </ul>
    </Sheet>
  );
}

function IncomeRow({ settlement: p }: { settlement: PlayerSettlement }) {
  const { meta } = useSession();
  const [expanded, setExpanded] = useState(false);
  const player = meta.players.find((x) => x.id === p.player);
  const money = (n: number) => formatMoney(n, meta.game);
  const name = (
    <span className="income-name">
      <span className="swatch" style={{ background: player?.color }} aria-hidden="true" />
      {player?.name ?? p.player}
    </span>
  );
  if (p.out) {
    return (
      <li className="income-card" data-testid={`income-${p.player}`}>
        <div className="income-summary">
          <span className="income-head">
            {name}
            <span className="income-amount income-amount--none">{INCOME_ES.out}</span>
          </span>
        </div>
      </li>
    );
  }
  const chips = p.delta !== 0 ? breakdown(meta.chipSet, Math.abs(p.delta)) : undefined;
  return (
    <li className="income-card" data-testid={`income-${p.player}`}>
      <button className="income-summary income-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <span className="income-head">
          {name}
          {p.delta > 0 ? (
            <span className="income-amount income-take">↑ {INCOME_ES.take(money(p.delta))}</span>
          ) : p.delta < 0 ? (
            <span className="income-amount income-pay">↓ {INCOME_ES.pay(money(-p.delta))}</span>
          ) : (
            <span className="income-amount income-amount--none">{INCOME_ES.none}</span>
          )}
        </span>
        {p.delta !== 0 ? (
          chips ? (
            <ChipDiscs chips={chips.chips} set={meta.chipSet} />
          ) : (
            <span className="muted">no hay cambio exacto</span>
          )
        ) : null}
        <span className="income-balances">
          <span>
            {INCOME_ES.startCash} {money(p.startCash)} → {INCOME_ES.cashNow} {money(p.cash)}
          </span>
          <span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
        </span>
      </button>
      {expanded ? <Movements movements={p.movements} /> : null}
    </li>
  );
}

/** The entries behind an amount, under one heading per OR (US3, research R3). */
function Movements({ movements }: { movements: readonly SettlementMovement[] }) {
  const { meta } = useSession();
  const ctx = { game: meta.game, players: meta.players, marks: true as const };
  const byOR: { key: string; or: SettlementMovement["or"]; items: SettlementMovement[] }[] = [];
  for (const m of movements) {
    const key = `${m.or.orSet}.${m.or.orIndex}`;
    const last = byOR.at(-1);
    if (last?.key === key) last.items.push(m);
    else byOR.push({ key, or: m.or, items: [m] });
  }
  return (
    <div className="income-movements">
      {byOR.map((section) => (
        <section key={section.key}>
          <h4 className="income-or">{INCOME_ES.orHeading(section.or.orSet, section.or.orIndex)}</h4>
          <ul>
            {section.items.map((m) => (
              <li key={m.groupId} className="income-movement">
                <span>
                  <RichText text={summaryEs(m.action, ctx)} />
                </span>
                <span className="income-movement-amount">
                  {m.amount > 0 ? "+" : ""}
                  {formatMoney(m.amount, meta.game)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
