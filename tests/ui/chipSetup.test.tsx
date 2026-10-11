import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { getBuiltInGame } from "../../src/domain/games";
import { createCustomGame } from "../../src/domain/games/customGame";
import { openCompanionDb } from "../../src/persistence/db";
import { GamesRepo } from "../../src/persistence/gamesRepo";
import { SessionRepo } from "../../src/persistence/sessionRepo";
import { App } from "../../src/ui/App";
import { freshDbName } from "../helpers/session";
import { cashText, openMenuItem, openSeededTable } from "./helpers";

/** Feature 008: the setup plan on the new-session screen and in the chips sheet (contracts/ui.md §3–§5). */

type User = ReturnType<typeof userEvent.setup>;

async function openNewSession(game = /^1830/) {
  const user = userEvent.setup();
  const dbName = freshDbName();
  render(<App dbName={dbName} />);
  await user.click(await screen.findByRole("button", { name: "Nueva partida" }));
  await user.click(await screen.findByRole("button", { name: game }));
  return { user, dbName };
}

const plan = () => screen.getByRole("region", { name: "Preparación de fichas" });
const discLabels = (el: HTMLElement) => within(el).queryAllByLabelText(/×/).map((d) => d.getAttribute("aria-label"));
const row = (testId: string) => within(plan()).getByTestId(testId);
const bankCount = (value: number) => within(plan()).getByLabelText<HTMLInputElement>(`Fichas de ${value} en el banco`).value;
const bankRow = (value: number) => within(plan()).getByLabelText(`Fichas de ${value} en el banco`).closest("li") as HTMLElement;
const more = (user: User, value: number) => user.click(within(plan()).getByRole("button", { name: `Más fichas de ${value} en el banco` }));

async function nameEveryone(user: User) {
  const inputs = screen.getAllByLabelText(/^Nombre del jugador/);
  for (const [i, input] of inputs.entries()) await user.type(input, `J${i + 1}`);
}

describe("the setup plan on the new-session screen (US3)", () => {
  it("1830, 4 players: each player, the bank and the chips set aside", async () => {
    await openNewSession();
    expect(row("plan-players").textContent).toContain("Cada jugador $600");
    expect(discLabels(row("plan-players"))).toEqual(["1 × 500", "1 × 100"]);
    expect(row("plan-bank").textContent).toContain("Banco $9.600");
    expect([500, 100, 25, 5, 1].map(bankCount)).toEqual(["0", "77", "50", "100", "150"]);
    expect(row("plan-aside").textContent).toContain("Apartadas");
    expect(discLabels(row("plan-aside"))).toEqual(["46 × 500", "69 × 100"]);
  });

  it("FR-024: changing the player count or an option updates the plan at once", async () => {
    const { user } = await openNewSession();
    await user.click(screen.getAllByRole("button", { name: "Quitar" })[0]!);
    expect(row("plan-players").textContent).toContain("Cada jugador $800");

    await user.click(screen.getByRole("button", { name: /Railways of the Lost Atlas/ }));
    expect(within(plan()).queryByLabelText("Fichas de 500 en el banco")).toBeNull();
    await user.selectOptions(screen.getByLabelText("Quiebra de banca"), "on");
    expect(row("plan-bank").textContent).toContain("Banco $");
    expect(within(plan()).getByLabelText("Fichas de 500 en el banco")).toBeTruthy();
  });

  it("US3-6: + on green six times pins it at 6 and red refills to 47", async () => {
    const { user } = await openNewSession();
    for (let i = 0; i < 6; i++) await more(user, 500);
    expect(bankCount(500)).toBe("6");
    expect(within(bankRow(500)).getByText("fijada")).toBeTruthy();
    expect(within(bankRow(100)).queryByText("fijada")).toBeNull();
    expect(bankCount(100)).toBe("47");
    expect(row("plan-bank").textContent).toContain("Banco $9.600");
    expect(discLabels(row("plan-aside"))).toEqual(["40 × 500", "99 × 100"]);
  });

  it("US3-8: Restablecer returns to the suggestion", async () => {
    const { user } = await openNewSession();
    await more(user, 500);
    await user.click(within(plan()).getByRole("button", { name: "Restablecer" }));
    expect(bankCount(500)).toBe("0");
    expect(bankCount(100)).toBe("77");
    expect(within(plan()).queryByText("fijada")).toBeNull();
    expect(within(plan()).queryByRole("button", { name: "Restablecer" })).toBeNull();
  });

  it("US3-9: 20 green warns that the bank has $400 too much, and Empezar stays enabled", async () => {
    const { user } = await openNewSession();
    await nameEveryone(user);
    const green = within(plan()).getByLabelText("Fichas de 500 en el banco");
    await user.clear(green);
    await user.type(green, "20");
    expect(bankCount(500)).toBe("20");
    expect(within(plan()).getByText(/El banco tiene \$400 de más\./).textContent).toContain(
      "Cambiá alguna ficha fijada o tocá Restablecer.",
    );
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Empezar" }).disabled).toBe(false);
  });

  it("− is disabled at 0", async () => {
    await openNewSession();
    expect(within(plan()).getByRole<HTMLButtonElement>("button", { name: "Menos fichas de 500 en el banco" }).disabled).toBe(true);
    expect(within(plan()).getByRole<HTMLButtonElement>("button", { name: "Menos fichas de 100 en el banco" }).disabled).toBe(false);
  });

  it("21Moon: an unlimited bank has no steppers, and 'sin límite' only for unlimited colors", async () => {
    const { user } = await openNewSession(/^21Moon/i);
    await user.click(screen.getAllByRole("button", { name: "Quitar" })[0]!);
    expect(within(plan()).queryByRole("button", { name: /fichas de .* en el banco/ })).toBeNull();
    expect(discLabels(row("plan-players"))).toEqual(["1 × 500", "1 × 25", "3 × 5"]);
    expect(row("plan-bank").textContent).not.toContain("sin límite");

    await user.click(screen.getByRole("button", { name: /Editar/ }));
    await user.clear(screen.getAllByLabelText("Cantidad")[4]!);
    expect(row("plan-bank").textContent).toContain("sin límite: 1");
  });

  it("changing the game clears the pins; changing the players keeps them", async () => {
    const { user } = await openNewSession();
    await more(user, 500);
    await user.click(screen.getAllByRole("button", { name: "Quitar" })[0]!);
    expect(within(bankRow(500)).getByText("fijada")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /^1848/ }));
    await user.click(screen.getByRole("button", { name: /^1830/ }));
    expect(within(plan()).queryByText("fijada")).toBeNull();
  });

  it("Empezar saves the pins with the session", async () => {
    const { user, dbName } = await openNewSession();
    await nameEveryone(user);
    await more(user, 500);
    await user.click(screen.getByRole("button", { name: "Empezar" }));
    await screen.findByRole("button", { name: "Menú" });
    const db = await openCompanionDb(dbName);
    const [meta] = await new SessionRepo(db).listSessions();
    db.close();
    expect(meta?.bankPins).toEqual({ "500": 1 });
  });
});

describe("Preparación in the chips sheet (US3-5, US3-7, FR-027)", () => {
  it("shows the session's plan; pins saved with Guardar are there after reopening, and nothing is logged", async () => {
    const { user, dbName, meta } = await openSeededTable();
    const cash = ["p1", "p2", "p3", "p4"].map(cashText);
    await openMenuItem(user, "Fichas");
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Preparación")).toBeTruthy();
    expect(row("plan-players").textContent).toContain("Cada jugador $600");
    expect(bankCount(100)).toBe("77");

    for (let i = 0; i < 6; i++) await more(user, 500);
    await user.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await openMenuItem(user, "Fichas");
    await screen.findByRole("dialog");
    expect(bankCount(500)).toBe("6");
    expect(within(bankRow(500)).getByText("fijada")).toBeTruthy();
    expect(bankCount(100)).toBe("47");

    expect(["p1", "p2", "p3", "p4"].map(cashText)).toEqual(cash);
    const db = await openCompanionDb(dbName);
    const loaded = await new SessionRepo(db).loadSession(meta.id);
    db.close();
    expect(loaded?.entries).toHaveLength(1);
    expect(loaded?.meta.bankPins).toEqual({ "500": 6 });
  });

  it("Volver al juego clears the draft pins", async () => {
    const { user } = await openSeededTable();
    await openMenuItem(user, "Fichas");
    await screen.findByRole("dialog");
    await more(user, 500);
    await user.click(screen.getByRole("button", { name: "Volver al juego" }));
    expect(bankCount(500)).toBe("0");
    expect(within(plan()).queryByText("fijada")).toBeNull();
  });
});

describe("the starting-chips notice on the Table (US4)", () => {
  const notice = () => screen.getByRole("status", { name: "Fichas iniciales" });
  const old1830 = (counts: Record<number, number>) => {
    const base = getBuiltInGame("1830");
    return { ...base, chipPreset: base.chipPreset.map((c) => (c.value in counts ? { ...c, countAvailable: counts[c.value] } : c)) };
  };

  it("US4-1, US4-2: shows each player's chips once and the bank, with no Apartadas", async () => {
    await openSeededTable();
    expect(within(notice()).getAllByText(/Cada jugador/)).toHaveLength(1);
    expect(within(notice()).getByText(/Cada jugador \$600/)).toBeTruthy();
    expect(discLabels(within(notice()).getByTestId("plan-players"))).toEqual(["1 × 500", "1 × 100"]);
    expect(within(notice()).getByText(/Banco \$9\.600/)).toBeTruthy();
    expect(discLabels(within(notice()).getByTestId("plan-bank"))).toEqual(["77 × 100", "50 × 25", "100 × 5", "150 × 1"]);
    expect(within(notice()).queryByText(/Apartadas/)).toBeNull();
    expect(within(notice()).queryByRole("button", { name: /en el banco/ })).toBeNull();
    expect(within(notice()).queryByRole("button", { name: /Deshacer/ })).toBeNull();
  });

  it("US3-7: a session started with pins shows the pinned bank", async () => {
    const { user } = await openNewSession();
    await nameEveryone(user);
    for (let i = 0; i < 6; i++) await more(user, 500);
    await user.click(screen.getByRole("button", { name: "Empezar" }));
    await screen.findByRole("button", { name: "Menú" });
    expect(discLabels(within(notice()).getByTestId("plan-bank"))).toEqual(["6 × 500", "47 × 100", "50 × 25", "100 × 5", "150 × 1"]);
  });

  it("US4-3: missing chips are marked", async () => {
    await openSeededTable({ game: old1830({ 500: 10, 100: 10 }) });
    expect(discLabels(within(notice()).getByTestId("plan-bank"))).toContain("faltan 8 × 500");
  });

  it("FR-026a: an unlimited bank shows only the players' chips", async () => {
    await openSeededTable({ game: "21moon", players: ["Ana", "Bruno", "Carla"] });
    expect(within(notice()).getByText(/Cada jugador ₡540/)).toBeTruthy();
    expect(within(notice()).queryByText(/Banco/)).toBeNull();
  });

  it("US4-4: Entendido hides it", async () => {
    const { user } = await openSeededTable();
    await user.click(within(notice()).getByRole("button", { name: "Entendido" }));
    expect(screen.queryByRole("status", { name: "Fichas iniciales" })).toBeNull();
  });

  it("US4-4: the first applied action hides it", async () => {
    const { user } = await openSeededTable();
    await user.click(screen.getByText("Ana", { selector: ".player-name" }).closest("button")!);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cobrar del banco" }));
    const dialog = await screen.findByRole("dialog");
    for (const d of "10") await user.click(within(dialog).getByRole("button", { name: new RegExp(`^${d}$`) }));
    await user.click(within(dialog).getByRole("button", { name: /^Cobrar/ }));
    await screen.findByText(/El banco paga \$10 a Ana/);
    expect(screen.queryByRole("status", { name: "Fichas iniciales" })).toBeNull();
  });

  it("is not shown once the session has actions", async () => {
    await openSeededTable({ actions: [{ type: "transferMoney", from: "bank", to: "player:p1", amount: 10 }] });
    expect(screen.queryByRole("status", { name: "Fichas iniciales" })).toBeNull();
  });
});

describe("warning and filling in when chips are short (US5)", () => {
  const warning = () => within(plan()).getByRole("status");

  async function setCount(user: User, index: number, n: number) {
    const input = screen.getAllByLabelText("Cantidad")[index]!;
    await user.clear(input);
    await user.type(input, String(n));
  }

  it("US5-1, US5-2, FR-025: green 10 and red 10 warn, mark the missing chips, and are fixed in place", async () => {
    const { user } = await openNewSession();
    await nameEveryone(user);
    await user.click(screen.getByRole("button", { name: /Editar/ }));
    await setCount(user, 0, 10);
    await setCount(user, 1, 10);
    expect(warning().textContent).toBe(
      "Faltan 8 fichas verdes (500), 1 roja (100) Podés cambiar cantidades o valores, o empezar igual y usar otras fichas.",
    );
    expect(within(bankRow(500)).getByText("faltan 8")).toBeTruthy();
    expect(within(bankRow(100)).getByText("faltan 1")).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Empezar" }).disabled).toBe(false);

    await setCount(user, 0, 50);
    expect(within(plan()).queryByRole("status")).toBeNull();
  });

  it("the editor opens on its own when the game's chips are short", async () => {
    const dbName = freshDbName();
    const db = await openCompanionDb(dbName);
    const base = getBuiltInGame("1830");
    const short = base.chipPreset.map((c) => (c.value >= 100 ? { ...c, countAvailable: 10 } : c));
    await new GamesRepo(db).save({ ...createCustomGame(base, "1830 corta"), chipPreset: short });
    db.close();
    const user = userEvent.setup();
    render(<App dbName={dbName} />);
    await user.click(await screen.findByRole("button", { name: "Nueva partida" }));
    expect(screen.queryAllByLabelText("Cantidad")).toHaveLength(0);
    await user.click(await screen.findByRole("button", { name: /1830 corta/ }));
    expect(warning().textContent).toContain("Faltan 8 fichas verdes (500), 1 roja (100)");
    expect(screen.getAllByLabelText("Cantidad")).toHaveLength(5);
  });

  it("US5-3: after starting anyway, Preparación in the chips sheet still warns", async () => {
    const base = getBuiltInGame("1830");
    const short = base.chipPreset.map((c) => (c.value >= 100 ? { ...c, countAvailable: 10 } : c));
    const { user } = await openSeededTable({ game: { ...base, chipPreset: short } });
    expect(within(screen.getByRole("status", { name: "Fichas iniciales" })).getByText(/Faltan 8 fichas verdes/)).toBeTruthy();
    await openMenuItem(user, "Fichas");
    await screen.findByRole("dialog");
    expect(warning().textContent).toContain("Faltan 8 fichas verdes (500), 1 roja (100)");
  });
});
