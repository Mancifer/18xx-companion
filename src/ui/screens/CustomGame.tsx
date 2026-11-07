import { useText } from "../../app/language";
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
  /** altName: a major's second identity (FR-005a); null for companies without one. */
  companies: Record<string, { name: string; shortName: string; aliases: string; color: string; altName: string | null }>;
  privates: Record<string, { name: string; cost: string; income: string }>;
  trains: Record<string, { cost: string; count: string }>;
};

function draftOf(game: GameDefinition, name: string): Draft {
  return {
    name,
    bankTotal: game.bank === "unlimited" ? "" : String(game.bank.total),
    startingCash: Object.fromEntries(Object.entries(game.startingCash).map(([k, v]) => [k, String(v)])),
    companies: Object.fromEntries(
      game.companies.map((c) => [
        c.id,
        {
          name: c.name,
          shortName: c.shortName,
          aliases: c.aliases.join(", "),
          color: c.color,
          altName: c.tier === "major" ? (c.altName ?? "") : null,
        },
      ]),
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
          ...(c.altName !== null && c.altName.trim() !== "" ? { altName: c.altName.trim() } : {}),
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
  const t = useText();
  const { games } = useServices();
  const { go } = useNav();
  const [saved, setSaved] = useState<GameDefinition[]>([]);
  const [baseId, setBaseId] = useState(builtInGames[0]?.id ?? "");
  const base = builtInGames.find((g) => g.id === baseId);
  const [draft, setDraft] = useState<Draft | null>(base ? draftOf(base, t.customGame.variant(base.name)) : null);
  const [errors, setErrors] = useState<readonly string[]>([]);

  useEffect(() => {
    void games.list().then(setSaved);
  }, [games]);

  const chooseBase = (id: string) => {
    setBaseId(id);
    const g = builtInGames.find((x) => x.id === id);
    setDraft(g ? draftOf(g, t.customGame.variant(g.name)) : null);
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
        <button className="ghost" aria-label={t.common.back} onClick={() => go({ name: "home" })}>
          ←
        </button>
        <h1 className="topbar-center">{t.customGame.title}</h1>
      </header>
      <div className="screen-body">
        {saved.length > 0 ? (
          <section className="stack">
            <h2>{t.customGame.saved}</h2>
            {saved.map((g) => (
              <div key={g.id} className="row">
                <span className="spacer">{g.name}</span>
                <button className="danger" onClick={() => void remove(g.id)}>
                  {t.customGame.delete}
                </button>
              </div>
            ))}
          </section>
        ) : null}

        <fieldset className="choice-fieldset">
          <legend>{t.customGame.copyFrom}</legend>
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
              {t.customGame.name}
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            {base.bank !== "unlimited" ? (
              <label>
                {t.customGame.bank}
                <input inputMode="numeric" value={draft.bankTotal} onChange={(e) => setDraft({ ...draft, bankTotal: e.target.value })} />
              </label>
            ) : null}

            <fieldset className="choice-fieldset">
              <legend>{t.customGame.startCash}</legend>
              <div className="form-grid">
                {Object.entries(draft.startingCash).map(([n, v]) => (
                  <label key={n}>
                    {n} {t.customGame.playersCount}
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
              <legend>{t.customGame.companies}</legend>
              {Object.entries(draft.companies).map(([id, c]) => (
                <div key={id} className="form-grid">
                  <input
                    type="color"
                    aria-label={t.customGame.colorOf(id)}
                    value={c.color}
                    onChange={(e) => setDraft({ ...draft, companies: { ...draft.companies, [id]: { ...c, color: e.target.value } } })}
                  />
                  <input
                    aria-label={t.customGame.shortNameOf(id)}
                    value={c.shortName}
                    onChange={(e) => setDraft({ ...draft, companies: { ...draft.companies, [id]: { ...c, shortName: e.target.value } } })}
                  />
                  <input
                    aria-label={t.customGame.nameOf(id)}
                    value={c.name}
                    onChange={(e) => setDraft({ ...draft, companies: { ...draft.companies, [id]: { ...c, name: e.target.value } } })}
                  />
                  {c.altName !== null ? (
                    <input
                      aria-label={t.customGame.altNameOf(id)}
                      placeholder={t.customGame.altPlaceholder}
                      value={c.altName}
                      onChange={(e) => setDraft({ ...draft, companies: { ...draft.companies, [id]: { ...c, altName: e.target.value } } })}
                    />
                  ) : null}
                  <input
                    aria-label={t.customGame.aliasesOf(id)}
                    placeholder={t.customGame.aliasesPlaceholder}
                    value={c.aliases}
                    onChange={(e) => setDraft({ ...draft, companies: { ...draft.companies, [id]: { ...c, aliases: e.target.value } } })}
                  />
                </div>
              ))}
            </fieldset>

            <fieldset className="choice-fieldset">
              <legend>{t.customGame.privates}</legend>
              {Object.entries(draft.privates).map(([id, p]) => (
                <div key={id} className="form-grid">
                  <input
                    aria-label={t.customGame.nameOf(id)}
                    value={p.name}
                    onChange={(e) => setDraft({ ...draft, privates: { ...draft.privates, [id]: { ...p, name: e.target.value } } })}
                  />
                  <label>
                    {t.customGame.cost}
                    <input
                      inputMode="numeric"
                      value={p.cost}
                      onChange={(e) => setDraft({ ...draft, privates: { ...draft.privates, [id]: { ...p, cost: e.target.value } } })}
                    />
                  </label>
                  <label>
                    {t.customGame.income}
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
              <legend>{t.customGame.trains}</legend>
              {Object.entries(draft.trains).map(([type, train]) => (
                <div key={type} className="form-grid">
                  <span className="money">{type}</span>
                  <label>
                    {t.customGame.cost}
                    <input
                      inputMode="numeric"
                      value={train.cost}
                      onChange={(e) => setDraft({ ...draft, trains: { ...draft.trains, [type]: { ...train, cost: e.target.value } } })}
                    />
                  </label>
                  <label>
                    {t.customGame.count}
                    <input
                      inputMode="numeric"
                      placeholder={t.customGame.unlimited}
                      value={train.count}
                      onChange={(e) => setDraft({ ...draft, trains: { ...draft.trains, [type]: { ...train, count: e.target.value } } })}
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
              {t.customGame.saveGame}
            </button>
          </>
        ) : null}
      </div>
    </main>
  );
}
