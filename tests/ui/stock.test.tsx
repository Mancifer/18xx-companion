import { screen, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { cashText, openSeededTable } from "./helpers";

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
    expect(await screen.findByText(/Bruno compra 1 PRR de la IPO/)).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Jugadores" }));
    expect(cashText("p2")).toBe("$500");
  });

  it("selling takes two taps from the Table", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100), buy("p2", "PRR", 2)] });
    await companiesTab(user);
    await user.click(card("PRR"));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Vender Bruno" }));
    expect(await screen.findByText(/Bruno vende 1 PRR/)).toBeTruthy();
  });

  it("an unstarted company asks for the par price, then who opens it", async () => {
    const { user } = await openSeededTable({ actions: [startSR] });
    await companiesTab(user);
    await user.click(card("NYC"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "$82" }));
    await user.click(within(dialog).getByRole("button", { name: "Carla" }));
    expect(await screen.findByText(/Carla abre la NYC a \$82/)).toBeTruthy();
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
    expect(await screen.findByText(/Presidencia de la PRR: Ana → Bruno/)).toBeTruthy();
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
