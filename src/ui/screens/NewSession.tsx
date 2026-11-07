import { useLang, useText } from "../../app/language";
import { renderWarning } from "../../i18n/render";
import { gameText } from "../../i18n/gameText";
import { useEffect, useMemo, useState } from "react";
import { useAppActions, useServices } from "../../app/AppProvider";
import { ALL_COMPANIES, applyOptions, builtInGames, hasUnverified, optionWarnings, subsetIds } from "../../domain/games";
import type { GameDefinition, OptionDef } from "../../domain/games/schema";
import { trainCount } from "../../domain/events/state";
import { formatMoney } from "../../i18n/format";
import { validateChipSet } from "../../domain/mechanics/chips";
import { setupPlan } from "../../domain/mechanics/chipSetup";
import type { ChipSet, Player, WalletMode } from "../../domain/types";
import { ChipSetEditor, sortChips } from "../components/ChipSetEditor";
import { ChipSetupPlan } from "../components/ChipSetupPlan";
import { CompanyBadge } from "../components/CompanyBadge";
import { useNav } from "../nav";

const PALETTE = ["#e53935", "#1e88e5", "#43a047", "#fdd835", "#8e24aa", "#fb8c00", "#6d4c41"];
const HARD_CAP = 7;

interface Row {
  readonly key: number;
  name: string;
  color: string;
  aliases: string;
}

let rowKey = 0;
const newRow = (i: number): Row => ({
  key: ++rowKey,
  name: "",
  color: PALETTE[i % PALETTE.length] ?? "#888888",
  aliases: "",
});

/** The session copy for these options, or undefined when they do not make a valid game. */
function patchedCopy(game: GameDefinition, options: Readonly<Record<string, string>>): GameDefinition | undefined {
  try {
    return applyOptions(game, options);
  } catch {
    return undefined;
  }
}

/** "2×7 · 3×5 · 4×4 · 5×3 · 6×2 · 7/∞": the stack for this many players (special trains aside). */
function trainPreview(game: GameDefinition, players: number): string {
  return game.trains
    .filter((t) => !t.special)
    .map((t) => {
      const count = trainCount(t, players);
      const name = t.displayName ?? t.type;
      return count === "unlimited" ? name : `${name}×${count}`;
    })
    .join(" · ");
}

/** A companySubset option as a checklist of the companies the other options leave in play. */
function SubsetChecklist(props: {
  game: GameDefinition;
  option: OptionDef;
  options: Readonly<Record<string, string>>;
  onChange: (value: string) => void;
}) {
  const t = useText();
  const { lang } = useLang();
  const { game, option, options, onChange } = props;
  const available = (patchedCopy(game, { ...options, [option.id]: ALL_COMPANIES })?.companies ?? []).filter((c) =>
    (option.from ?? []).includes(c.id),
  );
  const chosen = new Set(subsetIds(option, options[option.id]));
  const selected = available.filter((c) => options[option.id] === undefined || chosen.has(c.id));
  const toggle = (id: string) => {
    const ids = selected.map((c) => c.id);
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    onChange(next.length === available.length ? ALL_COMPANIES : next.join(","));
  };
  return (
    <fieldset className="choice-fieldset">
      <legend>
        {gameText(game, lang).option(option.id)}{" "}
        <span className="muted" data-testid="minors-count">
          {selected.length} {t.newSession.of} {option.from?.length ?? 0}
        </span>
      </legend>
      <div className="choice-grid">
        {available.map((c) => (
          <label key={c.id} className="check-row">
            <input type="checkbox" checked={selected.includes(c)} onChange={() => toggle(c.id)} />
            <CompanyBadge company={c} size="sm" />{" "}
            {c.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Game, options, players (within the game's range, never more than 7) and wallet mode. */
export function NewSession() {
  const t = useText();
  const { lang } = useLang();
  const { games } = useServices();
  const { newSession } = useAppActions();
  const { go } = useNav();
  const [custom, setCustom] = useState<GameDefinition[]>([]);
  const [gameId, setGameId] = useState(builtInGames[0]?.id ?? "");
  const [options, setOptions] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<Row[]>(() => [0, 1, 2, 3].map(newRow));
  const [walletMode, setWalletMode] = useState<WalletMode>("appTruth");
  /** null = the game's preset (FR-080). */
  const [chipSet, setChipSet] = useState<ChipSet | null>(null);
  const [editChips, setEditChips] = useState(false);
  /** The bank counts the table set (feature 008): kept across players and options, not games. */
  const [pins, setPins] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void games.list().then(setCustom);
  }, [games]);

  const all = useMemo(() => [...builtInGames, ...custom], [custom]);
  const game = all.find((g) => g.id === gameId);
  const max = Math.min(game?.playerCount.max ?? HARD_CAP, HARD_CAP);
  const min = game?.playerCount.min ?? 1;
  const patched = useMemo(() => (game ? patchedCopy(game, options) : undefined), [game, options]);
  const warnings = game ? optionWarnings(game, options, rows.length) : [];
  const startingCash = patched?.startingCash[String(rows.length)];
  const chips = useMemo(() => sortChips(chipSet ?? { chips: game?.chipPreset ?? [] }), [chipSet, game]);
  /** Recomputed on every change of chips, players, options or pins (FR-024). */
  const plan = useMemo(
    () => (patched && validateChipSet(chips).length === 0 ? setupPlan(patched, rows.length, chips, pins) : undefined),
    [patched, rows.length, chips, pins],
  );
  // Short of chips: open the editor so counts can be fixed in place (US5-2). It stays open after.
  if (plan && plan.missing.length > 0 && !editChips) setEditChips(true);

  /** A choice option changes which companies are in play, so company subsets start over. */
  const setOption = (option: OptionDef, value: string) => {
    const subsets = new Set(option.kind === "companySubset" ? [] : (game?.options ?? []).filter((o) => o.kind === "companySubset").map((o) => o.id));
    setOptions({ ...Object.fromEntries(Object.entries(options).filter(([id]) => !subsets.has(id))), [option.id]: value });
  };

  const chooseGame = (id: string) => {
    setGameId(id);
    setOptions({});
    setChipSet(null);
    setPins({});
    const g = all.find((x) => x.id === id);
    if (!g) return;
    setRows((current) => {
      const lo = g.playerCount.min;
      const hi = Math.min(g.playerCount.max, HARD_CAP);
      if (current.length < lo)
        return [...current, ...Array.from({ length: lo - current.length }, (_, i) => newRow(current.length + i))];
      if (current.length > hi) return current.slice(0, hi);
      return current;
    });
  };

  const update = (key: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const move = (index: number, delta: number) => {
    setRows((rs) => {
      const next = [...rs];
      const target = index + delta;
      const a = next[index];
      const b = next[target];
      if (!a || !b) return rs;
      next[index] = b;
      next[target] = a;
      return next;
    });
  };

  const names = rows.map((r) => r.name.trim().toLocaleLowerCase("es"));
  const valid =
    game !== undefined &&
    rows.length >= min &&
    rows.length <= max &&
    names.every((n) => n !== "") &&
    new Set(names).size === names.length;

  const start = async () => {
    if (!game || !valid) return;
    setBusy(true);
    setError(null);
    const players: Player[] = rows.map((r, i) => ({
      id: `p${i + 1}`,
      name: r.name.trim(),
      color: r.color,
      seat: i + 1,
      aliases: r.aliases
        .split(",")
        .map((a) => a.trim())
        .filter((a) => a !== ""),
    }));
    try {
      await newSession({
        game,
        options,
        players,
        walletMode,
        name,
        lang,
        chipSet: chips,
        bankPins: pins,
      });
      go({ name: "table" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <main className="screen">
      <header className="topbar">
        <button className="ghost" aria-label={t.common.back} onClick={() => go({ name: "home" })}>
          ←
        </button>
        <h1 className="topbar-center">{t.newSession.title}</h1>
      </header>
      <div className="screen-body">
        <fieldset className="choice-fieldset">
          <legend>{t.newSession.game}</legend>
          <div className="choice-grid">
            {all.map((g) => (
              <button key={g.id} aria-pressed={g.id === gameId} onClick={() => chooseGame(g.id)}>
                {g.name}
                {hasUnverified(g) ? <span className="badge warn">{t.newSession.unverified}</span> : null}
              </button>
            ))}
          </div>
        </fieldset>

        {game?.options.map((o) =>
          o.kind === "companySubset" ? (
            <SubsetChecklist key={o.id} game={game} option={o} options={options} onChange={(v) => setOption(o, v)} />
          ) : (
            <label key={o.id}>
              {gameText(game, lang).option(o.id)}
              <select value={options[o.id] ?? ""} onChange={(e) => setOption(o, e.target.value)}>
                {o.default === null ? <option value="">{t.newSession.random}</option> : null}
                {o.choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {gameText(game, lang).choice(o.id, c.value)}
                    {c.value === o.default ? t.newSession.byDefault : ""}
                  </option>
                ))}
              </select>
            </label>
          ),
        )}

        {game && game.options.length > 0 && patched ? (
          <p className="muted">
            <span data-testid="cash-preview">
              {t.newSession.startCash} {startingCash !== undefined ? formatMoney(startingCash, patched, lang) : "—"} {t.newSession.perPlayer}
            </span>
            <br />
            {t.newSession.trains} <span data-testid="train-preview">{trainPreview(patched, rows.length)}</span>
          </p>
        ) : null}
        {warnings.length > 0 ? (
          <ul className="warning-box" role="status">
            {warnings.map((w) => (
              <li key={w.code + w.messageEs}>{game ? renderWarning(w, { game, players: [] }, lang) : w.messageEs}</li>
            ))}
          </ul>
        ) : null}

        <fieldset className="choice-fieldset">
          <legend>
            {t.newSession.players}{rows.length}, {min}–{max}{t.newSession.seatOrder}
          </legend>
          <ol className="player-rows">
            {rows.map((r, i) => (
              <li key={r.key} className="player-row">
                <input
                  type="color"
                  value={r.color}
                  aria-label={t.newSession.playerColor(i + 1)}
                  onChange={(e) => update(r.key, { color: e.target.value })}
                />
                <input
                  placeholder={t.newSession.playerPlaceholder(i + 1)}
                  aria-label={t.newSession.playerName(i + 1)}
                  value={r.name}
                  onChange={(e) => update(r.key, { name: e.target.value })}
                />
                <input
                  placeholder={t.newSession.aliasPlaceholder}
                  aria-label={t.newSession.playerAliases(i + 1)}
                  value={r.aliases}
                  onChange={(e) => update(r.key, { aliases: e.target.value })}
                />
                <span className="row">
                  <button aria-label={t.newSession.up} disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </button>
                  <button aria-label={t.newSession.down} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                    ↓
                  </button>
                  <button
                    aria-label={t.newSession.remove}
                    disabled={rows.length <= min}
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ol>
          <button disabled={rows.length >= max} onClick={() => setRows((rs) => [...rs, newRow(rs.length)])}>
            {t.newSession.addPlayer}
          </button>
        </fieldset>

        <fieldset className="choice-fieldset">
          <legend>{t.newSession.walletMode}</legend>
          <div className="choice-grid">
            <button aria-pressed={walletMode === "appTruth"} onClick={() => setWalletMode("appTruth")}>
              {t.newSession.appTruth}
            </button>
            <button aria-pressed={walletMode === "bankOnly"} onClick={() => setWalletMode("bankOnly")}>
              {t.newSession.bankOnly}
            </button>
          </div>
        </fieldset>

        <fieldset className="choice-fieldset">
          <legend>{t.newSession.chips}</legend>
          {editChips && game ? (
            <ChipSetEditor value={chipSet ?? { chips: game.chipPreset }} onChange={setChipSet} />
          ) : (
            <button className="chip-summary" onClick={() => setEditChips(true)}>
              {chips.chips.length === 0 ? (
                t.newSession.noChips
              ) : (
                <span className="chip-discs">
                  {chips.chips.map((c) => (
                    <span key={c.value} className="chip">
                      <span className="chip-disc" style={{ background: c.color }} aria-hidden="true" />
                      <span className="chip-text">{c.value}</span>
                    </span>
                  ))}
                </span>
              )}{" "}
              {t.newSession.editChips}
            </button>
          )}
        </fieldset>
        {plan && patched ? <ChipSetupPlan plan={plan} set={chips} game={patched} pins={pins} onPinsChange={setPins} /> : null}

        <label>
          {t.newSession.name}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={game?.name} />
        </label>

        {error ? <p className="warning-box">{error}</p> : null}
        <button className="primary big" disabled={!valid || busy} onClick={() => void start()}>
          {t.newSession.start}
        </button>
      </div>
    </main>
  );
}
