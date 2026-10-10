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

describe("History marks out-of-turn actions (T028, FR-012)", () => {
  it("an operating action for a company whose turn it is not shows the outOfTurn warning", async () => {
    const { user } = await openSeededTable({
      actions: [
        { type: "startSR" },
        { type: "parCompany", player: "p1", company: "PRR", price: 100 },
        { type: "buyShare", buyer: "player:p1", company: "PRR", source: "ipo", count: 4 },
        { type: "parCompany", player: "p2", company: "NYC", price: 90 },
        { type: "buyShare", buyer: "player:p2", company: "NYC", source: "ipo", count: 4 },
        { type: "endSR" },
        { type: "startOR" },
        { type: "payCost", company: "NYC", amount: 20, reason: null },
      ],
    });
    await openMenuItem(user, "Historial");
    expect(item("NYC paga $20").textContent).toContain("NYC opera fuera de turno (le toca a PRR).");
  });
});

describe("History: the game end (feature 007, contracts/ui.md §4)", () => {
  async function endFromMenu(user: Awaited<ReturnType<typeof openSeededTable>>["user"]) {
    await openMenuItem(user, "Terminar partida");
    await user.click(within(await screen.findByRole("dialog", { name: "¿Terminar la partida?" })).getByRole("button", { name: "Terminar" }));
    await screen.findByRole("heading", { name: "Resultados" });
    await user.click(screen.getByRole("button", { name: "Volver" }));
  }

  it("an endGame entry reads Fin de la partida with its conditions, and can be undone but not corrected", async () => {
    const { user } = await openSeededTable();
    await endFromMenu(user);
    await openMenuItem(user, "Historial");
    const entry = item("Fin de la partida (sin condición de fin)");
    expect(within(entry).getByRole("button", { name: "Deshacer" })).toBeTruthy();
    expect(within(entry).queryByRole("button", { name: "Corregir" })).toBeNull();
  });

  it("the group that reached an automatic end carries Fin de la partida (automático)", async () => {
    const setTurn = { type: "setTurn", round: "OR", srNumber: 4, orSet: 4, orIndex: 1, orsInSet: 2, company: null };
    const { user } = await openSeededTable({ game: "rotla", players: ["Ana", "Bruno", "Carla"], options: { mode: "short" }, actions: [setTurn] });
    await user.click(screen.getByRole("button", { name: /^Turno:/ }));
    const sheet = await screen.findByRole("dialog", { name: "Turno y fase" });
    await user.click(within(sheet).getByRole("button", { name: "OR del set: más" }));
    await user.click(within(sheet).getByRole("button", { name: "Fijar turno" }));
    await screen.findByRole("heading", { name: "Resultados" });
    await user.click(screen.getByRole("button", { name: "Volver" }));
    await openMenuItem(user, "Historial");
    const tagged = screen.getAllByText("Fin de la partida (automático)");
    expect(tagged).toHaveLength(1);
    expect(tagged[0]!.closest("li")?.getAttribute("data-group")).toBe("g3");
  });
});

describe("History: a reopened game (feature 007, US4-3)", () => {
  type User = Awaited<ReturnType<typeof openSeededTable>>["user"];
  async function setOrIndex(user: User, button: "más" | "menos") {
    await user.click(screen.getByRole("button", { name: /^Turno:/ }));
    const sheet = await screen.findByRole("dialog", { name: "Turno y fase" });
    await user.click(within(sheet).getByRole("button", { name: `OR del set: ${button}` }));
    await user.click(within(sheet).getByRole("button", { name: "Fijar turno" }));
  }
  async function reopen(user: User) {
    await user.click(await screen.findByRole("button", { name: "Reabrir partida" }));
    await user.click(within(await screen.findByRole("dialog", { name: "¿Reabrir la partida?" })).getByRole("button", { name: "Reabrir" }));
    await screen.findByRole("button", { name: "Menú" });
  }

  it("shows the end and the reopening, earlier entries unchanged", async () => {
    const { user } = await openSeededTable({ actions: [pay("player:p1", "bank", 100)] });
    await openMenuItem(user, "Terminar partida");
    await user.click(within(await screen.findByRole("dialog", { name: "¿Terminar la partida?" })).getByRole("button", { name: "Terminar" }));
    await reopen(user);
    await openMenuItem(user, "Historial");
    expect(item("Fin de la partida (sin condición de fin)")).toBeTruthy();
    expect(item("Partida reabierta")).toBeTruthy();
    expect(within(item("Ana paga $100 al banco")).queryByText("deshecha")).toBeNull();
  });

  it("RotLA: the reached end keeps its automático tag after a reopening, and a new automatic end is tagged too", async () => {
    const setTurn = { type: "setTurn", round: "OR", srNumber: 4, orSet: 4, orIndex: 1, orsInSet: 2, company: null };
    const { user } = await openSeededTable({ game: "rotla", players: ["Ana", "Bruno", "Carla"], options: { mode: "short" }, actions: [setTurn] });
    await setOrIndex(user, "más");
    await screen.findByRole("heading", { name: "Resultados" });
    await reopen(user);
    await openMenuItem(user, "Historial");
    expect(screen.getAllByText("Fin de la partida (automático)")).toHaveLength(1);
    expect(item("Partida reabierta")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Volver" }));

    await setOrIndex(user, "menos");
    await setOrIndex(user, "más");
    await screen.findByRole("heading", { name: "Resultados" });
    await user.click(screen.getByRole("button", { name: "Volver" }));
    await openMenuItem(user, "Historial");
    expect(screen.getAllByText("Fin de la partida (automático)")).toHaveLength(2);
  });
});
