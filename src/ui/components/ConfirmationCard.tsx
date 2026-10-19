import { useState } from "react";
import { useSession } from "../../app/useSession";
import type { Action } from "../../domain/actions/schemas";
import { holderName, proposalSummaryEs } from "../../domain/i18n/es";
import { formatMoney } from "../../domain/i18n/format";
import type { HolderRef } from "../../domain/types";
import type { VoiceResult } from "../../voice/resolve";
import { editableFields, getField, setField, type ActionField } from "../actionFields";
import { ChipStrip, flowLabel } from "./ChipStrip";
import { Keypad } from "./Keypad";
import { RichText } from "./RichText";

type Proposal = Extract<VoiceResult, { kind: "proposal" }>;

/**
 * FR-060: what a voice command will do, before anything changes: the Spanish summary, the money
 * flows with chips (FR-081), warnings, and Confirmar / Editar / Cancelar.
 */
export function ConfirmationCard({
  proposal,
  onConfirm,
  onCancel,
  onEdit,
  extra,
}: {
  proposal: Proposal;
  onConfirm: () => void;
  onCancel: () => void;
  onEdit: (action: Action) => void;
  extra?: React.ReactNode;
}) {
  const { meta, state } = useSession();
  const [editing, setEditing] = useState(false);
  // The same line as proposal.summaryEs, with company badges (feature 013); the voice layer keeps the plain one.
  const summary = proposalSummaryEs(proposal.action, { game: meta.game, players: meta.players, state, marks: true }, proposal.events);
  const name = (h: HolderRef) => holderName(h, meta.game, meta.players);
  const fields =
    proposal.action.type === "compound"
      ? null
      : editableFields(proposal.action, {
          game: meta.game,
          players: meta.players,
          holderName: name,
        });

  if (editing && fields) {
    return <InlineEditor action={proposal.action} fields={fields} onDone={(a) => {
      setEditing(false);
      onEdit(a);
    }} onCancel={() => setEditing(false)} />;
  }

  return (
    <section className="voice-card" role="dialog" aria-label="Confirmar orden de voz">
      <p className="muted transcript">«{proposal.transcript}»</p>
      <p className="voice-summary">
        <RichText text={summary} />
      </p>
      {proposal.warnings.map((w) => (
        <p key={w.code} className="toast-warning">
          ⚠ {w.messageEs}
        </p>
      ))}
      {proposal.action.type === "launchCompany" && meta.chipSet.chips.length > 0 ? (
        // US2-5: the whole bid goes from the player to the new treasury, in chips.
        <ChipStrip
          flow={{ from: `player:${proposal.action.player}`, to: `company:${proposal.action.company}`, amount: proposal.action.bid }}
          set={meta.chipSet}
          game={meta.game}
          label={`${name(`player:${proposal.action.player}`)} entrega`}
        />
      ) : null}
      {proposal.flows.length > 0 ? (
        <ul className="toast-flows">
          {proposal.flows.map((f) => (
            <li key={`${f.from}|${f.to}`}>
              {meta.chipSet.chips.length > 0 ? (
                <ChipStrip
                  flow={f}
                  set={meta.chipSet}
                  game={meta.game}
                  label={flowLabel(f, name)}
                />
              ) : (
                `${name(f.from)} → ${name(f.to)}: ${formatMoney(f.amount, meta.game)}`
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="row">
        <button onClick={onCancel}>Cancelar</button>
        {fields && fields.length > 0 ? <button onClick={() => setEditing(true)}>Editar</button> : null}
        <span className="spacer" />
        {extra}
        <button className="primary big" onClick={onConfirm}>
          Confirmar
        </button>
      </div>
    </section>
  );
}

function InlineEditor({
  action,
  fields,
  onDone,
  onCancel,
}: {
  action: Action;
  fields: ActionField[];
  onDone: (action: Action) => void;
  onCancel: () => void;
}) {
  const { meta } = useSession();
  const [draft, setDraft] = useState<Record<string, unknown>>(action as unknown as Record<string, unknown>);
  const [numberField, setNumberField] = useState<ActionField | null>(null);
  const [amount, setAmount] = useState<number | null>(null);

  if (numberField) {
    return (
      <section className="voice-card" role="dialog" aria-label={numberField.label}>
        <Keypad value={amount} onChange={setAmount} game={numberField.money ? meta.game : { currency: { symbol: "" } }} label={numberField.label} />
        <button
          className="primary"
          disabled={amount === null}
          onClick={() => {
            setDraft((d) => setField(d, numberField.path, amount));
            setNumberField(null);
          }}
        >
          Listo
        </button>
      </section>
    );
  }

  return (
    <section className="voice-card" role="dialog" aria-label="Editar orden de voz">
      {fields.map((f) =>
        f.kind === "number" || f.kind === "signed" ? (
          <button
            key={f.path.join(".")}
            className="field-row"
            onClick={() => {
              setAmount(null);
              setNumberField(f);
            }}
          >
            <span className="label">{f.label}</span>
            <span className="money">{String(getField(draft, f.path))}</span>
          </button>
        ) : f.kind === "choice" ? (
          <fieldset key={f.path.join(".")} className="choice-fieldset">
            <legend className="muted">{f.label}</legend>
            <div className="choice-grid">
              {(f.options ?? []).map((o) => (
                <button
                  key={String(o.value)}
                  aria-pressed={getField(draft, f.path) === o.value}
                  onClick={() => setDraft((d) => setField(d, f.path, o.value))}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null,
      )}
      <div className="row">
        <button onClick={onCancel}>Volver</button>
        <span className="spacer" />
        <button className="primary" onClick={() => onDone(draft as unknown as Action)}>
          Listo
        </button>
      </div>
    </section>
  );
}
