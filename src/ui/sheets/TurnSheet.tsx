import { useState } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import type { Round } from "../../domain/events/types";
import { CompanyBadge } from "../components/CompanyBadge";
import { Sheet } from "../components/Sheet";
import { useText } from "../../app/language";

const ROUNDS = ["PRIVATES", "SR", "CR", "OR"] as const satisfies readonly Round[];

function Stepper({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (v: number) => void; min?: number }) {
  const t = useText().sheets.turn;
  return (
    <div className="row">
      <span className="label stepper-label">{label}</span>
      <button aria-label={t.less(label)} onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <span className="money stepper-value">{value}</span>
      <button aria-label={t.more(label)} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

/** Every turn value can be overridden by touch (FR-024, US7): round, numbers, company, phase. */
export function TurnSheet({ onClose }: { onClose: () => void }) {
  const { meta, state } = useSession();
  const { dispatch } = useDispatch();
  const t = useText().sheets.turn;
  const turn = state.turn;
  const [round, setRound] = useState<Round>(turn.round);
  const [srNumber, setSrNumber] = useState(turn.srNumber);
  const [orSet, setOrSet] = useState(turn.orSet);
  const [orIndex, setOrIndex] = useState(turn.orIndex);
  const [orsInSet, setOrsInSet] = useState(turn.orsInSet);
  const [company, setCompany] = useState<string | null>(turn.currentCompany ?? null);
  const done = (r: { ok: boolean }) => {
    if (r.ok) onClose();
  };

  return (
    <Sheet title={t.title} onClose={onClose}>
      <fieldset className="choice-fieldset">
        <legend className="muted">{t.phase}</legend>
        <div className="choice-grid">
          {meta.game.phases.map((p) => (
            <button
              key={p.id}
              aria-pressed={turn.phase === p.id}
              onClick={() => void dispatch({ type: "setPhase", phase: p.id }).then(done)}
            >
              {p.id}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="choice-fieldset">
        <legend className="muted">{t.round}</legend>
        <div className="choice-grid">
          {ROUNDS.map((r) => (
            <button key={r} aria-pressed={round === r} onClick={() => setRound(r)}>
              {t.rounds[r]}
            </button>
          ))}
        </div>
      </fieldset>
      <Stepper label={t.srNumber} value={srNumber} onChange={setSrNumber} />
      <Stepper label={t.orSet} value={orSet} onChange={setOrSet} />
      <Stepper label={t.orIndex} value={orIndex} onChange={setOrIndex} />
      <Stepper label={t.orsInSet} value={orsInSet} onChange={setOrsInSet} min={1} />
      <fieldset className="choice-fieldset">
        <legend className="muted">{t.company}</legend>
        <div className="choice-grid">
          {meta.game.companies.map((c) => (
            <button key={c.id} aria-pressed={company === c.id} onClick={() => setCompany(c.id)}>
              <CompanyBadge company={c} size="sm" />
            </button>
          ))}
        </div>
      </fieldset>
      <button
        className="primary"
        onClick={() =>
          void dispatch({ type: "setTurn", round, srNumber, orSet, orIndex, orsInSet, company }).then(done)
        }
      >
        {t.set}
      </button>
    </Sheet>
  );
}
