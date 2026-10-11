import { useState } from "react";
import type { GameDefinition } from "../../domain/games/schema";
import { formatMoney } from "../../domain/i18n/format";
import type { MoneyFlow } from "../../domain/ledger/flows";
import { breakdown, change, chipLabel, type ChipBreakdown } from "../../domain/mechanics/chips";
import type { ChipSet } from "../../domain/types";

function Discs({ result, set }: { result: ChipBreakdown; set: ChipSet }) {
  if (!result) return <span className="muted">no hay cambio exacto</span>;
  if (result.chips.length === 0) return <span className="muted">sin fichas</span>;
  return (
    <span className="chip-discs">
      {result.chips.map((c) => {
        const chip = set.chips.find((x) => x.value === c.value);
        const text = chip ? chipLabel(chip) : c.value;
        return (
          <span key={c.value} className="chip" aria-label={`${c.count} × ${text}`}>
            <span className="chip-disc" style={{ background: chip?.color ?? "#888" }} aria-hidden="true" />
            <span className="chip-text">
              {c.count}×{text}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * The chips for one bank flow (FR-081, US6): colored discs with count and value label (never
 * color alone). For a payment to the bank, "pagó con…" picks a larger chip and shows the change.
 */
export function ChipStrip({
  flow,
  label,
  set,
  game,
}: {
  flow: MoneyFlow;
  label: string;
  set: ChipSet;
  game: Pick<GameDefinition, "currency">;
}) {
  const [paidWith, setPaidWith] = useState<number | null>(null);
  const larger = set.chips.filter((c) => c.value > flow.amount).map((c) => c.value);
  return (
    <div className="chip-strip">
      <span className="chip-label">
        {label} {formatMoney(flow.amount, game)}:
      </span>
      <Discs result={breakdown(set, flow.amount)} set={set} />
      {flow.direction === "toBank" && larger.length > 0 ? (
        <span className="chip-paid-with">
          <span className="muted">pagó con</span>
          {larger.slice(-2).map((v) => (
            <button key={v} className="chip-button" aria-pressed={paidWith === v} onClick={() => setPaidWith(paidWith === v ? null : v)}>
              {chipLabel(set.chips.find((c) => c.value === v) ?? { value: v })}
            </button>
          ))}
        </span>
      ) : null}
      {paidWith !== null ? (
        <span className="chip-change">
          <span className="muted">cambio:</span> <Discs result={change(set, paidWith, flow.amount)} set={set} />
        </span>
      ) : null}
    </div>
  );
}
