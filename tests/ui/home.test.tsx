import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startSession } from "../../src/app/sessions";
import { getBuiltInGame } from "../../src/domain/games";
import { openCompanionDb } from "../../src/persistence/db";
import { SessionRepo } from "../../src/persistence/sessionRepo";
import { SettingsRepo } from "../../src/persistence/settingsRepo";
import { App } from "../../src/ui/App";
import { makePlayers } from "../helpers/dispatch";
import { freshDbName } from "../helpers/session";

/** Feature 006: delete past sessions from Home (contracts/home-delete-ui.md §3–4). */

interface Seed {
  readonly name: string;
  readonly players: readonly string[];
  readonly notes?: number;
}

const THREE: readonly Seed[] = [
  { name: "Lunes", players: ["Ana", "Bruno", "Carla"], notes: 2 },
  { name: "Martes", players: ["Dani", "Eva", "Fede"] },
  { name: "Miércoles", players: ["Gala", "Hugo", "Iris"], notes: 1 },
];

/** Seeds sessions in a fresh DB (the last one becomes "Continuar"), then renders App on Home. */
async function openHome(seeds: readonly Seed[] = THREE) {
  const dbName = freshDbName();
  const db = await openCompanionDb(dbName);
  const sessions = new SessionRepo(db);
  const settings = new SettingsRepo(db);
  for (const seed of seeds) {
    const store = await startSession(sessions, settings, {
      game: getBuiltInGame("1830"),
      options: {},
      players: makePlayers(seed.players),
      walletMode: "appTruth",
      name: seed.name,
    });
    for (let i = 0; i < (seed.notes ?? 0); i++) await store.dispatch({ type: "note", text: `n${i}` });
  }
  db.close();
  const user = userEvent.setup();
  const view = render(<App dbName={dbName} />);
  await screen.findByRole("heading", { name: "Partidas" });
  return { user, view, dbName };
}

function rowNames(): string[] {
  return screen.queryAllByRole("button", { name: /^Eliminar partida/ }).map((b) => b.getAttribute("aria-label") ?? "");
}

async function askDelete(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: `Eliminar partida «${name}»` }));
  return screen.findByRole("dialog", { name: `¿Eliminar «${name}»?` });
}

async function rerender(view: ReturnType<typeof render>, dbName: string) {
  view.unmount();
  render(<App dbName={dbName} />);
  await screen.findByRole("button", { name: "Nueva partida" });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Home: delete a session (US1)", () => {
  it("gives every row its own Eliminar button, apart from the open button (FR-001, FR-010)", async () => {
    await openHome();
    for (const { name } of THREE) {
      const del = screen.getByRole("button", { name: `Eliminar partida «${name}»` });
      expect(del.textContent).toBe("Eliminar");
      const open = within(del.closest("li")!).getAllByRole("button").find((b) => b !== del)!;
      expect(open.textContent).toContain(name);
      expect(open.contains(del)).toBe(false);
      expect(del.contains(open)).toBe(false);
    }
  });

  it("confirmation shows the game, players, entry count and the warning (FR-002)", async () => {
    const { user } = await openHome();
    const dialog = await askDelete(user, "Lunes");
    expect(dialog.textContent).toContain("1830 · Ana, Bruno, Carla · 3 entradas");
    expect(dialog.textContent).toContain("Esta acción no se puede deshacer.");
  });

  it("Cancelar, Escape and the backdrop keep every session (FR-003)", async () => {
    const { user } = await openHome();

    let dialog = await askDelete(user, "Martes");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await askDelete(user, "Martes");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    dialog = await askDelete(user, "Martes");
    fireEvent.click(dialog.parentElement!);
    expect(screen.queryByRole("dialog")).toBeNull();

    expect(rowNames()).toHaveLength(3);
  });

  it("confirming removes the session for good and leaves the others usable (FR-004, FR-005, SC-002)", async () => {
    const { user, view, dbName } = await openHome();
    const dialog = await askDelete(user, "Martes");
    await user.click(within(dialog).getByRole("button", { name: "Eliminar" }));

    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await vi.waitFor(() => expect(rowNames()).toEqual(["Eliminar partida «Miércoles»", "Eliminar partida «Lunes»"]));

    await rerender(view, dbName);
    await screen.findByRole("heading", { name: "Partidas" });
    expect(rowNames()).toEqual(["Eliminar partida «Miércoles»", "Eliminar partida «Lunes»"]);

    const open = within(screen.getByRole("button", { name: "Eliminar partida «Lunes»" }).closest("li")!)
      .getAllByRole("button")
      .find((b) => b.textContent.includes("Lunes"))!;
    await user.click(open);
    await screen.findByRole("button", { name: "Menú" });
  });

  it("a failing delete keeps the sheet open with an alert and the row listed (FR-006)", async () => {
    vi.spyOn(SessionRepo.prototype, "deleteSession").mockRejectedValueOnce(new Error("boom"));
    const { user } = await openHome();
    const dialog = await askDelete(user, "Lunes");
    await user.click(within(dialog).getByRole("button", { name: "Eliminar" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toBe("No se pudo eliminar la partida.");
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(rowNames()).toContain("Eliminar partida «Lunes»");
  });
});

describe("Home: delete the Continuar session (US2)", () => {
  it("removes Continuar and keeps it gone after a relaunch", async () => {
    const { user, view, dbName } = await openHome();
    expect(screen.getByRole("button", { name: "Continuar · Miércoles" })).toBeTruthy();

    const dialog = await askDelete(user, "Miércoles");
    await user.click(within(dialog).getByRole("button", { name: "Eliminar" }));
    await vi.waitFor(() => expect(rowNames()).toHaveLength(2));
    expect(screen.queryByRole("button", { name: /^Continuar/ })).toBeNull();

    await rerender(view, dbName);
    await screen.findByRole("heading", { name: "Partidas" });
    expect(screen.queryByRole("button", { name: /^Continuar/ })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("deleting the only session leaves an empty Home that still starts and imports", async () => {
    const { user } = await openHome([{ name: "Sola", players: ["Ana", "Bruno", "Carla"] }]);
    const dialog = await askDelete(user, "Sola");
    await user.click(within(dialog).getByRole("button", { name: "Eliminar" }));

    await vi.waitFor(() => expect(screen.queryByRole("heading", { name: "Partidas" })).toBeNull());
    expect(screen.queryByRole("button", { name: /^Continuar/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Nueva partida" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Importar partida" })).toBeTruthy();
  });
});

describe("Home: export before deleting (US3)", () => {
  function stubDownload() {
    const downloads: string[] = [];
    Object.assign(URL, { createObjectURL: () => "blob:test", revokeObjectURL: () => undefined });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    return downloads;
  }

  it("Exportar antes downloads the session and keeps the sheet open (FR-008)", async () => {
    const downloads = stubDownload();
    const { user } = await openHome();
    const dialog = await askDelete(user, "Lunes");
    await user.click(within(dialog).getByRole("button", { name: "Exportar antes" }));

    await vi.waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]).toMatch(/^18xx-1830-\d{8}-\d{4}\.json$/);
    expect(screen.getByRole("dialog")).toBe(dialog);
    await vi.waitFor(() =>
      expect(within(dialog).getByRole<HTMLButtonElement>("button", { name: "Eliminar" }).disabled).toBe(false),
    );
  });

  it("a failing export shows an alert and deletes nothing", async () => {
    stubDownload();
    vi.spyOn(SessionRepo.prototype, "loadSession").mockRejectedValueOnce(new Error("boom"));
    const { user } = await openHome();
    const dialog = await askDelete(user, "Lunes");
    await user.click(within(dialog).getByRole("button", { name: "Exportar antes" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toBe("No se pudo exportar la partida.");
    expect(rowNames()).toContain("Eliminar partida «Lunes»");
  });
});

describe("Home: finished games (feature 007, US3, contracts/ui.md §3)", () => {
  interface Game {
    readonly name: string;
    readonly players: readonly string[];
    /** Actions after createSession. */
    readonly actions?: readonly unknown[];
    /** Store the meta without the outcome key, as a session from before the feature. */
    readonly legacy?: boolean;
  }
  const END = { type: "endGame", triggers: null };
  const pay = (to: string) => ({ type: "transferMoney", from: "bank", to, amount: 100 });

  async function homeWith(games: readonly Game[]) {
    const dbName = freshDbName();
    const db = await openCompanionDb(dbName);
    const sessions = new SessionRepo(db);
    const settings = new SettingsRepo(db);
    for (const g of games) {
      const store = await startSession(sessions, settings, {
        game: getBuiltInGame("1830"),
        options: {},
        players: makePlayers(g.players),
        walletMode: "appTruth",
        name: g.name,
      });
      for (const action of g.actions ?? []) await store.dispatch(action);
      if (g.legacy) {
        const loaded = (await sessions.loadSession(store.getSnapshot().meta.id))!;
        const { outcome: _dropped, ...meta } = loaded.meta;
        await sessions.importSession(meta, loaded.entries);
      }
    }
    db.close();
    const user = userEvent.setup();
    const view = render(<App dbName={dbName} />);
    await screen.findByRole("heading", { name: "Partidas" });
    return { user, view, dbName };
  }
  const row = (name: string) => screen.getByRole("button", { name: `Eliminar partida «${name}»` }).closest("li")!;
  const openRow = (name: string) => within(row(name)).getAllByRole("button")[0]!;

  it("a finished row shows the Completa badge and the winner; an unfinished one looks as before (FR-015)", async () => {
    await homeWith([
      { name: "Abierta", players: ["Ana", "Bruno"] },
      { name: "Ganada", players: ["Carla", "Dani"], actions: [pay("player:p2"), END] },
      { name: "Empate", players: ["Eva", "Fede", "Gala"], actions: [pay("player:p1"), pay("player:p3"), END] },
    ]);
    expect(within(row("Ganada")).getByText("Completa")).toBeTruthy();
    expect(within(row("Ganada")).getByText("Ganó Dani")).toBeTruthy();
    expect(within(row("Empate")).getByText("Ganaron Eva y Gala")).toBeTruthy();
    expect(within(row("Abierta")).queryByText("Completa")).toBeNull();
    expect(within(row("Abierta")).queryByText(/^Gan/)).toBeNull();
  });

  it("tapping a finished row opens its results from Home in 1 tap (SC-004); Volver closes it and returns", async () => {
    const { user } = await homeWith([{ name: "Ganada", players: ["Carla", "Dani"], actions: [pay("player:p2"), END] }, { name: "Otra", players: ["Ana", "Bruno"] }]);
    await user.click(openRow("Ganada"));
    expect(await screen.findByRole("heading", { name: "Resultados" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect(await screen.findByRole("heading", { name: "Partidas" })).toBeTruthy();
  });

  it("an unfinished row opens the Table", async () => {
    const { user } = await homeWith([{ name: "Abierta", players: ["Ana", "Bruno"] }]);
    await user.click(openRow("Abierta"));
    expect(await screen.findByRole("button", { name: "Menú" })).toBeTruthy();
  });

  it("Continuar on a finished last session opens its results (FR-016)", async () => {
    const { user } = await homeWith([{ name: "Ganada", players: ["Carla", "Dani"], actions: [END] }]);
    await user.click(screen.getByRole("button", { name: /^Continuar/ }));
    expect(await screen.findByRole("heading", { name: "Resultados" })).toBeTruthy();
  });

  it("a row with no outcome key gets the marker once the backfill finishes", async () => {
    await homeWith([{ name: "Vieja", players: ["Ana", "Bruno"], actions: [pay("player:p1"), END], legacy: true }]);
    expect(await within(row("Vieja")).findByText("Completa")).toBeTruthy();
    expect(within(row("Vieja")).getByText("Ganó Ana")).toBeTruthy();
  });

  it("Ver mesa opens the Table; undoing the end there makes the game open, and Home drops the marker (US3-3)", async () => {
    const { user } = await homeWith([{ name: "Ganada", players: ["Carla", "Dani"], actions: [END] }]);
    await user.click(openRow("Ganada"));
    await user.click(await screen.findByRole("button", { name: "Ver mesa" }));
    await user.click(await screen.findByRole("button", { name: "Menú" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Historial" }));
    const entry = (await screen.findByText(/^Fin de la partida/)).closest("li")!;
    await user.click(within(entry).getByRole("button", { name: "Deshacer" }));
    await user.click(screen.getByRole("button", { name: "Volver" }));
    await user.click(await screen.findByRole("button", { name: "Menú" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Salir al inicio" }));
    await screen.findByRole("heading", { name: "Partidas" });
    expect(within(row("Ganada")).queryByText("Completa")).toBeNull();
  });
});
