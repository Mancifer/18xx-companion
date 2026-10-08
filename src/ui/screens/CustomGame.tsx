import { useEffect, useState } from "react";
import { useServices } from "../../app/AppProvider";
import { builtInGames } from "../../domain/games";
import { createCustomGame, editCustomGame, type CustomGameEdit } from "../../domain/games/customGame";
import type { GameDefinition } from "../../domain/games/schema";
import { useNav } from "../nav";

type Draft = {
  name: string;
  bankTotal: string;
  startingCash: Record<string, string>;
  companies: Record<string, { name: string; shortName: string; aliases: string; color: string }>;
  privates: Record<string, { name: string; cost: string; income: string }>;
  trains: Record<string, { cost: string; count: string }>;
};

function draftOf(game: GameDefinition, name: string): Draft {
  return {
    name,
    bankTotal: game.bank === "unlimited" ? "" : String(game.bank.total),
    startingCash: Object.fromEntries(Object.entries(game.startingCash).map(([k, v]) => [k, String(v)])),
    companies: Object.fromEntries(
      game.companies.map((c) => [c.id, { name: c.name, shortName: c.shortName, aliases: c.aliases.join(", "), color: c.color }]),
    ),
    privates: Object.fromEntries(game.privates.map((p) => [p.id, { name: p.name, cost: String(p.cost), income: String(p.income) }])),
    trains: Object.fromEntries(
      game.trains.map((t) => [t.type, { cost: String(t.variants[0]?.cost ?? 0), count: t.count === "unlimited" ? "" : String(t.count) }]),
    ),
  };
}

const num = (s: string) => Number(s.trim());

function editOf(base: GameDefinition, d: Draft): CustomGameEdit {
  return {
    name: d.name.trim() || base.name,
    ...(base.bank === "unlimited" ? {} : { bank: { total: num(d.bankTotal) } }),
    startingCash: Object.fromEntries(Object.entries(d.startingCash).map(([k, v]) => [k, num(v)])),
    companies: Object.fromEntries(
      Object.entries(d.companies).map(([id, c]) => [
        id,
        {
          name: c.name.trim(),
          shortName: c.shortName.trim(),
          color: c.color,
          aliases: c.aliases
            .split(",")
            .map((a) => a.trim())
            .filter((a) => a !== ""),
        },
      ]),
    ),
    privates: Object.fromEntries(
      Object.entries(d.privates).map(([id, p]) => [id, { name: p.name.trim(), cost: num(p.cost), income: num(p.income) }]),
    ),
    trains: Object.fromEntries(
      Object.entries(d.trains).map(([type, t]) => [type, { cost: num(t.cost), ...(t.count === "" ? {} : { count: num(t.count) }) }]),
    ),
  };
}

/**
 * Copy a built-in game and edit its values (FR-007). Market, phases, payout rules, rounding,
 * capitalization, schedule and mechanics stay as in the original.
 */
export function CustomGame() {
  const { games } = useServices();
  const { go } = useNav();
  const [saved, setSaved] = useState<GameDefinition[]>([]);
  const [baseId, setBaseId] = useState(builtInGames[0]?.id ?? "");
  const base = builtInGames.find((g) => g.id === baseId);
  const [draft, setDraft] = useState<Draft | null>(base ? draftOf(base, `${base.name} (variante)`) : null);
  const [errors, setErrors] = useState<readonly string[]>([]);

  useEffect(() => {
    void games.list().then(setSaved);
  }, [games]);

  const chooseBase = (id: string) => {
    setBaseId(id);
    const g = builtInGames.find((x) => x.id === id);
    setDraft(g ? draftOf(g, `${g.name} (variante)`) : null);
    setErrors([]);
  };

  const save = async () => {
    if (!base || !draft) return;
    const result = editCustomGame(createCustomGame(base, draft.name), editOf(base, draft));
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    await games.save(result.definition);
    setSaved(await games.list());
    setErrors([]);
    go({ name: "newSession" });
  };

  const remove = async (id: string) => {
    await games.delete(id);
    setSaved(await games.list());
  };

  return (
    <main className="screen">
      <header className="topbar">
        <button className="ghost" aria-label="Volver" onClick={() => go({ name: "home" })}>
          ←
        </button>
        <h1 className="topbar-center">Juego personalizado</h1>
      </header>
      <div className="screen-body">
        {saved.length > 0 ? (
          <section className="stack">
            <h2>Guardados</h2>
            {saved.map((g) => (
              <div key={g.id} className="row">
                <span className="spacer">{g.name}</span>
                <button className="danger" onClick={() => void remove(g.id)}>
                  Borrar
                </button>
              </div>
            ))}
          </section>
        ) : null}

        <fieldset className="choice-fieldset">
          <legend>Copiar de</legend>
          <div className="choice-grid">
            {builtInGames.map((g) => (
              <button key={g.id} aria-pressed={g.id === baseId} onClick={() => chooseBase(g.id)}>
                {g.name}
              </button>
            ))}
          </div>
        </fieldset>

        {base && draft ? (
          <>
            <label>
              Nombre
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            {base.bank !== "unlimited" ? (
              <label>
                Banco
                <input inputMode="numeric" value={draft.bankTotal} onChange={(e) => setDraft({ ...draft, bankTotal: e.target.value })} />
              </label>
            ) : null}

            <fieldset className="choice-fieldset">
              <legend>Dinero inicial por jugador</legend>
              <div className="form-grid">
                {Object.entries(draft.startingCash).map(([n, v]) => (
                  <label key={n}>
                    {n} jugadores
                    <input
                      inputMode="numeric"
                      value={v}
                      onChange={(e) => setDraft({ ...draft, startingCash: { ...draft.startingCash, [n]: e.target.value } })}
                    />
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="choice-fieldset">
              <legend>Compañías</legend>
              {Object.entries(draft.companies).map(([id, c]) => (
                <div key={id} className="form-grid">
                  <input
                    type="color"
                    aria-label={`Color de ${id}`}
                    value={c.color}
                    onChange={(e) => setDraft({ ...draft, companies: { ...draft.companies, [id]: { ...c, color: e.target.value } } })}
                  />
                  <input
                    aria-label={`Abreviatura de ${id}`}
                    value={c.shortName}
                    onChange={(e) => setDraft({ ...draft, companies: { ...draft.companies, [id]: { ...c, shortName: e.target.value } } })}
                  />
                  <input
                    aria-label={`Nombre de ${id}`}
                    value={c.name}
                    onChange={(e) => setDraft({ ...draft, companies: { ...draft.companies, [id]: { ...c, name: e.target.value } } })}
                  />
                  <input
                    aria-label={`Alias de ${id}`}
                    placeholder="Alias"
                    value={c.aliases}
                    onChange={(e) => setDraft({ ...draft, companies: { ...draft.companies, [id]: { ...c, aliases: e.target.value } } })}
                  />
                </div>
              ))}
            </fieldset>

            <fieldset className="choice-fieldset">
              <legend>Privadas</legend>
              {Object.entries(draft.privates).map(([id, p]) => (
                <div key={id} className="form-grid">
                  <input
                    aria-label={`Nombre de ${id}`}
                    value={p.name}
                    onChange={(e) => setDraft({ ...draft, privates: { ...draft.privates, [id]: { ...p, name: e.target.value } } })}
                  />
                  <label>
                    Coste
                    <input
                      inputMode="numeric"
                      value={p.cost}
                      onChange={(e) => setDraft({ ...draft, privates: { ...draft.privates, [id]: { ...p, cost: e.target.value } } })}
                    />
                  </label>
                  <label>
                    Ingreso
                    <input
                      inputMode="numeric"
                      value={p.income}
                      onChange={(e) => setDraft({ ...draft, privates: { ...draft.privates, [id]: { ...p, income: e.target.value } } })}
                    />
                  </label>
                </div>
              ))}
            </fieldset>

            <fieldset className="choice-fieldset">
              <legend>Trenes</legend>
              {Object.entries(draft.trains).map(([type, t]) => (
                <div key={type} className="form-grid">
                  <span className="money">{type}</span>
                  <label>
                    Coste
                    <input
                      inputMode="numeric"
                      value={t.cost}
                      onChange={(e) => setDraft({ ...draft, trains: { ...draft.trains, [type]: { ...t, cost: e.target.value } } })}
                    />
                  </label>
                  <label>
                    Cantidad
                    <input
                      inputMode="numeric"
                      placeholder="ilimitado"
                      value={t.count}
                      onChange={(e) => setDraft({ ...draft, trains: { ...draft.trains, [type]: { ...t, count: e.target.value } } })}
                    />
                  </label>
                </div>
              ))}
            </fieldset>

            {errors.length > 0 ? (
              <ul className="warning-box">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            ) : null}
            <button className="primary big" onClick={() => void save()}>
              Guardar juego
            </button>
          </>
        ) : null}
      </div>
    </main>
  );
}
