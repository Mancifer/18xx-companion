import type { GameDefinition } from "../../domain/games/schema";
import { formatMoney } from "../../i18n/format";
import { useLang, useText } from "../../app/language";
import { missingWarning, type ChipCount, type SetupPlan } from "../../domain/mechanics/chipSetup";
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
  const t = useText().components.setupPlan;
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
            <button aria-label={t.lessChips(chip.value)} disabled={n === 0} onClick={() => pin(chip.value, n - 1)}>
              −
            </button>
            <input
              inputMode="numeric"
              aria-label={t.chipsIn(chip.value)}
              value={n}
              onChange={(e) => pin(chip.value, Number(e.target.value.replace(/\D/g, "")) || 0)}
            />
            <button aria-label={t.moreChips(chip.value)} onClick={() => pin(chip.value, n + 1)}>
              +
            </button>
            <span className="plan-stepper-notes">
              {plan.pinned.includes(chip.value) ? <span className="badge">{t.pinned}</span> : null}
              {missing > 0 ? <span className="muted">{t.missingN(missing)}</span> : null}
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
  const t = useText().components.setupPlan;
  const noChips = useText().components.chips.noChips;
  const { lang } = useLang();
  const money = (n: number) => formatMoney(n, game, lang);
  const full = variant === "full";
  const { bank, perPlayer } = plan;
  const missing = missingWarning(plan, set, lang);
  return (
    // The notice is labelled by its own title, so only the full plan is a named region.
    <section className="setup-plan" aria-label={full ? t.region : undefined}>
      {missing ? (
        // US5, FR-025: advice only; starting is never blocked.
        <p className="warning-box" role="status">
          {missing}
          {t.missingAdvice}
        </p>
      ) : null}
      <div className="plan-row" data-testid="plan-players">
        <span className="plan-label">
          {t.eachPlayer}
          {money(perPlayer.amount)}
        </span>
        {perPlayer.owned.length + perPlayer.missing.length > 0 ? (
          <ChipDiscs chips={perPlayer.owned} missing={perPlayer.missing} set={set} />
        ) : (
          <span className="muted">{noChips}</span>
        )}
      </div>
      {bank.kind === "fixed" ? (
        <>
          <div className="plan-row" data-testid="plan-bank">
            <span className="plan-label">
              {t.bankWith}
              {money(bank.portion.amount)}
            </span>
            {full && onPinsChange ? (
              <>
                <BankSteppers plan={bank} set={set} pins={pins} onPinsChange={onPinsChange} />
                {bank.pinned.length > 0 ? <button onClick={() => onPinsChange({})}>{t.reset}</button> : null}
              </>
            ) : (
              <ChipDiscs chips={bank.portion.owned} missing={bank.portion.missing} set={set} />
            )}
          </div>
          {bank.difference !== 0 ? (
            <p className="warning-box">
              {bank.difference > 0
                ? t.bankOver(money(bank.difference))
                : t.bankShort(money(-bank.difference))}{" "}
              {t.fixHint}
            </p>
          ) : null}
          {full && bank.setAside.length > 0 ? (
            <div className="plan-row plan-aside" data-testid="plan-aside">
              <span className="plan-label">
                {t.aside}
                <span className="muted">{t.unused}</span>
              </span>
              <ChipDiscs chips={bank.setAside} set={set} />
            </div>
          ) : null}
        </>
      ) : full ? (
        <div className="plan-row" data-testid="plan-bank">
          <span className="plan-label">{t.bank}</span>
          <ChipDiscs chips={bank.owned} set={set} />
          {bank.unlimitedValues.length > 0 ? <span className="muted">{t.unlimited(bank.unlimitedValues.join(", "))}</span> : null}
        </div>
      ) : null}
    </section>
  );
}
