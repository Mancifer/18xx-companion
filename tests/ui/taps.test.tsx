import { screen, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { openSeededTable } from "./helpers";

/**
 * T161 (FR-100, SC-006): taps from the Table, as it opens, to the applied state. Typing the
 * revenue on the keypad is entry, not a tap to count (SC-006: "after entering the revenue").
 */

type User = ReturnType<typeof userEvent.setup>;

function counting(user: User) {
  let taps = 0;
  return {
    tap: async (el: Element) => {
      taps += 1;
      await user.click(el);
    },
    get taps() {
      return taps;
    },
  };
}

const startSR = { type: "startSR" };
const startOR = { type: "startOR" };
const par = (player: string, company: string, price: number) => ({ type: "parCompany", player, company, price });
const buy = (player: string, company: string, count: number) => ({ type: "buyShare", buyer: `player:${player}`, company, source: "ipo", count });
/** PRR (and NYC) floated through a real stock round, then the OR starts. */
const floated = (withNyc = false) => [
  startSR,
  par("p1", "PRR", 100),
  buy("p1", "PRR", 2),
  buy("p2", "PRR", 2),
  ...(withNyc ? [par("p3", "NYC", 90), buy("p3", "NYC", 2), buy("p4", "NYC", 2)] : []),
  { type: "endSR" },
  startOR,
];
const companiesShown = () => screen.getByRole("tab", { name: "Compañías", selected: true });
const card = (company: string) => screen.getByTestId(`treasury-${company}`).closest("button")!;

describe("taps to common actions (FR-100)", () => {
  it("payout: Operar, then Pagar after the revenue", async () => {
    const { user } = await openSeededTable({ actions: floated() });
    const t = counting(user);
    await t.tap(screen.getByRole("button", { name: "Operar PRR" }));
    const dialog = await screen.findByRole("dialog");
    for (const d of "240") await user.click(within(dialog).getByRole("button", { name: new RegExp(`^${d}$`) }));
    await t.tap(within(dialog).getByRole("button", { name: "Pagar" }));
    expect(await screen.findByText(/PRR paga \$240/, { selector: ".toast-summary" })).toBeTruthy();
    expect(t.taps).toBeLessThanOrEqual(2);
  });

  it("buy share: the company, then the buyer", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100)] });
    expect(companiesShown()).toBeTruthy();
    const t = counting(user);
    await t.tap(card("PRR"));
    await t.tap(within(await screen.findByRole("dialog")).getByRole("button", { name: "IPO Bruno" }));
    expect(await screen.findByText(/Bruno compra 1 PRR de la IPO/)).toBeTruthy();
    expect(t.taps).toBeLessThanOrEqual(2);
  });

  it("sell: the company, then the seller", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100), buy("p2", "PRR", 2)] });
    expect(companiesShown()).toBeTruthy();
    const t = counting(user);
    await t.tap(card("PRR"));
    await t.tap(within(await screen.findByRole("dialog")).getByRole("button", { name: "Vender Bruno" }));
    expect(await screen.findByText(/Bruno vende 1 PRR/)).toBeTruthy();
    expect(t.taps).toBeLessThanOrEqual(2);
  });

  it("no end-of-round buttons in the SR or the CR (feature 003)", async () => {
    await openSeededTable({ actions: [startSR] });
    expect(screen.queryByRole("button", { name: "Fin de ronda de acciones" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Fin de ronda corporativa" })).toBeNull();
  });

  it("no end-of-round button in the 21Moon CR (feature 003)", async () => {
    await openSeededTable({ game: "21moon", actions: [startSR, { type: "startCR" }] });
    expect(screen.getByRole("button", { name: "Turno: CR 1" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fin de ronda corporativa" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Fin de ronda de acciones" })).toBeNull();
  });

  it("SR → OR in one tap (SC-003)", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100), buy("p1", "PRR", 2), buy("p2", "PRR", 2)] });
    const t = counting(user);
    await t.tap(screen.getByRole("button", { name: "Empezar OR" }));
    expect(await screen.findByRole("button", { name: "Turno: OR 1.1" })).toBeTruthy();
    expect(t.taps).toBe(1);
  });

  it("starting the stock round shows the companies, ready to buy", async () => {
    const { user } = await openSeededTable({ actions: floated() });
    expect(screen.getByRole("tab", { name: "Jugadores", selected: true })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Empezar ronda de acciones" }));
    expect(await screen.findByRole("tab", { name: "Compañías", selected: true })).toBeTruthy();
  });

  it("a turn with no run: Operar, No corrió, Terminar turno (SC-004)", async () => {
    const { user } = await openSeededTable({ actions: floated(true) });
    const t = counting(user);
    await t.tap(screen.getByRole("button", { name: "Operar PRR" }));
    const dialog = await screen.findByRole("dialog");
    await t.tap(within(dialog).getByRole("button", { name: "No corrió" }));
    await within(dialog).findByText("✓ Operación registrada");
    await t.tap(within(dialog).getByRole("button", { name: /^Terminar turno/ }));
    expect(await screen.findByRole("button", { name: "Operar NYC" })).toBeTruthy();
    expect(t.taps).toBeLessThanOrEqual(3);
  });

  it("a full turn: revenue, Pagar, one train, Terminar turno (SC-004)", async () => {
    const { user } = await openSeededTable({ actions: floated(true) });
    const t = counting(user);
    await t.tap(screen.getByRole("button", { name: "Operar PRR" }));
    const dialog = await screen.findByRole("dialog");
    for (const d of "80") await user.click(within(dialog).getByRole("button", { name: new RegExp(`^${d}$`) }));
    await t.tap(within(dialog).getByRole("button", { name: "Pagar" }));
    await within(dialog).findByText("✓ Operación registrada");
    await t.tap(within(dialog).getByRole("button", { name: "Comprar tren" }));
    await t.tap(within(await screen.findByRole("dialog")).getByRole("button", { name: /^2 \(/ }));
    await screen.findByText(/compra un 2 al banco/, { selector: ".turn-summary li" });
    await t.tap(within(await screen.findByRole("dialog")).getByRole("button", { name: /^Terminar turno/ }));
    expect(await screen.findByRole("button", { name: "Operar NYC" })).toBeTruthy();
    expect(t.taps).toBeLessThanOrEqual(6);
  });

  it("undo: one tap on the notice", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100)] });
    await user.click(card("PRR"));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "IPO Bruno" }));
    await screen.findByText(/Bruno compra 1 PRR de la IPO/);
    const t = counting(user);
    await t.tap(screen.getByRole("button", { name: "Deshacer" }));
    expect(await screen.findByText(/Deshecho/)).toBeTruthy();
    expect(t.taps).toBe(1);
  });
});

describe("taps from the player sheet (feature 011, FR-007, SC-001)", () => {
  /** The players pane is shown first (on a tablet both panes are on screen); taps count from there. */
  const tile = async (user: User, id: string) => {
    await user.click(screen.getByRole("tab", { name: "Jugadores" }));
    return screen.getByTestId(`cash-${id}`).closest("button")!;
  };
  const dialog = () => screen.findByRole("dialog");

  it("SR quick sell of 1: the tile, then Vender 1 PRR = 2 taps", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100), buy("p2", "PRR", 2)] });
    const start = await tile(user, "p2");
    const t = counting(user);
    await t.tap(start);
    await t.tap(within(await dialog()).getByRole("button", { name: /^Vender 1 PRR/ }));
    expect(await screen.findByText(/Bruno vende 1 PRR/, { selector: ".toast-summary" })).toBeTruthy();
    expect(t.taps).toBe(2);
  });

  it("Vender acciones with one holding = 3 taps", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100), buy("p2", "PRR", 2)] });
    const start = await tile(user, "p2");
    const t = counting(user);
    await t.tap(start);
    await t.tap(within(await dialog()).getByRole("button", { name: "Vender acciones" }));
    await t.tap(within(await dialog()).getByRole("button", { name: /^Vender 1 · cobra/ }));
    expect(await screen.findByText(/Bruno vende 1 PRR/, { selector: ".toast-summary" })).toBeTruthy();
    expect(t.taps).toBe(3);
  });

  it("Vender acciones with two holdings = 4 taps", async () => {
    const { user } = await openSeededTable({
      actions: [startSR, par("p1", "PRR", 100), par("p3", "NYC", 90), buy("p2", "PRR", 2), buy("p2", "NYC", 1)],
    });
    const start = await tile(user, "p2");
    const t = counting(user);
    await t.tap(start);
    await t.tap(within(await dialog()).getByRole("button", { name: "Vender acciones" }));
    await t.tap(within(await dialog()).getByRole("button", { name: /NYC 10%/ }));
    await t.tap(within(await dialog()).getByRole("button", { name: /^Vender 1 · cobra/ }));
    expect(await screen.findByText(/Bruno vende 1 NYC/, { selector: ".toast-summary" })).toBeTruthy();
    expect(t.taps).toBe(4);
  });

  it("Comprar acción with several open companies = 4 taps", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100), par("p3", "NYC", 90)] });
    const start = await tile(user, "p2");
    const t = counting(user);
    await t.tap(start);
    await t.tap(within(await dialog()).getByRole("button", { name: "Comprar acción" }));
    await t.tap(within(await dialog()).getByRole("button", { name: /PRR/ }));
    await t.tap(within(await dialog()).getByRole("button", { name: /^IPO / }));
    expect(await screen.findByText(/Bruno compra 1 PRR de la IPO/, { selector: ".toast-summary" })).toBeTruthy();
    expect(t.taps).toBe(4);
  });

  it("Comprar acción with only one company = 3 taps", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100)] });
    const start = await tile(user, "p2");
    const t = counting(user);
    await t.tap(start);
    await t.tap(within(await dialog()).getByRole("button", { name: "Comprar acción" }));
    await t.tap(within(await dialog()).getByRole("button", { name: /^IPO / }));
    expect(await screen.findByText(/Bruno compra 1 PRR de la IPO/, { selector: ".toast-summary" })).toBeTruthy();
    expect(t.taps).toBe(3);
  });
});
