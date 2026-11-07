import { validateChipSet } from "../../domain/mechanics/chips";
import type { Chip, ChipSet } from "../../domain/types";
import { useText } from "../../app/language";
import { usePlainMessageText } from "../useMessage";

/** Chips sorted by value, highest first (data-model §12). Callers sort when they save. */
export function sortChips(set: ChipSet): ChipSet {
  return { chips: [...set.chips].sort((a, b) => b.value - a.value) };
}

/**
 * The table's chips (FR-080): color, value and optional count (empty = unlimited), starting
 * from the game's preset. No label (feature 008): a chip shows its value. Rows keep their order
 * while editing, so they do not jump under the finger.
 */
export function ChipSetEditor({ value, onChange }: { value: ChipSet; onChange: (set: ChipSet) => void }) {
  const t = useText().components.chipEditor;
  const plainText = usePlainMessageText();
  const chips = value.chips;
  const set = (next: Chip[]) => onChange({ chips: next });
  const patch = (i: number, p: Partial<Chip>) => set(chips.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const errors = validateChipSet(sortChips(value));
  return (
    <div className="stack chip-editor">
      <ul className="chip-rows">
        {chips.map((c, i) => (
          <li key={i} className="chip-row">
            <input type="color" aria-label={t.colorOf(c.value)} value={c.color} onChange={(e) => patch(i, { color: e.target.value })} />
            <label>
              <span className="label">{t.value}</span>
              <input
                inputMode="numeric"
                aria-label={t.valueOf(i + 1)}
                value={c.value}
                onChange={(e) => patch(i, { value: Number(e.target.value.replace(/\D/g, "")) || 0 })}
              />
            </label>
            <label>
              <span className="label">{t.count}</span>
              <input
                inputMode="numeric"
                placeholder="∞"
                value={c.countAvailable ?? ""}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  patch(i, { countAvailable: digits === "" ? undefined : Number(digits) });
                }}
              />
            </label>
            <button aria-label={t.remove(c.value)} onClick={() => set(chips.filter((_, j) => j !== i))}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button onClick={() => set([...chips, { value: 1, color: "#9e9e9e" }])}>{t.add}</button>
      {errors.map((e) => (
        <p key={e.code} className="toast-warning">
          {plainText(e)}
        </p>
      ))}
    </div>
  );
}
