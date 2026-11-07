import { useState } from "react";
import type { GameDefinition } from "../../domain/games/schema";
import { formatMoney } from "../../i18n/format";
import { useLang, useText } from "../../app/language";
import type { UiText } from "../../i18n/contract/ui";
import type { MoneyFlow } from "../../domain/ledger/flows";
import { breakdown, change, type ChipBreakdown } from "../../domain/mechanics/chips";
import type { ChipSet, HolderRef } from "../../domain/types";

type ChipCount = { readonly value: number; readonly count: number };

/**
 * Chip discs with count and value (never color alone, contracts/ui.md §2). Missing chips (chips
 * the table lacks, feature 008) use the same disc with a dashed outline and "faltan".
 */
export function ChipDiscs({
  chips,
  set,
  missing = [],
}: {
  chips: readonly ChipCount[];
  set: ChipSet;
  missing?: readonly ChipCount[];
}) {
  const t = useText().components.chips;
  const color = (value: number) => set.chips.find((x) => x.value === value)?.color ?? "#888";
  return (
    <span className="chip-discs">
      {chips.map((c) => (
        <span key={c.value} className="chip" aria-label={`${c.count} × ${c.value}`}>
          <span className="chip-disc" style={{ background: color(c.value) }} aria-hidden="true" />
          <span className="chip-text">
            {c.count}×{c.value}
          </span>
        </span>
      ))}
      {missing.map((c) => (
        <span key={`missing-${c.value}`} className="chip chip--missing" aria-label={t.missingAria(c.count, c.value)}>
          <span className="chip-disc chip-disc--missing" style={{ background: color(c.value) }} aria-hidden="true" />
          <span className="chip-text">
            {t.missing}
            {c.count}×{c.value}
          </span>
        </span>
      ))}
    </span>
  );
}

function Discs({ result, set }: { result: ChipBreakdown; set: ChipSet }) {
  const t = useText().components.chips;
  if (!result) return <span className="muted">{t.noExactChange}</span>;
  if (result.chips.length === 0) return <span className="muted">{t.noChips}</span>;
  return <ChipDiscs chips={result.chips} set={set} />;
}

/** "El banco paga a Ana", "Ana paga al banco", "Ana paga a PRR". */
export function flowLabel(flow: MoneyFlow, name: (h: HolderRef) => string, t: UiText["components"]["chips"]): string {
  return t.flow(name(flow.from), flow.to === "bank" ? null : name(flow.to));
}

/**
 * The chips for one money flow (FR-081, US6): colored discs with count and value label (never
 * color alone). Unless the bank pays, "pagó con…" picks a larger chip and shows the change.
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
  const t = useText().components.chips;
  const { lang } = useLang();
  const [paidWith, setPaidWith] = useState<number | null>(null);
  const larger = set.chips.filter((c) => c.value > flow.amount).map((c) => c.value);
  return (
    <div className="chip-strip">
      <span className="chip-label">
        {label} {formatMoney(flow.amount, game, lang)}:
      </span>
      <Discs result={breakdown(set, flow.amount)} set={set} />
      {flow.from !== "bank" && larger.length > 0 ? (
        <span className="chip-paid-with">
          <span className="muted">{t.paidWith}</span>
          {larger.slice(-2).map((v) => (
            <button key={v} className="chip-button" aria-pressed={paidWith === v} onClick={() => setPaidWith(paidWith === v ? null : v)}>
              {v}
            </button>
          ))}
        </span>
      ) : null}
      {paidWith !== null ? (
        <span className="chip-change">
          <span className="muted">{t.change}</span> <Discs result={change(set, paidWith, flow.amount)} set={set} />
        </span>
      ) : null}
    </div>
  );
}
