import type { GameDefinition } from "../../domain/games/schema";
import { formatMoney } from "../../domain/i18n/format";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** Integer keypad with 48 px keys (FR-101). The value is null when empty. */
export function Keypad({
  value,
  onChange,
  game,
  label,
  quick = [10, 50, 100],
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  game: Pick<GameDefinition, "currency">;
  label?: string;
  quick?: readonly number[];
}) {
  const digits = value === null ? "" : String(value);
  const press = (key: string) => {
    const next = (digits + key).replace(/^0+(?=\d)/, "").slice(0, 7);
    onChange(next === "" ? null : Number(next));
  };
  return (
    <div className="keypad">
      <output className="keypad-display money" aria-label={label ?? "Cantidad"}>
        {value === null ? <span className="muted">{label ?? "Cantidad"}</span> : formatMoney(value, game)}
      </output>
      <div className="keypad-grid">
        {DIGITS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              press(k);
            }}
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            press("00");
          }}
        >
          00
        </button>
        <button
          type="button"
          onClick={() => {
            press("0");
          }}
        >
          0
        </button>
        <button
          type="button"
          aria-label="Borrar"
          onClick={() => {
            const next = digits.slice(0, -1);
            onChange(next === "" ? null : Number(next));
          }}
        >
          ⌫
        </button>
      </div>
      <div className="keypad-quick">
        {quick.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => {
              onChange((value ?? 0) + q);
            }}
          >
            +{q}
          </button>
        ))}
        <button
          type="button"
          aria-label="Vaciar"
          onClick={() => {
            onChange(null);
          }}
        >
          C
        </button>
      </div>
    </div>
  );
}
