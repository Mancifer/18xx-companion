import { useState } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import type { Round } from "../../domain/events/types";
import { CompanyBadge } from "../components/CompanyBadge";
import { Sheet } from "../components/Sheet";

const ROUNDS: readonly { value: Round; label: string }[] = [
  { value: "PRIVATES", label: "Privadas" },
  { value: "SR", label: "Acciones" },
  { value: "CR", label: "Corporativa" },
  { value: "OR", label: "Operaciones" },
];

function Stepper({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div className="row">
      <span className="label stepper-label">{label}</span>
      <button aria-label={`${label}: menos`} onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <span className="money stepper-value">{value}</span>
      <button aria-label={`${label}: más`} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

/** Every turn value can be overridden by touch (FR-024, US7): round, numbers, company, phase. */
export function TurnSheet({ onClose }: { onClose: () => void }) {
  const { meta, state } = useSession();
  const { dispatch } = useDispatch();
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
    <Sheet title="Turno y fase" onClose={onClose}>
      <fieldset className="choice-fieldset">
        <legend className="muted">Fase</legend>
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
        <legend className="muted">Ronda</legend>
        <div className="choice-grid">
          {ROUNDS.map((r) => (
            <button key={r.value} aria-pressed={round === r.value} onClick={() => setRound(r.value)}>
              {r.label}
            </button>
          ))}
        </div>
      </fieldset>
      <Stepper label="Ronda de acciones" value={srNumber} onChange={setSrNumber} />
      <Stepper label="Set de OR" value={orSet} onChange={setOrSet} />
      <Stepper label="OR del set" value={orIndex} onChange={setOrIndex} />
      <Stepper label="OR por set" value={orsInSet} onChange={setOrsInSet} min={1} />
      <fieldset className="choice-fieldset">
        <legend className="muted">Compañía que opera</legend>
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
        Fijar turno
      </button>
    </Sheet>
  );
}
