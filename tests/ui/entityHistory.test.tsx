import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LogEntry } from "../../src/domain/ledger/entries";
import { openSeededTable } from "./helpers";

/** Feature 017: a player's or company's History (contracts/ui.md). */

const pay = (from: string, to: string, amount: number) => ({ type: "transferMoney", from, to, amount });
const shares = (company: string, to: string, units: number) => ({
  type: "transferShares",
  company,
  from: `ipo:${company}`,
  to,
  units,
  presidency: null,
});

/** PRR gets 50, NYC gets 70, Ana pays 10, Bruno takes a PRR share (no PRR money moves). */
const ACTIONS = [pay("bank", "company:PRR", 50), pay("bank", "company:NYC", 70), pay("player:p1", "bank", 10), shares("PRR", "player:p2", 1)];

function items(): HTMLElement[] {
  return screen.queryAllByRole("listitem").filter((li) => li.classList.contains("history-item"));
}

function item(text: string): HTMLElement {
  const found = items().find((li) => li.textContent.includes(text));
  if (!found) throw new Error(`No history item with ${text}`);
  return found;
}

const cardOf = (company: string) => screen.getByTestId(`treasury-${company}`).closest("button")!;
const tileOf = (player: string) => screen.getByTestId(`cash-${player}`).closest("button")!;

async function openCompanyHistory(company: string, seed: Parameters<typeof openSeededTable>[0] = { actions: ACTIONS }) {
  const table = await openSeededTable(seed);
  await table.user.click(cardOf(company));
  const dialog = await screen.findByRole("dialog");
  await table.user.click(within(dialog).getByRole("button", { name: "Historial" }));
  await screen.findByRole("heading", { name: /^Historial · / });
  return table;
}

describe("company History (US1)", () => {
  it("lists only the entries that involve the company, including a share move with no PRR money", async () => {
    await openCompanyHistory("PRR");
    expect(screen.getByRole("heading", { name: /^Historial · PRR/ })).toBeTruthy();
    const text = items().map((li) => li.textContent);
    expect(text.some((t) => t.includes("$50"))).toBe(true);
    expect(text.some((t) => t.includes("$70"))).toBe(false);
    expect(text.some((t) => t.includes("$10"))).toBe(false);
    expect(items()).toHaveLength(2);
  });

  it("offers no undo at all (FR-008, SC-007)", async () => {
    const { user } = await openCompanyHistory("PRR");
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
    await user.click(within(item("$50")).getByText(/\$50/));
    expect(screen.queryByRole("button", { name: "Deshacer hasta acá" })).toBeNull();
    expect(within(item("$50")).getByRole("button", { name: "Ver en el historial completo" })).toBeTruthy();
  });

  it("puts the company's own lines first, marked (FR-006)", async () => {
    const { user } = await openCompanyHistory("PRR");
    await user.click(within(item("$50")).getByText(/\$50/));
    const balances = item("$50").querySelectorAll(".history-balances li");
    expect(balances.length).toBeGreaterThan(0);
    expect(balances[0]?.classList.contains("history-mine")).toBe(true);
    expect(balances[0]?.textContent).toContain("PRR");
  });

  it("shows an undone entry marked «deshecha»", async () => {
    await openCompanyHistory("PRR", {
      actions: ACTIONS,
      entries: (log: readonly LogEntry[]) => {
        const groups = log.filter((e) => e.kind === "group");
        const seq = Math.max(...log.map((e) => e.seq)) + 1;
        return [{ kind: "undo", seq, at: "2026-11-09T21:00:00.000Z", groupIds: [groups.at(-1)!.id] }];
      },
    });
    expect(within(item("PRR")).getByText("deshecha")).toBeTruthy();
  });

  it("says so when nothing involves the company (FR-009)", async () => {
    await openCompanyHistory("B&O");
    expect(screen.getByText(/^No hay movimientos de .+ todavía\.$/)).toBeTruthy();
    expect(items()).toHaveLength(0);
  });

  it("back returns to the Table with the same sheet open", async () => {
    const { user } = await openCompanyHistory("PRR");
    await user.click(screen.getByRole("button", { name: "Volver" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Historial" })).toBeTruthy();
  });
});

describe("company History in every round (SC-001)", () => {
  it("in an OR the card opens the turn sheet, which offers «Historial»; back reopens the turn sheet", async () => {
    const actions = [{ ...shares("PRR", "player:p1", 6), presidency: true }, { type: "startOR" }];
    const { user } = await openCompanyHistory("PRR", { actions });
    expect(screen.getByRole("heading", { name: /^Historial · PRR/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Volver" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Detalles y ajustes…" })).toBeTruthy();
  });
});

describe("player History (US3)", () => {
  it("lists only the player's own money and holdings", async () => {
    const { user } = await openSeededTable({ actions: ACTIONS });
    await user.click(tileOf("p1"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Historial" }));
    expect(await screen.findByRole("heading", { name: "Historial · Ana" })).toBeTruthy();
    const text = items().map((li) => li.textContent);
    expect(text.some((t) => t.includes("$10"))).toBe(true);
    expect(text.some((t) => t.includes("$50") || t.includes("$70"))).toBe(false);
    // createSession hands out the start money: that entry is Ana's too.
    expect(items()).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect(await screen.findByRole("dialog", { name: "Ana" })).toBeTruthy();
  });
});

describe("to the full History (US4)", () => {
  it("opens the entry expanded in the full History, with its undo; back, back returns to the sheet", async () => {
    const { user } = await openCompanyHistory("PRR");
    const filteredTitle = screen.getByRole("heading", { name: /^Historial · PRR/ }).textContent;
    await user.click(within(item("$50")).getByText(/\$50/));
    await user.click(within(item("$50")).getByRole("button", { name: "Ver en el historial completo" }));

    expect(await screen.findByRole("heading", { name: "Historial" })).toBeTruthy();
    const entry = item("$50");
    expect(entry.querySelector("details")?.open).toBe(true);
    expect(within(entry).getByRole("button", { name: "Deshacer hasta acá" })).toBeTruthy();
    expect(items().length).toBeGreaterThan(2);

    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect((await screen.findByRole("heading", { name: /^Historial · PRR/ })).textContent).toBe(filteredTitle);
    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});
