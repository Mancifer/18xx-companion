import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cashText, openMenuItem, openSeededTable } from "./helpers";

const pay = (from: string, to: string, amount: number) => ({ type: "transferMoney", from, to, amount });

function item(text: RegExp | string): HTMLElement {
  const items = screen.getAllByRole("listitem").filter((li) => li.classList.contains("history-item"));
  const found = items.find((li) => (typeof text === "string" ? li.textContent.includes(text) : text.test(li.textContent)));
  if (!found) throw new Error(`No history item with ${String(text)}`);
  return found;
}

describe("History (US2)", () => {
  it("undo from History marks the entry reverted and balances revert", async () => {
    const { user } = await openSeededTable({ actions: [pay("player:p1", "bank", 100)] });
    expect(cashText("p1")).toBe("$500");

    await openMenuItem(user, "Historial");
    const entry = item("Ana paga $100 al banco");
    await user.click(within(entry).getByRole("button", { name: "Deshacer" }));

    expect(await within(entry).findByText("deshecha")).toBeTruthy();
    expect(entry.querySelector("s")?.textContent).toBe("Ana paga $100 al banco");
    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect(cashText("p1")).toBe("$600");
  });

  it("amend 240 → 260 shows the original and the correction", async () => {
    const { user } = await openSeededTable({ actions: [pay("bank", "player:p2", 240)] });
    await openMenuItem(user, "Historial");
    await user.click(within(item("El banco paga $240 a Bruno")).getByRole("button", { name: "Corregir" }));

    const sheet = await screen.findByRole("dialog");
    await user.click(within(sheet).getByRole("button", { name: /^Cantidad/ }));
    const keypad = await screen.findByRole("dialog");
    await user.click(within(keypad).getByRole("button", { name: "Vaciar" }));
    for (const d of "260") await user.click(within(keypad).getByRole("button", { name: new RegExp(`^${d}$`) }));
    await user.click(within(keypad).getByRole("button", { name: "Listo" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Corregir" }));

    const amended = await screen.findByText("corregida");
    const li = amended.closest("li")!;
    expect(li.querySelector("s")?.textContent).toBe("El banco paga $240 a Bruno");
    expect(li.textContent).toContain("El banco paga $260 a Bruno");
    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect(cashText("p2")).toBe("$860");
  });

  it("warns about later entries that touch the same company before undoing", async () => {
    const { user } = await openSeededTable({
      actions: [pay("bank", "company:PRR", 300), pay("company:PRR", "player:p3", 50)],
    });
    await openMenuItem(user, "Historial");
    await user.click(within(item("El banco paga $300 a PRR")).getByRole("button", { name: "Deshacer" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Hay 1 entrada posterior que depende de esta")).toBeTruthy();
    expect(within(dialog).getByText("PRR paga $50 a Carla")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText("deshecha")).toBeNull();

    await user.click(within(item("El banco paga $300 a PRR")).getByRole("button", { name: "Deshacer" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Aplicar igualmente" }));
    expect(await screen.findByText("deshecha")).toBeTruthy();
  });
});
