import { screen, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { cashText, openSeededTable } from "./helpers";

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

const toastText = async (text: RegExp) => (await screen.findByText(text, { selector: ".toast-summary" })).closest(".toast")!.textContent;

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
