import { useEffect, useMemo, useState } from "react";
import { useAppActions, useServices } from "../../app/AppProvider";
import { builtInGames, hasUnverified } from "../../domain/games";
import type { GameDefinition } from "../../domain/games/schema";
import type { ChipSet, Player, WalletMode } from "../../domain/types";
import { ChipSetEditor, sortChips } from "../components/ChipSetEditor";
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
const newRow = (i: number): Row => ({ key: ++rowKey, name: "", color: PALETTE[i % PALETTE.length] ?? "#888888", aliases: "" });

/** Game, options, players (within the game's range, never more than 7) and wallet mode. */
export function NewSession() {
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

  const chooseGame = (id: string) => {
    setGameId(id);
    setOptions({});
    setChipSet(null);
    const g = all.find((x) => x.id === id);
    if (!g) return;
    setRows((current) => {
      const lo = g.playerCount.min;
      const hi = Math.min(g.playerCount.max, HARD_CAP);
      if (current.length < lo) return [...current, ...Array.from({ length: lo - current.length }, (_, i) => newRow(current.length + i))];
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
      await newSession({ game, options, players, walletMode, name, chipSet: sortChips(chipSet ?? { chips: game.chipPreset }) });
      go({ name: "table" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <main className="screen">
      <header className="topbar">
        <button className="ghost" aria-label="Volver" onClick={() => go({ name: "home" })}>
          ←
        </button>
        <h1 className="topbar-center">Nueva partida</h1>
      </header>
      <div className="screen-body">
        <fieldset className="choice-fieldset">
          <legend>Juego</legend>
          <div className="choice-grid">
            {all.map((g) => (
              <button key={g.id} aria-pressed={g.id === gameId} onClick={() => chooseGame(g.id)}>
                {g.name}
                {hasUnverified(g) ? <span className="badge warn">reglas sin verificar</span> : null}
              </button>
            ))}
          </div>
        </fieldset>

        {game?.options.map((o) => (
          <label key={o.id}>
            {o.label}
            <select value={options[o.id] ?? ""} onChange={(e) => setOptions({ ...options, [o.id]: e.target.value })}>
              {o.default === null ? <option value="">Al azar</option> : null}
              {o.choices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                  {c.value === o.default ? " (por defecto)" : ""}
                </option>
              ))}
            </select>
          </label>
        ))}

        <fieldset className="choice-fieldset">
          <legend>
            Jugadores ({rows.length}, {min}–{max}) · en orden de asiento
          </legend>
          <ol className="player-rows">
            {rows.map((r, i) => (
              <li key={r.key} className="player-row">
                <input
                  type="color"
                  value={r.color}
                  aria-label={`Color del jugador ${i + 1}`}
                  onChange={(e) => update(r.key, { color: e.target.value })}
                />
                <input
                  placeholder={`Jugador ${i + 1}`}
                  aria-label={`Nombre del jugador ${i + 1}`}
                  value={r.name}
                  onChange={(e) => update(r.key, { name: e.target.value })}
                />
                <input
                  placeholder="Alias (separados por comas)"
                  aria-label={`Alias del jugador ${i + 1}`}
                  value={r.aliases}
                  onChange={(e) => update(r.key, { aliases: e.target.value })}
                />
                <span className="row">
                  <button aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </button>
                  <button aria-label="Bajar" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                    ↓
                  </button>
                  <button
                    aria-label="Quitar"
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
            Añadir jugador
          </button>
        </fieldset>

        <fieldset className="choice-fieldset">
          <legend>Dinero de los jugadores</legend>
          <div className="choice-grid">
            <button aria-pressed={walletMode === "appTruth"} onClick={() => setWalletMode("appTruth")}>
              La app lleva el dinero
            </button>
            <button aria-pressed={walletMode === "bankOnly"} onClick={() => setWalletMode("bankOnly")}>
              Solo banco
            </button>
          </div>
        </fieldset>

        <fieldset className="choice-fieldset">
          <legend>Fichas</legend>
          {editChips && game ? (
            <ChipSetEditor value={chipSet ?? { chips: game.chipPreset }} onChange={setChipSet} />
          ) : (
            <button onClick={() => setEditChips(true)}>
              {(chipSet ?? { chips: game?.chipPreset ?? [] }).chips.map((c) => c.label ?? c.value).join(" · ") || "Sin fichas"} · Editar
            </button>
          )}
        </fieldset>

        <label>
          Nombre (opcional)
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={game?.name} />
        </label>

        {error ? <p className="warning-box">{error}</p> : null}
        <button className="primary big" disabled={!valid || busy} onClick={() => void start()}>
          Empezar
        </button>
      </div>
    </main>
  );
}
