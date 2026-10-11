import { screen, waitFor, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { getBuiltInGame } from "../../src/domain/games";
import { openCompanionDb } from "../../src/persistence/db";
import { SessionRepo } from "../../src/persistence/sessionRepo";
import { openMenuItem, openSeededTable } from "./helpers";

type User = ReturnType<typeof userEvent.setup>;

async function playerAction(user: User, player: string, action: string, amount: number, confirm: RegExp) {
  await user.click(screen.getByText(player, { selector: ".player-name" }).closest("button")!);
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: action }));
  const dialog = await screen.findByRole("dialog");
  for (const d of String(amount)) await user.click(within(dialog).getByRole("button", { name: new RegExp(`^${d}$`) }));
  return within(dialog).getByRole("button", { name: confirm });
}

describe("chips in the toast (US6, FR-081)", () => {
  it("a bank payment of 287 shows the fewest chips (default chips)", async () => {
    const { user } = await openSeededTable();
    const pay = await playerAction(user, "Ana", "Cobrar del banco", 287, /^Cobrar/);
    await user.click(pay);
    const toast = (await screen.findByText(/El banco paga \$287 a Ana/)).closest(".toast") as HTMLElement;
    expect(within(toast).getByText(/El banco paga a Ana \$287/)).toBeTruthy();
    expect(within(toast).getAllByLabelText(/×/).map((el) => el.getAttribute("aria-label"))).toEqual([
      "2 × 100",
      "3 × 25",
      "2 × 5",
      "2 × 1",
    ]);
  });

  it("paying 30 to the bank with a 100 shows 70 in change", async () => {
    const { user } = await openSeededTable();
    await user.click(screen.getByText("Ana", { selector: ".player-name" }).closest("button")!);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Pagar…" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "el banco" }));
    for (const d of "30") await user.click(within(dialog).getByRole("button", { name: new RegExp(`^${d}$`) }));
    await user.click(within(dialog).getByRole("button", { name: /^Pagar \$30/ }));

    const toast = (await screen.findByText(/Ana paga \$30 al banco/)).closest(".toast") as HTMLElement;
    await user.click(within(toast).getByRole("button", { name: "100" }));
    const change = toast.querySelector<HTMLElement>(".chip-change")!;
    expect(within(change).getByText("cambio:")).toBeTruthy();
    expect(within(change).getAllByLabelText(/×/).map((el) => el.getAttribute("aria-label"))).toEqual(["2 × 25", "4 × 5"]);
  });
});

describe("the chip editor without labels (feature 008, US2)", () => {
  async function openChips(user: User) {
    await openMenuItem(user, "Fichas");
    return screen.findByRole("dialog");
  }

  async function collect(user: User, amount: number) {
    await user.click(await playerAction(user, "Ana", "Cobrar del banco", amount, /^Cobrar/));
    const toast = (await screen.findByText(new RegExp(`El banco paga \\$${amount} a Ana`))).closest(".toast") as HTMLElement;
    return within(toast).getAllByLabelText(/×/);
  }

  async function storedChips(dbName: string) {
    const db = await openCompanionDb(dbName);
    const sessions = await new SessionRepo(db).listSessions();
    db.close();
    return sessions[0]!.chipSet.chips;
  }

  it("US2-1: each row has Valor and Cantidad (∞ when empty), and no Etiqueta", async () => {
    const { user } = await openSeededTable();
    const sheet = await openChips(user);
    expect(within(sheet).getAllByText("Valor")).toHaveLength(5);
    const counts = within(sheet).getAllByLabelText<HTMLInputElement>("Cantidad");
    expect(counts.map((c) => c.value)).toEqual(["50", "150", "50", "100", "150"]);
    expect(counts.every((c) => c.placeholder === "∞")).toBe(true);
    expect(within(sheet).queryByText("Etiqueta")).toBeNull();
  });

  it("US2-2: swapping black to 5 and blue to 25 changes the discs", async () => {
    const { user } = await openSeededTable();
    const sheet = await openChips(user);
    const black = within(sheet).getByLabelText("Valor de la ficha 3");
    await user.clear(black);
    await user.type(black, "5");
    const blue = within(sheet).getByLabelText("Valor de la ficha 4");
    await user.clear(blue);
    await user.type(blue, "25");
    await user.click(within(sheet).getByRole("button", { name: "Guardar" }));
    const discs = await collect(user, 30);
    expect(discs.map((el) => el.getAttribute("aria-label"))).toEqual(["1 × 25", "1 × 5"]);
    const colorOf = (el: Element) => (el.querySelector(".chip-disc") as HTMLElement).style.background;
    expect(colorOf(discs[0]!)).toBe("rgb(21, 101, 192)");
    expect(colorOf(discs[1]!)).toBe("rgb(33, 33, 33)");
  });

  it("US2-3: clearing Cantidad stores unlimited, typing 0 stores 0", async () => {
    const { user, dbName } = await openSeededTable();
    const sheet = await openChips(user);
    const counts = within(sheet).getAllByLabelText("Cantidad");
    await user.clear(counts[0]!);
    await user.clear(counts[1]!);
    await user.type(counts[1]!, "0");
    await user.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const chips = await storedChips(dbName);
    expect(chips[0]?.countAvailable).toBeUndefined();
    expect(chips[1]?.countAvailable).toBe(0);
  });

  it("\"Añadir ficha\" adds an unlimited grey 1", async () => {
    const { user } = await openSeededTable();
    const sheet = await openChips(user);
    await user.click(within(sheet).getByRole("button", { name: "Quitar la ficha 1" }));
    await user.click(within(sheet).getByRole("button", { name: "Añadir ficha" }));
    expect(within(sheet).getByLabelText<HTMLInputElement>("Valor de la ficha 5").value).toBe("1");
    expect(within(sheet).getAllByLabelText<HTMLInputElement>("Cantidad")[4]!.value).toBe("");
    expect(within(sheet).getByLabelText<HTMLInputElement>("Color de la ficha 1").value).toBe("#9e9e9e");
  });

  it("US2-4, FR-012: a stored label is ignored and the value is shown", async () => {
    const base = getBuiltInGame("1830");
    const game = { ...base, chipPreset: [{ value: 10, color: "#1565c0" }, { value: 1, color: "#c62828", label: "5" }] };
    const { user } = await openSeededTable({ game });
    expect((await collect(user, 3)).map((el) => [el.getAttribute("aria-label"), el.textContent])).toEqual([["3 × 1", "3×1"]]);
  });
});

describe("Volver al juego (feature 008, R10, FR-002)", () => {
  it("an older session whose frozen definition holds the old preset gets the five new chips", async () => {
    const base = getBuiltInGame("1830");
    const old = [500, 100, 50, 20, 10, 5, 1].map((value) => ({ value, color: "#6a1b9a" }));
    const { user } = await openSeededTable({ game: { ...base, chipPreset: old } });
    await openMenuItem(user, "Fichas");
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getAllByLabelText(/^Valor de la ficha/)).toHaveLength(7);
    await user.click(within(sheet).getByRole("button", { name: "Volver al juego" }));
    expect(within(sheet).getAllByLabelText(/^Valor de la ficha/).map((el) => (el as HTMLInputElement).value)).toEqual([
      "500",
      "100",
      "25",
      "5",
      "1",
    ]);
  });
});
