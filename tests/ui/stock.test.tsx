import { screen, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { byLine, cashText, openSeededTable } from "./helpers";

type User = ReturnType<typeof userEvent.setup>;

const startSR = { type: "startSR" };
const par = (player: string, company: string, price: number) => ({ type: "parCompany", player, company, price });
const buy = (player: string, company: string, count: number) => ({
  type: "buyShare",
  buyer: `player:${player}`,
  company,
  source: "ipo",
  count,
});

async function companiesTab(user: User) {
  await user.click(screen.getByRole("tab", { name: "Compañías" }));
}

function card(company: string): HTMLElement {
  return screen.getByTestId(`treasury-${company}`).closest("button")!;
}

describe("StockSheet (US4)", () => {
  it("buying takes two taps from the Table (FR-100)", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100)] });
    await companiesTab(user);
    await user.click(card("PRR")); // tap 1
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "IPO Bruno" })); // tap 2
    expect(await screen.findByText(byLine(/Bruno compra 1 PRR de la IPO/))).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Jugadores" }));
    expect(cashText("p2")).toBe("$500");
  });

  it("selling takes two taps from the Table", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100), buy("p2", "PRR", 2)] });
    await companiesTab(user);
    await user.click(card("PRR"));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Vender Bruno" }));
    expect(await screen.findByText(byLine(/Bruno vende 1 PRR/))).toBeTruthy();
  });

  it("an unstarted company asks for the par price, then who opens it", async () => {
    const { user } = await openSeededTable({ actions: [startSR] });
    await companiesTab(user);
    await user.click(card("NYC"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "$82" }));
    await user.click(within(dialog).getByRole("button", { name: "Carla" }));
    expect(await screen.findByText(byLine(/Carla abre la NYC a \$82/))).toBeTruthy();
  });

  it("the presidency change appears in the toast", async () => {
    const { user } = await openSeededTable({
      actions: [startSR, par("p1", "PRR", 100), buy("p2", "PRR", 2)],
    });
    await companiesTab(user);
    await user.click(card("PRR"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Más" }));
    await user.click(within(dialog).getByRole("button", { name: "IPO Bruno" }));
    expect(await screen.findByText(byLine(/Presidencia de la PRR: Ana → Bruno/))).toBeTruthy();
  });
});

describe("share sources (feature 013, US3)", () => {
  const sell = (player: string, company: string, count: number) => ({ type: "sellShares", seller: `player:${player}`, company, count });

  it("each source is its own tile with its count and price; the old inline line is gone", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100), buy("p2", "PRR", 2), sell("p2", "PRR", 1)] });
    await companiesTab(user);
    await user.click(card("PRR"));
    const dialog = await screen.findByRole("dialog");
    const ipo = within(dialog).getByTestId("source-ipo");
    expect(ipo.textContent).toContain("IPO");
    expect(ipo.textContent).toContain("6");
    expect(ipo.textContent).toMatch(/a \$\d+/);
    const pool = within(dialog).getByTestId("source-pool");
    expect(pool.textContent).toContain("Pool");
    expect(pool.textContent).toContain("1");
    expect(pool.textContent).toMatch(/a \$\d+/);
    expect(within(dialog).queryByText(/IPO \d+ · Pool \d+/)).toBeNull();
    expect(within(dialog).queryByText(/^Pool a \$/)).toBeNull();
  });

  it("an empty source says agotada", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100)] });
    await companiesTab(user);
    await user.click(card("PRR"));
    const pool = within(await screen.findByRole("dialog")).getByTestId("source-pool");
    expect(pool.textContent).toContain("0 agotada");
    expect(pool.classList.contains("empty")).toBe(true);
  });

  it("buying from a tile's source still takes one tap in the player's row", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100)] });
    await companiesTab(user);
    await user.click(card("PRR"));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "IPO Bruno" }));
    expect(await screen.findByText(byLine(/Bruno compra 1 PRR de la IPO/))).toBeTruthy();
  });
});

describe("BatchSheet (US4-5)", () => {
  it("shows the rows in order with editable assumed prices, then records one group", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "Erie", 90), buy("p3", "Erie", 3)] });
    await user.click(screen.getByRole("button", { name: "Lote de acciones" }));

    const addRow = async (kind: string, player: string, company: string) => {
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: `+ ${kind}` }));
      const row = screen.getByRole("dialog");
      await user.click(within(row).getByRole("button", { name: player }));
      await user.click(within(row).getByRole("button", { name: company }));
      await user.click(within(row).getByRole("button", { name: "Añadir fila" }));
    };
    await addRow("Compra IPO", "Bruno", "Erie");
    await addRow("Venta", "Carla", "Erie");
    await addRow("Compra pool", "Dani", "Erie");

    const rows = within(screen.getByRole("dialog")).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Bruno compra 1 Erie de la IPO"),
      expect.stringContaining("Carla vende 1 Erie"),
      expect.stringContaining("Dani compra 1 Erie del pool"),
    ]);
    // Defaults follow the order: the sale drops the price before Dani's pool purchase.
    expect(within(rows[2]!).getByRole("button", { name: "Precio de la fila 3" }).textContent).toBe("$82");

    await user.click(within(rows[2]!).getByRole("button", { name: "Precio de la fila 3" }));
    const editor = screen.getByRole("dialog");
    await user.click(within(editor).getByRole("button", { name: "Vaciar" }));
    for (const d of "80") await user.click(within(editor).getByRole("button", { name: new RegExp(`^${d}$`) }));
    await user.click(within(editor).getByRole("button", { name: "Listo" }));
    expect(screen.getByRole("button", { name: "Precio de la fila 3" }).textContent).toContain("$80");

    await user.click(screen.getByRole("button", { name: "Anotar el lote (3)" }));
    expect(await screen.findByText(/^Lote: /)).toBeTruthy();
    expect(cashText("p4")).toBe("$520");
  });
});

describe("PrivatesSheet (bug private-company-ownership)", () => {
  it("1848 does not offer a private a player already owns", async () => {
    const { user } = await openSeededTable({
      game: "1848",
      actions: [{ type: "buyPrivate", buyer: "p1", private: "P1", price: 30, par: null }],
    });
    await user.click(screen.getByRole("button", { name: "Comprar privada" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: /Melbourne/ })).toBeNull();
    expect(within(dialog).getByRole("button", { name: /Oodnadatta/ })).toBeTruthy();
  });
});

describe("company traders in a corporate round (feature 013, US1)", () => {
  it("a company trading in the 21Moon CR shows as its badge; the buttons keep their names", async () => {
    const { user } = await openSeededTable({
      game: "21moon",
      players: ["Ana", "Bruno", "Carla"],
      actions: [startSR, par("p1", "VH", 80), buy("p2", "VH", 4), par("p3", "SSF", 80), buy("p2", "SSF", 4), { type: "startCR" }],
    });
    await user.click(card("SSF"));
    const sheet = await screen.findByRole("dialog");
    const row = [...sheet.querySelectorAll(".trader-row")].find((r) => r.querySelector(".trader-name .company-badge"));
    expect(row?.querySelector(".company-badge")?.textContent).toBe("VH");
    expect(within(sheet).getByRole("button", { name: "Pool VH" })).toBeTruthy();
  });
});
