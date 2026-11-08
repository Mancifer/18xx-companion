import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { openSeededTable } from "./helpers";

/**
 * Feature 016 (US8, FR-036, contracts/ui.md §7): company choices show the badge on one line and
 * the full name on the next. jsdom has no layout, so the structure is what is checked here; the
 * e2e layout spec checks the boxes.
 */

const three = ["Ana", "Bruno", "Carla"];
const launch = (company: string, player: string, bid: number) => ({ type: "launchCompany", player, company, bid, price: null });
const toMR = { type: "setTurn", round: "MR", srNumber: null, orSet: null, orIndex: null, orsInSet: null, company: null };

function expectTwoLines(button: HTMLElement, name: string) {
  const block = button.querySelector(".choice-company");
  expect(block, `${name}: no .choice-company`).not.toBeNull();
  const [badge, label] = Array.from(block!.children);
  expect(badge?.classList.contains("company-badge")).toBe(true);
  expect(label?.classList.contains("choice-company-name")).toBe(true);
  expect(label?.textContent).toContain(name);
}

describe("company choices on two lines (016 US8)", () => {
  it("Abrir minor: every minor shows its badge, then its name", async () => {
    const { user, meta } = await openSeededTable({ game: "rotla", players: three });
    await user.click(screen.getByRole("button", { name: "Abrir minor" }));
    const group = within(await screen.findByRole("dialog")).getByRole("group", { name: "Minor" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      const company = meta.game.companies.find((c) => button.getAttribute("aria-label") === `${c.shortName} ${c.name}`)!;
      expectTwoLines(button, company.name);
    }
  });

  it("merger: every corporation shows its badge, then its name (and second name)", async () => {
    const { user } = await openSeededTable({
      game: "rotla",
      players: three,
      options: { expansion: "landmarks" },
      actions: [launch("TUN", "p2", 140), launch("EXP", "p1", 160), toMR],
    });
    await user.click(screen.getByRole("button", { name: "Fusionar…" }));
    const majors = within(await screen.findByRole("dialog")).getByRole("group", { name: "Corporación" });
    const buttons = within(majors).getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(button.querySelector(".choice-company")).not.toBeNull();
    const authority = buttons.find((b) => b.textContent.includes("Authority"))!;
    expectTwoLines(authority, "Authority / Alliance");
  });
});
