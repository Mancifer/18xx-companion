import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { INCOME_ES } from "../../src/domain/i18n/es";
import { openSeededTable } from "./helpers";

/** Feature 012: the OR income summary (contracts/ui.md). */

const shares = (company: string, to: string, units: number, presidency = false) => ({
  type: "transferShares",
  company,
  from: `ipo:${company}`,
  to,
  units,
  presidency: presidency || null,
});
const startOR = { type: "startOR" };
const pay = (company: string, amount: number) => ({ type: "runAndPayout", company, parts: [{ part: "revenue", amount }], mode: "full" });

/** Ana presides PRR (60%), in OR 1.1. */
const inOR = [shares("PRR", "player:p1", 6, true), startOR];

const incomeButton = () => screen.queryByRole("button", { name: INCOME_ES.title });

async function openIncome(seed: { actions: unknown[] }) {
  const table = await openSeededTable({ game: "1830", actions: seed.actions });
  await table.user.click(incomeButton()!);
  const dialog = await screen.findByRole("dialog", { name: INCOME_ES.title });
  return { ...table, dialog };
}

const row = (dialog: HTMLElement, player: string) => within(dialog).getByTestId(`income-${player}`);

/** The chip values shown in a row ("2 × 25" → 50), summed. */
function chipTotal(el: HTMLElement): number {
  return [...el.querySelectorAll(".chip:not(.chip--missing)")].reduce((sum, chip) => {
    const [count, value] = (chip.getAttribute("aria-label") ?? "").split("×").map((n) => Number(n.trim()));
    return sum + (count ?? 0) * (value ?? 0);
  }, 0);
}

describe("US1: the summary sheet", () => {
  it("is in the round controls during an OR and lists each player's start, now and amount with chips", async () => {
    const { dialog } = await openIncome({ actions: [...inOR, pay("PRR", 100)] });
    expect(within(dialog).getByText(INCOME_ES.since("1.1"))).toBeTruthy();
    expect(within(dialog).getByText(INCOME_ES.rule)).toBeTruthy();
    const ana = row(dialog, "p1");
    expect(ana.textContent).toContain(INCOME_ES.startCash);
    expect(ana.textContent).toContain(INCOME_ES.cashNow);
    expect(ana.textContent).toContain(INCOME_ES.take("$60"));
    expect(chipTotal(ana)).toBe(60);
  });

  it("a player with no change shows Nada que liquidar and no chips", async () => {
    const { dialog } = await openIncome({ actions: [...inOR, pay("PRR", 100)] });
    const bruno = row(dialog, "p2");
    expect(bruno.textContent).toContain(INCOME_ES.none);
    expect(bruno.querySelector(".chip")).toBeNull();
  });

  it("with no money moved since the OR started, nobody has anything to settle", async () => {
    const { dialog } = await openIncome({ actions: inOR });
    expect(within(dialog).getByText(INCOME_ES.allSettled)).toBeTruthy();
  });

  it("US2: a president who put more into a company than they earned pays the bank", async () => {
    const contribution = { type: "transferMoney", from: "player:p1", to: "company:PRR", amount: 220 };
    const { dialog } = await openIncome({ actions: [...inOR, pay("PRR", 200), contribution] });
    const ana = row(dialog, "p1");
    expect(ana.textContent).toContain(INCOME_ES.pay("$100"));
    expect(chipTotal(ana)).toBe(100);
  });

  it("US2: a bankrupt player is out of the game, with no amount and no chips (FR-012)", async () => {
    const bankrupt = { type: "declareBankruptcy", player: "p4", company: null };
    const { dialog } = await openIncome({ actions: [...inOR, pay("PRR", 100), bankrupt] });
    const dani = row(dialog, "p4");
    expect(dani.textContent).toContain(INCOME_ES.out);
    expect(dani.textContent).not.toContain("banco");
    expect(dani.querySelector(".chip")).toBeNull();
  });

  it("US3: a row expands to its movements under OR headings, and they add up to the amount", async () => {
    const twoORs = [shares("PRR", "player:p1", 6, true), { type: "setPhase", phase: "3" }, startOR];
    const contribution = { type: "transferMoney", from: "player:p1", to: "company:PRR", amount: 220 };
    const { user, dialog } = await openIncome({
      actions: [...twoORs, pay("PRR", 100), { type: "nextCompany" }, pay("PRR", 50), contribution],
    });
    const ana = row(dialog, "p1");
    const toggle = within(ana).getByRole("button", { expanded: false });
    expect(ana.querySelector(".income-movements")).toBeNull();
    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const headings = [...ana.querySelectorAll(".income-or")].map((h) => h.textContent);
    expect(headings).toEqual(["OR 1.1", "OR 1.2"]);
    const amounts = [...ana.querySelectorAll(".income-movement-amount")].map((a) => a.textContent);
    expect(amounts).toEqual(["+$60", "+$30", "−$220"]);
    const sum = amounts.reduce((t, a) => t + Number(a.replace("−", "-").replace("$", "").replace(".", "")), 0);
    expect(sum).toBe(60 + 30 - 220);
    expect(ana.textContent).toContain(INCOME_ES.pay("$130"));
    expect(ana.querySelector(".income-movement")?.textContent).toContain("PRR");
  });

  it("US3: a bankrupt player's row does not expand", async () => {
    const bankrupt = { type: "declareBankruptcy", player: "p4", company: null };
    const { dialog } = await openIncome({ actions: [...inOR, bankrupt] });
    expect(within(row(dialog, "p4")).queryByRole("button")).toBeNull();
  });

  it("opening and closing it records nothing (FR-006)", async () => {
    const { user, dialog } = await openIncome({ actions: [...inOR, pay("PRR", 100)] });
    await user.click(within(dialog).getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    // A recorded entry would show the undo toast.
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
  });
});

describe("US4: offered only during the ORs, highlighted when they are over", () => {
  async function menuEntry(user: Awaited<ReturnType<typeof openSeededTable>>["user"]) {
    await user.click(screen.getByRole("button", { name: "Menú" }));
    const menu = await screen.findByRole("dialog", { name: "Menú" });
    return within(menu).queryByRole("button", { name: INCOME_ES.title });
  }

  it("is not offered before the first OR, neither on the Table nor in the menu", async () => {
    const { user } = await openSeededTable({ game: "1830", actions: [shares("PRR", "player:p1", 6, true)] });
    expect(incomeButton()).toBeNull();
    expect(await menuEntry(user)).toBeNull();
  });

  it("during an OR: one tap from the Table (not highlighted), two from the menu", async () => {
    // PRR's turn (as in the operate tests): a company is operating, so the OR is not over.
    const prrTurn = { type: "setTurn", round: null, srNumber: null, orSet: null, orIndex: null, orsInSet: null, company: "PRR" };
    const { user } = await openSeededTable({ game: "1830", actions: [...inOR, prrTurn] });
    expect(incomeButton()?.classList.contains("primary")).toBe(false);
    const entry = await menuEntry(user);
    expect(entry).not.toBeNull();
    await user.click(entry!);
    expect(await screen.findByRole("dialog", { name: INCOME_ES.title })).toBeTruthy();
  });

  it("is highlighted once the last OR is over, and starting the SR still takes one tap", async () => {
    await openSeededTable({ game: "1830", actions: [...inOR, pay("PRR", 100), { type: "nextCompany" }] });
    expect(incomeButton()?.classList.contains("primary")).toBe(true);
    const startSR = screen.getByRole<HTMLButtonElement>("button", { name: "Empezar ronda de acciones" });
    expect(startSR.disabled).toBe(false);
  });

  it("goes when the SR starts and comes back when that is undone", async () => {
    const { user } = await openSeededTable({ game: "1830", actions: [...inOR, pay("PRR", 100), { type: "nextCompany" }] });
    await user.click(screen.getByRole("button", { name: "Empezar ronda de acciones" }));
    await waitFor(() => expect(incomeButton()).toBeNull());
    expect(await menuEntry(user)).toBeNull();
    await user.click(within(screen.getByRole("dialog", { name: "Menú" })).getByRole("button", { name: "Cerrar" }));
    await user.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(await screen.findByRole("button", { name: INCOME_ES.title })).toBeTruthy();
  });

  it("closes itself when an undo ends the phase while it is open", async () => {
    const { user } = await openSeededTable({ game: "1830", actions: [shares("PRR", "player:p1", 6, true)] });
    await user.click(screen.getByRole("button", { name: "Empezar OR" }));
    await user.click(await screen.findByRole("button", { name: INCOME_ES.title }));
    expect(await screen.findByRole("dialog", { name: INCOME_ES.title })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: INCOME_ES.title })).toBeNull());
    expect(incomeButton()).toBeNull();
  });
});
