import { screen, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { byLine, cashText, openSeededTable } from "./helpers";

type User = ReturnType<typeof userEvent.setup>;

const shares = (company: string, to: string, units: number, presidency = false) => ({
  type: "transferShares",
  company,
  from: `ipo:${company}`,
  to,
  units,
  presidency: presidency || null,
});

const buyTrain = (company: string, trainType: string) => ({
  type: "buyTrain",
  company,
  trainType,
  variant: null,
  from: "bank",
  seller: null,
  price: null,
  tradeIn: null,
});

const startOR = { type: "startOR" };
/** The 1848 BoE operates first in every OR; the turn editor hands the turn to QR. */
const qrTurn = { type: "setTurn", round: null, srNumber: null, orSet: null, orIndex: null, orsInSet: null, company: "QR" };

async function openCompany(user: User, company: string): Promise<HTMLElement> {
  await user.click(screen.getByRole("tab", { name: "Compañías" }));
  const card = screen.getByTestId(`treasury-${company}`).closest("button")!;
  await user.click(card);
  return screen.findByRole("dialog");
}

async function typeOn(user: User, dialog: HTMLElement, digits: string) {
  for (const d of digits) await user.click(within(dialog).getByRole("button", { name: new RegExp(`^${d}$`) }));
}

describe("OperateSheet (US3)", () => {
  it("1830: Pagar and Retener, no Mitad and no Préstamo", async () => {
    const { user } = await openSeededTable({ game: "1830", actions: [shares("PRR", "player:p1", 6, true), startOR] });
    const dialog = await openCompany(user, "PRR");
    expect(within(dialog).getByRole("button", { name: "Pagar" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Retener" })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Mitad" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Préstamo/ })).toBeNull();
  });

  it("1848 in phase 3: Préstamo is offered and there is no repay action", async () => {
    const { user } = await openSeededTable({
      game: "1848",
      actions: [shares("QR", "player:p1", 6, true), buyTrain("QR", "3"), startOR, qrTurn],
    });
    const dialog = await openCompany(user, "QR");
    const loan = within(dialog).getByRole("button", { name: /^Préstamo/ });
    expect((loan as HTMLButtonElement).disabled).toBe(false);
    expect(within(dialog).queryByRole("button", { name: /Devolver/ })).toBeNull();
  });

  it("1848 before phase 3: Préstamo is shown disabled with the reason", async () => {
    const { user } = await openSeededTable({ game: "1848", actions: [shares("QR", "player:p1", 6, true), startOR, qrTurn] });
    const dialog = await openCompany(user, "QR");
    const loan = within(dialog).getByRole<HTMLButtonElement>("button", { name: /^Préstamo/ });
    expect(loan.disabled).toBe(true);
    expect(loan.textContent).toContain("fase 3");
  });

  it("21Moon: one input per revenue part and no mode buttons", async () => {
    const { user } = await openSeededTable({
      game: "21moon",
      players: ["Ana", "Bruno", "Carla"],
      actions: [shares("VH", "player:p1", 2, true), startOR],
    });
    const dialog = await openCompany(user, "VH");
    expect(within(dialog).getByRole("button", { name: /Base local/ })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /Puerto espacial/ })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Pagar" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Retener" })).toBeNull();

    await typeOn(user, dialog, "60");
    await user.click(within(dialog).getByRole("button", { name: /Puerto espacial/ }));
    await typeOn(user, dialog, "40");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText(byLine(/VH: base local ₡60, puerto espacial ₡40/))).toBeTruthy();
    expect(cashText("p1")).toBe("₡548");
  });

  it("a payout takes one tap after entering the revenue (SC-006)", async () => {
    const { user } = await openSeededTable({
      game: "1830",
      actions: [shares("PRR", "player:p1", 6, true), shares("PRR", "player:p2", 2), startOR],
    });
    const dialog = await openCompany(user, "PRR"); // tap 1
    await typeOn(user, dialog, "240"); // revenue entry
    await user.click(within(dialog).getByRole("button", { name: "Pagar" })); // tap 2
    expect(await screen.findByText(byLine(/PRR paga \$240/))).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Jugadores" }));
    expect(cashText("p1")).toBe("$744");
    expect(cashText("p2")).toBe("$648");
  });
});

/** PRR and NYC floated through a real stock round (PRR higher), then the OR starts. */
const floatedPair = [
  { type: "startSR" },
  { type: "parCompany", player: "p1", company: "PRR", price: 100 },
  { type: "buyShare", buyer: "player:p1", company: "PRR", source: "ipo", count: 2 },
  { type: "buyShare", buyer: "player:p2", company: "PRR", source: "ipo", count: 2 },
  { type: "parCompany", player: "p3", company: "NYC", price: 90 },
  { type: "buyShare", buyer: "player:p3", company: "NYC", source: "ipo", count: 2 },
  { type: "buyShare", buyer: "player:p4", company: "NYC", source: "ipo", count: 2 },
  { type: "endSR" },
  startOR,
];

async function openTurn(user: User, company: string): Promise<HTMLElement> {
  await user.click(screen.getByRole("button", { name: `Operar ${company}` }));
  return screen.findByRole("dialog");
}
const finishButton = (dialog: HTMLElement) => within(dialog).getByRole<HTMLButtonElement>("button", { name: /^Terminar turno/ });

describe("operating turn (US1)", () => {
  it("the round controls offer Operar for the current company and no Siguiente (FR-001)", async () => {
    await openSeededTable({ actions: floatedPair });
    expect(screen.getByRole("button", { name: "Operar PRR" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Siguiente" })).toBeNull();
  });

  it("Terminar turno is disabled with the reason until a run is recorded (FR-003)", async () => {
    const { user } = await openSeededTable({ actions: floatedPair });
    const dialog = await openTurn(user, "PRR");
    expect(finishButton(dialog).disabled).toBe(true);
    expect(within(dialog).getByText("Registra lo que corrió o «No corrió» primero")).toBeTruthy();
  });

  it("No corrió records a zero run, then Terminar turno moves to the next company (FR-002, FR-004)", async () => {
    const { user } = await openSeededTable({ actions: floatedPair });
    const dialog = await openTurn(user, "PRR");
    await user.click(within(dialog).getByRole("button", { name: "No corrió" }));
    expect(await within(dialog).findByText("✓ Operación registrada")).toBeTruthy();
    expect(finishButton(dialog).disabled).toBe(false);
    expect(finishButton(dialog).textContent).toContain("NYC");
    await user.click(finishButton(dialog));
    expect(await screen.findByRole("button", { name: "Operar NYC" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the 1848 BoE has no No corrió", async () => {
    const { user } = await openSeededTable({ game: "1848", actions: [shares("QR", "player:p1", 6, true), startOR] });
    const dialog = await openTurn(user, "BoE");
    expect(within(dialog).queryByRole("button", { name: "No corrió" })).toBeNull();
  });

  it("a company forced to withhold still has No corrió", async () => {
    const { user } = await openSeededTable({
      game: "21moon",
      players: ["Ana", "Bruno", "Carla"],
      actions: [shares("VH", "player:p1", 2, true), { type: "enterReceivership", company: "VH" }, startOR],
    });
    const dialog = await openTurn(user, "VH");
    expect(within(dialog).getByText("En administración: retiene todos los ingresos.")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "No corrió" })).toBeTruthy();
  });
});

const keypadValue = (dialog: HTMLElement) => within(dialog).getByTestId("keypad-value").textContent;

async function buyBankTrain(user: User, type: string) {
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Comprar tren" }));
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: new RegExp(`^${type} \\(`) }));
  // Back on the turn once the purchase is recorded.
  await screen.findByText(new RegExp(`compra un ${type} al banco`), { selector: ".turn-summary li" });
}

describe("revenue and trains in one turn (US2)", () => {
  it("typed revenue survives opening the train view and going back (FR-006)", async () => {
    const { user } = await openSeededTable({ actions: floatedPair });
    const dialog = await openTurn(user, "PRR");
    await typeOn(user, dialog, "80");
    await user.click(within(dialog).getByRole("button", { name: "Comprar tren" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "← Volver" }));
    expect(keypadValue(await screen.findByRole("dialog"))).toContain("80");
  });

  it("buying a train keeps the turn open, the typed revenue, and lists the train (FR-006, FR-007, FR-008)", async () => {
    const { user } = await openSeededTable({ actions: floatedPair });
    await typeOn(user, await openTurn(user, "PRR"), "80");
    await buyBankTrain(user, "2");
    const dialog = await screen.findByRole("dialog");
    expect(keypadValue(dialog)).toContain("80");
    expect(within(dialog).getByText(byLine(/PRR compra un 2 al banco/))).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Pagar" })).toBeTruthy();
  });

  it("after Pagar, a train purchase keeps the run as recorded (US2-3)", async () => {
    const { user } = await openSeededTable({ actions: floatedPair });
    const dialog = await openTurn(user, "PRR");
    await typeOn(user, dialog, "80");
    await user.click(within(dialog).getByRole("button", { name: "Pagar" }));
    await within(dialog).findByText("✓ Operación registrada");
    await buyBankTrain(user, "2");
    const after = await screen.findByRole("dialog");
    expect(within(after).getByText("✓ Operación registrada")).toBeTruthy();
    expect(within(after).queryByTestId("keypad-value")).toBeNull();
    expect(within(after).getByText(byLine(/PRR paga \$80/))).toBeTruthy();
  });

  it("21Moon: both typed parts survive a train purchase", async () => {
    const { user } = await openSeededTable({
      game: "21moon",
      players: ["Ana", "Bruno", "Carla"],
      actions: [
        shares("VH", "player:p1", 2, true),
        { type: "bankPays", company: "VH", amount: 300, reason: "capital" },
        startOR,
        { type: "setTurn", round: null, srNumber: null, orSet: null, orIndex: null, orsInSet: null, company: "VH" },
      ],
    });
    const dialog = await openTurn(user, "VH");
    await typeOn(user, dialog, "60");
    await user.click(within(dialog).getByRole("button", { name: /Puerto espacial/ }));
    await typeOn(user, dialog, "40");
    await buyBankTrain(user, "2");
    const after = await screen.findByRole("dialog");
    expect(within(after).getByRole("button", { name: /Base local/ }).textContent).toContain("60");
    expect(within(after).getByRole("button", { name: /Puerto espacial/ }).textContent).toContain("40");
  });

  it("Pagar costo and Cobro del banco keep the turn open too", async () => {
    const { user } = await openSeededTable({ actions: floatedPair });
    const dialog = await openTurn(user, "PRR");
    await typeOn(user, dialog, "80");
    await user.click(within(dialog).getByRole("button", { name: "Pagar costo" }));
    let view = await screen.findByRole("dialog");
    await typeOn(user, view, "40");
    await user.click(within(view).getByRole("button", { name: /^Pagar \$40/ }));
    await screen.findByText(byLine(/PRR paga \$40/), { selector: ".turn-summary li" });
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cobro del banco" }));
    view = await screen.findByRole("dialog");
    await typeOn(user, view, "10");
    await user.type(within(view).getByPlaceholderText("obligatorio"), "subvención");
    await user.click(within(view).getByRole("button", { name: /^Cobrar \$10/ }));
    await screen.findByText(byLine(/El banco paga \$10 a PRR/), { selector: ".turn-summary li" });
    const after = await screen.findByRole("dialog");
    expect(keypadValue(after)).toContain("80");
    expect(within(after).getByText(byLine(/PRR paga \$40/))).toBeTruthy();
    expect(within(after).getByText(byLine(/El banco paga \$10 a PRR/))).toBeTruthy();
  });

  it("closing the sheet drops typed revenue but keeps what was recorded, and the company stays current", async () => {
    const { user } = await openSeededTable({ actions: floatedPair });
    await typeOn(user, await openTurn(user, "PRR"), "80");
    await buyBankTrain(user, "2");
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cerrar" }));
    const dialog = await openTurn(user, "PRR");
    expect(keypadValue(dialog)).not.toContain("80");
    expect(within(dialog).getByText(byLine(/PRR compra un 2 al banco/))).toBeTruthy();
  });
});

describe("operating order (US3)", () => {
  it("the current company's card opens its turn; another card opens its details with Operar fuera de turno (FR-011)", async () => {
    const { user } = await openSeededTable({ actions: floatedPair });
    const current = await openCompany(user, "PRR");
    expect(within(current).getByRole("button", { name: /^Terminar turno/ })).toBeTruthy();
    await user.click(within(current).getByRole("button", { name: "Cerrar" }));
    const details = await openCompany(user, "NYC");
    expect(within(details).queryByRole("button", { name: "Pagar" })).toBeNull();
    expect(within(details).getByRole("button", { name: "Operar fuera de turno…" })).toBeTruthy();
  });

  it("out of turn: a banner, no No corrió and no Terminar turno, and the action is marked (FR-012)", async () => {
    const { user } = await openSeededTable({ actions: floatedPair });
    const details = await openCompany(user, "NYC");
    await user.click(within(details).getByRole("button", { name: "Operar fuera de turno…" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText(byLine("Fuera de turno: le toca a PRR. Lo que registres quedará marcado en el historial."))).toBeTruthy();
    expect(within(sheet).queryByRole("button", { name: "No corrió" })).toBeNull();
    expect(within(sheet).queryByRole("button", { name: /^Terminar turno/ })).toBeNull();
    expect(within(sheet).getByRole("button", { name: "Pagar" })).toBeTruthy();
    await user.click(within(sheet).getByRole("button", { name: "Pagar costo" }));
    const cost = await screen.findByRole("dialog");
    await typeOn(user, cost, "20");
    await user.click(within(cost).getByRole("button", { name: /^Pagar \$20/ }));
    expect(await screen.findByText(/NYC opera fuera de turno \(le toca a PRR\)/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Operar PRR" })).toBeTruthy();
  });

  it("the round controls name the next company (FR-010)", async () => {
    await openSeededTable({ actions: floatedPair });
    expect(screen.getByText(byLine("Después: NYC"))).toBeTruthy();
  });

  it("outside an OR a company card opens the stock sheet", async () => {
    const { user } = await openSeededTable({ actions: [...floatedPair, { type: "startSR" }] });
    const sheet = await openCompany(user, "NYC");
    expect(within(sheet).queryByRole("button", { name: "Operar fuera de turno…" })).toBeNull();
    expect(within(sheet).getAllByRole("button", { name: /^IPO / }).length).toBeGreaterThan(0);
  });
});

describe("trains line in the operating sheet (feature 011, US2)", () => {
  const floated = [shares("PRR", "player:p1", 6, true), startOR];

  it("shows Sin trenes under the title", async () => {
    const { user } = await openSeededTable({ actions: floated });
    const dialog = await openCompany(user, "PRR");
    expect(within(dialog).getByTestId("trains-line").textContent).toMatch(/^Sin trenes/);
  });

  it("after buying a 2: Trenes 1/4 and one train card (feature 013)", async () => {
    const { user } = await openSeededTable({ actions: [...floated, buyTrain("PRR", "2")] });
    const dialog = await openCompany(user, "PRR");
    const line = within(dialog).getByTestId("trains-line");
    expect(line.textContent).toMatch(/^Trenes 1\/4/);
    const cards = within(within(line).getByRole("list", { name: "Trenes" })).getAllByRole("listitem");
    expect(cards.map((c) => c.textContent)).toEqual(["2"]);
    expect(within(line).getByRole("button", { name: "Corregir…" })).toBeTruthy();
  });

  it("over the limit: sobre el límite, next to the existing over-limit button", async () => {
    const buy = (player: string) => ({ type: "buyShare", buyer: `player:${player}`, company: "PRR", source: "ipo", count: 2 });
    const realFloat = [{ type: "startSR" }, { type: "parCompany", player: "p1", company: "PRR", price: 100 }, buy("p1"), buy("p2"), { type: "endSR" }, startOR];
    const { user } = await openSeededTable({
      actions: [...realFloat, buyTrain("PRR", "2"), buyTrain("PRR", "2"), buyTrain("PRR", "3"), { type: "setPhase", phase: "5" }],
    });
    const dialog = await openCompany(user, "PRR");
    const line = within(dialog).getByTestId("trains-line");
    expect(line.textContent).toMatch(/sobre el límite/);
    expect(line.classList.contains("warn")).toBe(true);
    expect(within(line).getAllByRole("listitem").map((c) => c.textContent)).toEqual(["2", "2", "3"]);
    expect(within(dialog).getByRole("button", { name: /Elegir cuál va al pool/ })).toBeTruthy();
  });

  it("the company card shows its trains as cards, in type order (feature 013)", async () => {
    await openSeededTable({ actions: [...floated, buyTrain("PRR", "3"), buyTrain("PRR", "2")] });
    const card = screen.getByTestId("treasury-PRR").closest("button")!;
    // Inside a button the list roles are presentational: the cards are read as the button's text.
    const cards = [...card.querySelectorAll(".train-cards .train-card")];
    expect(cards.map((c) => c.textContent)).toEqual(["2", "3"]);
    expect(card.textContent).not.toContain("Trenes:");
  });

  it("a rusted train kept for a last run says oxidado on its card (feature 013, FR-008)", async () => {
    const rust = { type: "adjustCounter", subject: "company:PRR", key: "rusted:train:2:1", delta: 1 };
    await openSeededTable({ actions: [...floated, buyTrain("PRR", "2"), rust] });
    const card = screen.getByTestId("treasury-PRR").closest("button")!;
    const [train] = card.querySelectorAll(".train-card");
    expect(train!.textContent).toBe("2oxidado");
    expect(train!.classList.contains("rusted")).toBe(true);
  });
});

describe("company badges in the operating sheet (feature 013, US1)", () => {
  const badgeOf = (el: Element | null, short: string) =>
    [...(el?.querySelectorAll<HTMLElement>(".company-badge") ?? [])].find((b) => b.textContent === short);

  it("this turn's entries show the company as its badge", async () => {
    const { user } = await openSeededTable({ actions: floatedPair });
    const dialog = await openTurn(user, "PRR");
    await typeOn(user, dialog, "80");
    await buyBankTrain(user, "2");
    const after = await screen.findByRole("dialog");
    const entry = [...after.querySelectorAll(".turn-summary li")].find((li) => /PRR compra un 2/.test(li.textContent));
    expect(badgeOf(entry ?? null, "PRR")).toBeTruthy();
  });

  it("the out-of-turn notice shows the current company as its badge", async () => {
    const { user } = await openSeededTable({ actions: floatedPair });
    const details = await openCompany(user, "NYC");
    await user.click(within(details).getByRole("button", { name: "Operar fuera de turno…" }));
    const note = (await screen.findByRole("dialog")).querySelector(".out-of-turn")!;
    expect(badgeOf(note, "PRR")).toBeTruthy();
    expect(note.textContent).toBe("Fuera de turno: le toca a PRR. Lo que registres quedará marcado en el historial.");
  });

  it("the undo toast shows the company as its badge", async () => {
    const { user } = await openSeededTable({ actions: floatedPair });
    const dialog = await openTurn(user, "PRR");
    await typeOn(user, dialog, "40");
    await user.click(within(dialog).getByRole("button", { name: "Pagar costo" }));
    const cost = await screen.findByRole("dialog");
    await typeOn(user, cost, "40");
    await user.click(within(cost).getByRole("button", { name: /^Pagar \$40/ }));
    const toast = await screen.findByText((_, el) => el?.classList.contains("toast-summary") === true && /PRR paga \$40/.test(el.textContent));
    expect(badgeOf(toast, "PRR")).toBeTruthy();
  });
});
