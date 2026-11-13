import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { openMenuItem, openSeededTable } from "./helpers";

/** Feature 017 (US2): the last run on the company card and sheet (contracts/ui.md). */

const shares = (company: string, to: string, units: number, presidency = false) => ({
  type: "transferShares",
  company,
  from: `ipo:${company}`,
  to,
  units,
  presidency: presidency || null,
});
const run = (company: string, amount: number, mode: "full" | "withhold" = "full") => ({
  type: "runAndPayout",
  company,
  parts: [{ part: "revenue", amount }],
  mode,
});

/** Ana presides PRR (60%), in OR 1.1. */
const inOR = [shares("PRR", "player:p1", 6, true), { type: "startOR" }];

const lastRunOf = (company: string) => screen.queryByTestId(`last-run-${company}`);

describe("last run on the company card", () => {
  it("is not shown before the company's first run (FR-014)", async () => {
    await openSeededTable({ actions: inOR });
    expect(lastRunOf("PRR")).toBeNull();
  });

  it("shows the revenue, labeled, even with no trains", async () => {
    await openSeededTable({ actions: [...inOR, run("PRR", 160)] });
    expect(lastRunOf("PRR")?.textContent).toBe("$160");
    expect(lastRunOf("PRR")?.closest(".company-last-run")?.textContent).toContain("Última corrida");
  });

  it("shows a run of 0 as 0", async () => {
    await openSeededTable({ actions: [...inOR, run("PRR", 0, "withhold")] });
    expect(lastRunOf("PRR")?.textContent).toBe("$0");
  });

  it("goes away when the run is undone (FR-015)", async () => {
    const { user } = await openSeededTable({ actions: [...inOR, run("PRR", 160)] });
    await openMenuItem(user, "Historial");
    await user.click(screen.getByRole("button", { name: "Deshacer" }));
    await user.click(screen.getByRole("button", { name: "Volver" }));
    await screen.findByRole("button", { name: "Menú" });
    expect(lastRunOf("PRR")).toBeNull();
  });

  it("is hidden once the company is closed (FR-016)", async () => {
    await openSeededTable({ actions: [...inOR, run("PRR", 160), { type: "closeCompany", company: "PRR" }] });
    expect(lastRunOf("PRR")).toBeNull();
  });
});

describe("in English (FR-018)", () => {
  it("the card, the sheet and the company's History read in English", async () => {
    const { user } = await openSeededTable({ actions: [...inOR, run("PRR", 160)], settings: { language: "en" } });
    expect(lastRunOf("PRR")?.closest(".company-last-run")?.textContent).toBe("Last run $160");
    await user.click(screen.getByTestId("treasury-PRR").closest("button")!);
    let dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Details and adjustments…" }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("sheet-last-run-PRR").textContent).toBe("Last run: $160 · paid out · OR 1.1");
    await user.click(within(dialog).getByRole("button", { name: "History" }));
    expect(await screen.findByRole("heading", { name: /^History · PRR/ })).toBeTruthy();
    const entry = screen.getAllByRole("listitem").find((li) => li.classList.contains("history-item") && li.textContent.includes("$160"))!;
    expect(within(entry).getByRole("button", { name: "Show in full history" })).toBeTruthy();
  });
});

describe("last run in the company sheet", () => {
  it("reads «Última corrida: $160 · repartió · OR 1.1»", async () => {
    const { user } = await openSeededTable({ actions: [...inOR, run("PRR", 160)] });
    await user.click(screen.getByTestId("treasury-PRR").closest("button")!);
    let dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Detalles y ajustes…" }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("sheet-last-run-PRR").textContent).toBe("Última corrida: $160 · repartió · OR 1.1");
  });

  it("says «retuvo» for a withheld run", async () => {
    const { user } = await openSeededTable({ actions: [...inOR, run("PRR", 90, "withhold")] });
    await user.click(screen.getByTestId("treasury-PRR").closest("button")!);
    let dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Detalles y ajustes…" }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("sheet-last-run-PRR").textContent).toBe("Última corrida: $90 · retuvo · OR 1.1");
  });
});
