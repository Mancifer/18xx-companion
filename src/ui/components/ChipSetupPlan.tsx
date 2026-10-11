import type { GameDefinition } from "../../domain/games/schema";
import { formatMoney } from "../../domain/i18n/format";
import { missingWarningEs, type ChipCount, type SetupPlan } from "../../domain/mechanics/chipSetup";
import type { ChipSet } from "../../domain/types";
import { ChipDiscs } from "./ChipStrip";

const countOf = (chips: readonly ChipCount[], value: number) => chips.find((c) => c.value === value)?.count ?? 0;

/**
 * One row per chip color with − / count / + (feature 008, R16): any change pins that color, and
 * the colors not pinned refill so the bank stays exact. Steppers are at least 48 px.
 */
function BankSteppers(props: {
  plan: Extract<SetupPlan["bank"], { kind: "fixed" }>;
  set: ChipSet;
  pins: Readonly<Record<string, number>>;
  onPinsChange: (pins: Record<string, number>) => void;
}) {
  const { plan, set, pins, onPinsChange } = props;
  const chips = [...set.chips].sort((a, b) => b.value - a.value);
  const pin = (value: number, n: number) => onPinsChange({ ...pins, [String(value)]: Math.max(0, n) });
  return (
    <ul className="plan-steppers">
      {chips.map((chip) => {
        const missing = countOf(plan.portion.missing, chip.value);
        const n = countOf(plan.portion.owned, chip.value) + missing;
        return (
          <li key={chip.value} className="plan-stepper">
            <span className="chip">
              <span className="chip-disc" style={{ background: chip.color }} aria-hidden="true" />
              <span className="chip-text">{chip.value}</span>
            </span>
            <button aria-label={`Menos fichas de ${chip.value} en el banco`} disabled={n === 0} onClick={() => pin(chip.value, n - 1)}>
              −
            </button>
            <input
              inputMode="numeric"
              aria-label={`Fichas de ${chip.value} en el banco`}
              value={n}
              onChange={(e) => pin(chip.value, Number(e.target.value.replace(/\D/g, "")) || 0)}
            />
            <button aria-label={`Más fichas de ${chip.value} en el banco`} onClick={() => pin(chip.value, n + 1)}>
              +
            </button>
            <span className="plan-stepper-notes">
              {plan.pinned.includes(chip.value) ? <span className="badge">fijada</span> : null}
              {missing > 0 ? <span className="muted">faltan {missing}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * How to set up the money on the table (contracts/ui.md §3): each player's chips, the bank's chips
 * (adjustable when `onPinsChange` is given and the bank is fixed) and the chips set aside. The
 * "notice" variant (start notice) shows only the players, a fixed bank and the warnings.
 */
export function ChipSetupPlan({
  plan,
  set,
  game,
  pins = {},
  onPinsChange,
  variant = "full",
}: {
  plan: SetupPlan;
  set: ChipSet;
  game: Pick<GameDefinition, "currency">;
  /** When present with `onPinsChange`, the fixed bank is adjustable; absent = read-only. */
  pins?: Readonly<Record<string, number>>;
  onPinsChange?: (pins: Record<string, number>) => void;
  /** "notice": only "Cada jugador", the fixed bank's "Banco" and the warnings. */
  variant?: "full" | "notice";
}) {
  const full = variant === "full";
  const { bank, perPlayer } = plan;
  const missing = missingWarningEs(plan, set);
  return (
    // The notice is labelled by its own title, so only the full plan is a named region.
    <section className="setup-plan" aria-label={full ? "Preparación de fichas" : undefined}>
      {missing ? (
        // US5, FR-025: advice only; starting is never blocked.
        <p className="warning-box" role="status">
          {missing} Podés cambiar cantidades o valores, o empezar igual y usar otras fichas.
        </p>
      ) : null}
      <div className="plan-row" data-testid="plan-players">
        <span className="plan-label">Cada jugador {formatMoney(perPlayer.amount, game)}</span>
        {perPlayer.owned.length + perPlayer.missing.length > 0 ? (
          <ChipDiscs chips={perPlayer.owned} missing={perPlayer.missing} set={set} />
        ) : (
          <span className="muted">sin fichas</span>
        )}
      </div>
      {bank.kind === "fixed" ? (
        <>
          <div className="plan-row" data-testid="plan-bank">
            <span className="plan-label">Banco {formatMoney(bank.portion.amount, game)}</span>
            {full && onPinsChange ? (
              <>
                <BankSteppers plan={bank} set={set} pins={pins} onPinsChange={onPinsChange} />
                {bank.pinned.length > 0 ? <button onClick={() => onPinsChange({})}>Restablecer</button> : null}
              </>
            ) : (
              <ChipDiscs chips={bank.portion.owned} missing={bank.portion.missing} set={set} />
            )}
          </div>
          {bank.difference !== 0 ? (
            <p className="warning-box">
              {bank.difference > 0
                ? `El banco tiene ${formatMoney(bank.difference, game)} de más.`
                : `Al banco le faltan ${formatMoney(-bank.difference, game)}.`}{" "}
              Cambiá alguna ficha fijada o tocá Restablecer.
            </p>
          ) : null}
          {full && bank.setAside.length > 0 ? (
            <div className="plan-row plan-aside" data-testid="plan-aside">
              <span className="plan-label">
                Apartadas <span className="muted">no se usan</span>
              </span>
              <ChipDiscs chips={bank.setAside} set={set} />
            </div>
          ) : null}
        </>
      ) : full ? (
        <div className="plan-row" data-testid="plan-bank">
          <span className="plan-label">Banco</span>
          <ChipDiscs chips={bank.owned} set={set} />
          {bank.unlimitedValues.length > 0 ? <span className="muted">sin límite: {bank.unlimitedValues.join(", ")}</span> : null}
        </div>
      ) : null}
    </section>
  );
}
