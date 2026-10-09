import { useState } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import type { Action } from "../../domain/actions/schemas";
import { holderName, summaryEs } from "../../domain/i18n/es";
import { formatMoney } from "../../domain/i18n/format";
import type { EffectiveGroup } from "../../domain/ledger/effectiveLog";
import type { HolderRef } from "../../domain/types";
import { editableFields, getField, setField, type ActionField } from "../actionFields";
import { DependentsDialog } from "../components/DependentsDialog";
import { Keypad } from "../components/Keypad";
import { Sheet } from "../components/Sheet";

/**
 * Correct a past entry (FR-013, US2-2): the original action's fields, prefilled. The correction
 * is expanded against the state at the original position; later entries keep what they recorded.
 */
export function AmendSheet({
  groupId,
  action,
  onClose,
}: {
  groupId: string;
  action: Action;
  onClose: () => void;
}) {
  const { meta } = useSession();
  const { amend } = useDispatch();
  const [draft, setDraft] = useState<Record<string, unknown>>(action as unknown as Record<string, unknown>);
  const [editing, setEditing] = useState<number | null>(null);
  const [dependents, setDependents] = useState<readonly EffectiveGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctx = {
    game: meta.game,
    players: meta.players,
    holderName: (h: HolderRef) => holderName(h, meta.game, meta.players),
  };
  const fields = editableFields(action, ctx);

  const submit = async (confirmed: boolean) => {
    setError(null);
    const result = await amend(groupId, draft, { confirmed });
    if (result.ok) {
      onClose();
      return;
    }
    if (result.error === "dependents") setDependents(result.dependents);
    else setError(result.error === "invalid" ? `${result.messageEs}: ${result.issues.join("; ")}` : result.messageEs);
  };

  if (dependents) {
    return (
      <DependentsDialog
        dependents={dependents}
        onCancel={() => setDependents(null)}
        onConfirm={() => {
          setDependents(null);
          void submit(true);
        }}
      />
    );
  }

  if (!fields || fields.length === 0) {
    return (
      <Sheet title="Corregir" onClose={onClose}>
        <p>Esta entrada no se puede corregir aquí. Deshazla y vuelve a anotarla.</p>
      </Sheet>
    );
  }

  const editingField = editing !== null ? fields[editing] : undefined;
  if (editingField && (editingField.kind === "number" || editingField.kind === "signed")) {
    return (
      <NumberEditor
        field={editingField}
        value={getField(draft, editingField.path) as number}
        currency={meta.game}
        onDone={(value) => {
          setDraft((d) => setField(d, editingField.path, value));
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <Sheet title="Corregir" onClose={onClose}>
      <p className="muted">
        Original: <s>{summaryEs(action, { game: meta.game, players: meta.players })}</s>
      </p>
      <div className="stack">
        {fields.map((f, i) => (
          <FieldRow
            key={f.path.join(".")}
            field={f}
            value={getField(draft, f.path)}
            currency={meta.game}
            onEdit={() => setEditing(i)}
            onChange={(v) => setDraft((d) => setField(d, f.path, v))}
          />
        ))}
      </div>
      {error ? <p className="toast-warning">{error}</p> : null}
      <p>
        Queda: <strong>{summaryEs(draft as unknown as Action, { game: meta.game, players: meta.players })}</strong>
      </p>
      <button className="primary" onClick={() => void submit(false)}>
        Corregir
      </button>
    </Sheet>
  );
}

function FieldRow({
  field,
  value,
  currency,
  onEdit,
  onChange,
}: {
  field: ActionField;
  value: unknown;
  currency: { currency: { symbol: string } };
  onEdit: () => void;
  onChange: (value: unknown) => void;
}) {
  if (field.kind === "number" || field.kind === "signed") {
    return (
      <button className="field-row" onClick={onEdit} aria-label={`${field.label}: ${String(value)}`}>
        <span className="label">{field.label}</span>
        <span className="money">
          {typeof value !== "number" ? "—" : field.money ? formatMoney(value, currency) : value}
        </span>
      </button>
    );
  }
  if (field.kind === "text") {
    return (
      <label className="field-row">
        <span className="label">{field.label}</span>
        <input value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  return (
    <fieldset className="choice-fieldset">
      <legend className="muted">{field.label}</legend>
      <div className="choice-grid">
        {(field.options ?? []).map((o) => (
          <button key={String(o.value)} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function NumberEditor({
  field,
  value,
  currency,
  onDone,
  onClose,
}: {
  field: ActionField;
  value: number;
  currency: { currency: { symbol: string } };
  onDone: (value: number) => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState<number | null>(Math.abs(value));
  const [negative, setNegative] = useState(value < 0);
  return (
    <Sheet title={field.label} onClose={onClose}>
      {field.kind === "signed" ? (
        <div className="row">
          <button aria-pressed={!negative} onClick={() => setNegative(false)}>
            + Suma
          </button>
          <button aria-pressed={negative} onClick={() => setNegative(true)}>
            − Resta
          </button>
        </div>
      ) : null}
      <Keypad
        value={amount}
        onChange={setAmount}
        game={field.money ? currency : { currency: { symbol: "" } }}
        label={field.label}
      />
      <button
        className="primary"
        disabled={amount === null}
        onClick={() => onDone(negative ? -(amount ?? 0) : (amount ?? 0))}
      >
        Listo
      </button>
    </Sheet>
  );
}
