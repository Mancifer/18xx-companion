import { screen, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { byLine, cashText, openSeededTable } from "./helpers";

/** Feature 011, US1: selling and buying from the player sheet (contracts/ui.md §1). */

type User = ReturnType<typeof userEvent.setup>;

const startSR = { type: "startSR" };
const par = (player: string, company: string, price: number) => ({ type: "parCompany", player, company, price });
const buy = (player: string, company: string, count: number) => ({ type: "buyShare", buyer: `player:${player}`, company, source: "ipo", count });
const toPool = (company: string, units: number) => ({
  type: "transferShares",
  company,
  from: `ipo:${company}`,
  to: "pool",
  units,
  presidency: null,
});

async function openPlayer(user: User, id: string): Promise<HTMLElement> {
  await user.click(screen.getByRole("tab", { name: "Jugadores" }));
  await user.click(screen.getByTestId(`cash-${id}`).closest("button")!);
  return screen.findByRole("dialog");
}

const toastText = async (text: RegExp) => (await screen.findByText(byLine(text), { selector: ".toast-summary" })).closest(".toast")!.textContent;

describe("player sheet sections (FR-001, FR-003)", () => {
  it("shows Jugada before Ajustes, with every adjustment under Ajustes", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100)] });
    const dialog = await openPlayer(user, "p1");
    const jugada = within(dialog).getByRole("group", { name: "Jugada" });
    const ajustes = within(dialog).getByRole("group", { name: "Ajustes" });
    expect(jugada.compareDocumentPosition(ajustes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const name of ["Pagar…", "Cobrar del banco", "Fijar dinero", "Mover acciones", /^Ajustar deuda/, "Declarar quiebra"]) {
      expect(within(ajustes).getByRole("button", { name })).toBeTruthy();
    }
    expect(within(jugada).getByRole("button", { name: "Vender acciones" })).toBeTruthy();
    expect(within(jugada).getByRole("button", { name: "Comprar acción" })).toBeTruthy();
  });
});

describe("quick sell in the SR (US1-1, FR-004)", () => {
  it("Vender 1 PRR sells one share like the company-side sale", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100), buy("p2", "PRR", 2)] });
    const dialog = await openPlayer(user, "p2");
    expect(cashText("p2")).toBe("$400");
    await user.click(within(dialog).getByRole("button", { name: "Vender 1 PRR · $100" }));
    expect(await toastText(/Bruno vende 1 PRR/)).toMatch(/Bruno vende 1 PRR por \$100/);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cashText("p2")).toBe("$500");
  });

  it("no quick sell outside the SR; Canjear privada… comes before Vender acciones (US1-6)", async () => {
    const { user } = await openSeededTable({
      actions: [
        startSR,
        { type: "buyPrivate", buyer: "p2", private: "MH", price: 110, par: null },
        par("p1", "PRR", 100),
        buy("p2", "PRR", 2),
        buy("p3", "PRR", 2),
        { type: "endSR" },
        { type: "startOR" },
      ],
    });
    const dialog = await openPlayer(user, "p2");
    expect(within(dialog).queryByRole("button", { name: /^Vender 1 / })).toBeNull();
    const jugada = within(dialog).getByRole("group", { name: "Jugada" });
    const names = within(jugada).getAllByRole("button").map((b) => b.textContent);
    expect(names.indexOf("Canjear privada…")).toBeGreaterThanOrEqual(0);
    expect(names.indexOf("Canjear privada…")).toBeLessThan(names.indexOf("Vender acciones"));
  });
});

describe("Vender acciones view (US1-3, FR-005)", () => {
  it("preselects the only holding, caps the stepper and sells N", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100), buy("p2", "PRR", 2)] });
    const dialog = await openPlayer(user, "p2");
    await user.click(within(dialog).getByRole("button", { name: "Vender acciones" }));
    const sell = await screen.findByRole("dialog");
    expect(within(sell).getByRole("button", { name: /PRR 20% · \$100/ }).getAttribute("aria-pressed")).toBe("true");
    const more = within(sell).getByRole("button", { name: "Más" });
    await user.click(more);
    await user.click(more);
    await user.click(more);
    await user.click(within(sell).getByRole("button", { name: "Vender 2 · cobra $200" }));
    expect(await toastText(/Bruno vende 2 PRR/)).toBeTruthy();
    expect(cashText("p2")).toBe("$600");
  });

  it("is disabled with a reason when the player has no shares; Comprar acción stays enabled (US1-4)", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100)] });
    const dialog = await openPlayer(user, "p3");
    const sell = within(dialog).getByRole<HTMLButtonElement>("button", { name: "Vender acciones" });
    expect(sell.disabled).toBe(true);
    expect(sell.title).toBe("No tiene acciones para vender");
    expect(within(dialog).getByRole<HTMLButtonElement>("button", { name: "Comprar acción" }).disabled).toBe(false);
  });

  it("a sale over the pool limit still applies and shows the same warning (US1-5, FR-008)", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100), buy("p2", "PRR", 2), toPool("PRR", 5)] });
    const dialog = await openPlayer(user, "p2");
    await user.click(within(dialog).getByRole("button", { name: "Vender 1 PRR · $100" }));
    expect(await toastText(/Bruno vende 1 PRR/)).toMatch(/El pool tendría 6 certificados; el máximo es 5\./);
    expect(cashText("p2")).toBe("$500");
  });
});

describe("Comprar acción view (FR-006)", () => {
  it("lists open companies only; source buttons follow availability; one tap buys", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100), par("p3", "NYC", 90)] });
    const dialog = await openPlayer(user, "p2");
    await user.click(within(dialog).getByRole("button", { name: "Comprar acción" }));
    const view = await screen.findByRole("dialog");
    expect(within(view).queryByRole("button", { name: /B&O/ })).toBeNull();
    expect(within(view).queryByRole("button", { name: /^IPO / })).toBeNull();
    await user.click(within(view).getByRole("button", { name: /NYC/ }));
    const pool = within(view).getByRole<HTMLButtonElement>("button", { name: "Pool $90" });
    expect(pool.disabled).toBe(true);
    expect(pool.title).not.toBe("");
    await user.click(within(view).getByRole("button", { name: "IPO $90" }));
    expect(await toastText(/Bruno compra 1 NYC de la IPO/)).toBeTruthy();
    expect(cashText("p2")).toBe("$510");
  });

  it("preselects the only open company, so the sources show at once", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100)] });
    const dialog = await openPlayer(user, "p2");
    await user.click(within(dialog).getByRole("button", { name: "Comprar acción" }));
    const view = await screen.findByRole("dialog");
    expect(within(view).getByRole("button", { name: "IPO $100" })).toBeTruthy();
  });
});

describe("Ajustes show companies as badges (bug pay-modal-company-colors, feature 013 FR-001)", () => {
  const badge = (el: HTMLElement) => el.querySelector<HTMLElement>(".company-badge");

  it("Pagar… lists company targets as badges and names the badge in the confirm button", async () => {
    const { user } = await openSeededTable();
    await user.click(within(await openPlayer(user, "p1")).getByRole("button", { name: "Pagar…" }));
    const dialog = await screen.findByRole("dialog");
    const prr = within(dialog).getByRole("button", { name: "PRR" });
    expect(badge(prr)?.textContent).toBe("PRR");
    expect(badge(within(dialog).getByRole("button", { name: "el banco" }))).toBeNull();
    await user.click(prr);
    for (const d of "30") await user.click(within(dialog).getByRole("button", { name: new RegExp(`^${d}$`) }));
    const confirm = within(dialog).getByRole("button", { name: /^Pagar \$30 a PRR$/ });
    expect(badge(confirm)?.textContent).toBe("PRR");
  });

  it("Mover acciones lists company holders as badges with their units", async () => {
    const { user } = await openSeededTable();
    await user.click(within(await openPlayer(user, "p1")).getByRole("button", { name: "Mover acciones" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getAllByRole("button", { name: /^PRR/ })[0]!);
    const ipo = within(dialog).getByRole("button", { name: /^la IPO de PRR \(\d+\)$/ });
    expect(badge(ipo)?.textContent).toBe("PRR");
  });
});

describe("holdings table (016 US2, contracts/ui.md §2)", () => {
  const give = (company: string, units: number, to = "p1") => ({
    type: "transferShares",
    company,
    from: `ipo:${company}`,
    to: `player:${to}`,
    units,
    presidency: null,
  });
  // Ana: the PRR presidency + 2 shares (40%, 3 cards) and one share each of NYC, B&O and C&O.
  const FOUR = [
    startSR,
    par("p1", "PRR", 100),
    buy("p1", "PRR", 2),
    par("p2", "NYC", 100),
    par("p3", "B&O", 100),
    par("p4", "C&O", 100),
    give("NYC", 1),
    give("B&O", 1),
    give("C&O", 1),
  ];
  const rowOf = (dialog: HTMLElement, short: string) =>
    within(dialog)
      .getAllByRole("row")
      .find((r) => within(r).queryAllByText(short, { exact: true }).length > 0)!;

  it("one row per company: %, ★ for the presidency, cards; the total against the limit", async () => {
    const { user } = await openSeededTable({ actions: FOUR });
    const dialog = await openPlayer(user, "p1");
    const table = within(dialog).getByRole("table", { name: "Acciones" });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    const prr = rowOf(dialog, "PRR");
    expect(prr.textContent).toMatch(/40%★/);
    expect(prr.textContent).toMatch(/3 cert\./);
    expect(rowOf(dialog, "NYC").textContent).toMatch(/10%.*1 cert\./);
    expect(rowOf(dialog, "NYC").textContent).not.toMatch(/★/);
    expect(within(dialog).getByText("6 / 16 cert.")).toBeTruthy();
  });

  it("the certificate summary sits in the header next to cash, not under the table (016 US7, FR-034)", async () => {
    const { user } = await openSeededTable({ actions: FOUR });
    const dialog = await openPlayer(user, "p1");
    const figures = dialog.querySelector(".sheet-figures")!;
    expect(figures.querySelector(".sheet-figure")?.textContent).toBe("$200");
    expect(within(figures as HTMLElement).getByText("6 / 16 cert.")).toBeTruthy();
    const table = within(dialog).getByRole("table", { name: "Acciones" });
    expect(table.parentElement?.querySelector(".holdings-total")).toBeNull();
    expect(within(dialog).queryByText(/^Certificados:/)).toBeNull();
  });

  it("the summary is shown when cash is hidden (bank only)", async () => {
    const { user } = await openSeededTable({ actions: FOUR, walletMode: "bankOnly" });
    const dialog = await openPlayer(user, "p1");
    expect(dialog.querySelector(".sheet-figure")).toBeNull();
    expect(within(dialog.querySelector(".sheet-figures") as HTMLElement).getByText("6 / 16 cert.")).toBeTruthy();
  });

  it("in the SR each row's Vender 1 sells that company in one tap", async () => {
    const { user } = await openSeededTable({ actions: FOUR });
    const dialog = await openPlayer(user, "p1");
    await user.click(within(rowOf(dialog, "NYC")).getByRole("button", { name: "Vender 1 NYC · $100" }));
    expect(await toastText(/Ana vende 1 NYC/)).toMatch(/Ana vende 1 NYC por \$100/);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("outside the SR each row's Vender… opens the count picker with that company chosen", async () => {
    const { user } = await openSeededTable({ actions: [...FOUR, { type: "endSR" }, { type: "startOR" }] });
    const dialog = await openPlayer(user, "p1");
    expect(within(dialog).queryByRole("button", { name: /^Vender 1 / })).toBeNull();
    await user.click(within(rowOf(dialog, "B&O")).getByRole("button", { name: "Vender…" }));
    const sell = await screen.findByRole("dialog");
    expect(within(sell).getByRole("button", { name: /B&O 10%/ }).getAttribute("aria-pressed")).toBe("true");
    expect(within(sell).getByRole("button", { name: "Vender 1 · cobra $100" })).toBeTruthy();
  });

  it("Vender acciones and Comprar acción stay; the old row of quick sells is gone", async () => {
    const { user } = await openSeededTable({ actions: FOUR });
    const dialog = await openPlayer(user, "p1");
    const jugada = within(dialog).getByRole("group", { name: "Jugada" });
    expect(within(jugada).getByRole("button", { name: "Vender acciones" })).toBeTruthy();
    expect(within(jugada).getByRole("button", { name: "Comprar acción" })).toBeTruthy();
    expect(within(jugada).queryByRole("button", { name: /^Vender 1 / })).toBeNull();
  });

  it("at and over the limit, a text badge; nothing is blocked", async () => {
    // 6 cards so far. One more each of NYC, B&O and C&O ties their presidents (no takeover): 9.
    // Then 7 shares of companies nobody has opened: 16.
    const atLimit = [...FOUR, give("NYC", 1), give("B&O", 1), give("C&O", 1), give("CPR", 4), give("Erie", 3)];
    const { user } = await openSeededTable({ actions: atLimit });
    const dialog = await openPlayer(user, "p1");
    expect(within(dialog).getByText("16 / 16 cert.")).toBeTruthy();
    expect(within(dialog).getByText("en el límite")).toBeTruthy();
    expect(within(dialog).getByRole<HTMLButtonElement>("button", { name: "Comprar acción" }).disabled).toBe(false);
  });

  it("over the limit", async () => {
    const over = [...FOUR, give("NYC", 1), give("B&O", 1), give("C&O", 1), give("CPR", 4), give("Erie", 4)];
    const { user } = await openSeededTable({ actions: over });
    const dialog = await openPlayer(user, "p1");
    expect(within(dialog).getByText("17 / 16 cert.")).toBeTruthy();
    expect(within(dialog).getByText("sobre el límite")).toBeTruthy();
  });

  it("a yellow-zone company says it doesn't count, and the total adds all the cards", async () => {
    const { user } = await openSeededTable({ actions: [...FOUR, { type: "setMarket", company: "NYC", cell: { row: 2, col: 1 } }] });
    const dialog = await openPlayer(user, "p1");
    expect(rowOf(dialog, "NYC").textContent).toMatch(/no cuenta/);
    expect(rowOf(dialog, "PRR").textContent).not.toMatch(/no cuenta/);
    expect(within(dialog).getByText("5 / 16 cert. (6 en total)")).toBeTruthy();
  });

  it("a player without shares sees «Sin acciones» and no total", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100)] });
    const dialog = await openPlayer(user, "p3");
    expect(within(dialog).getByText("Sin acciones")).toBeTruthy();
    expect(within(dialog).queryByText(/ cert\.$/)).toBeNull();
  });
});
