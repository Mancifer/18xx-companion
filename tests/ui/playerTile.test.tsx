import { screen, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { openSeededTable } from "./helpers";

/** Feature 016 (US7, contracts/ui.md §6): the certificate donut on the player tile. */

type User = ReturnType<typeof userEvent.setup>;

const startSR = { type: "startSR" };
const par = (player: string, company: string, price: number) => ({ type: "parCompany", player, company, price });
const buy = (player: string, company: string, count: number) => ({ type: "buyShare", buyer: `player:${player}`, company, source: "ipo", count });
const give = (company: string, units: number, to = "p1") => ({
  type: "transferShares",
  company,
  from: `ipo:${company}`,
  to: `player:${to}`,
  units,
  presidency: null,
});
// Ana: the PRR presidency + 2 shares (3 cards) and one share each of NYC, B&O and C&O: 6 cards.
const FOUR = [startSR, par("p1", "PRR", 100), buy("p1", "PRR", 2), par("p2", "NYC", 100), par("p3", "B&O", 100), par("p4", "C&O", 100), give("NYC", 1), give("B&O", 1), give("C&O", 1)];

const tileOf = (id: string) => screen.getByTestId(`cash-${id}`).closest("button")!;

async function showPlayers(user: User) {
  await user.click(screen.getByRole("tab", { name: "Jugadores" }));
}

describe("certificate donut on the tile (016 US7)", () => {
  it("names the counted certificates against the limit; the center shows the count", async () => {
    const { user } = await openSeededTable({ actions: FOUR });
    await showPlayers(user);
    const donut = within(tileOf("p1")).getByRole("img", { name: "6 de 16 certificados" });
    expect(donut.textContent).toBe("6");
  });

  it("a president's certificate is one card", async () => {
    const { user } = await openSeededTable({ actions: FOUR });
    await showPlayers(user);
    expect(within(tileOf("p3")).getByRole("img", { name: "1 de 16 certificados" })).toBeTruthy();
  });

  it("a player without shares gets an empty ring with 0", async () => {
    const { user } = await openSeededTable({ actions: [startSR] });
    await showPlayers(user);
    expect(within(tileOf("p1")).getByRole("img", { name: "0 de 16 certificados" }).textContent).toBe("0");
  });

  it("at and over the limit the name says so", async () => {
    const atLimit = [...FOUR, give("NYC", 1), give("B&O", 1), give("C&O", 1), give("CPR", 4), give("Erie", 3)];
    const { user } = await openSeededTable({ actions: atLimit });
    await showPlayers(user);
    expect(within(tileOf("p1")).getByRole("img", { name: "16 de 16 certificados, en el límite" }).classList.contains("at")).toBe(true);
  });

  it("over the limit", async () => {
    const over = [...FOUR, give("NYC", 1), give("B&O", 1), give("C&O", 1), give("CPR", 4), give("Erie", 4)];
    const { user } = await openSeededTable({ actions: over });
    await showPlayers(user);
    expect(within(tileOf("p1")).getByRole("img", { name: "17 de 16 certificados, sobre el límite" }).classList.contains("over")).toBe(true);
  });

  it("tile and sheet agree when a holding is exempt (1830 yellow zone)", async () => {
    const { user } = await openSeededTable({ actions: [...FOUR, { type: "setMarket", company: "NYC", cell: { row: 2, col: 1 } }] });
    await showPlayers(user);
    const tile = tileOf("p1");
    expect(within(tile).getByRole("img", { name: "5 de 16 certificados" }).textContent).toBe("5");
    await user.click(tile);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("5 / 16 cert. (6 en total)")).toBeTruthy();
  });

  it("the old «N cert.» text is gone; the debt badge stays where it was", async () => {
    const { user } = await openSeededTable({ actions: FOUR });
    await showPlayers(user);
    expect(tileOf("p1").querySelector(".player-meta")?.textContent ?? "").not.toMatch(/cert\./);
  });

  it("without a certificate limit (plain RotLA) the name has no limit, in the singular for one", async () => {
    const three = ["Ana", "Bruno", "Carla"];
    const { user } = await openSeededTable({
      game: "rotla",
      players: three,
      actions: [{ type: "launchCompany", player: "p2", company: "EXP", bid: 165, price: null }],
    });
    await showPlayers(user);
    expect(within(tileOf("p2")).getByRole("img", { name: "1 certificado" })).toBeTruthy();
    expect(within(tileOf("p1")).getByRole("img", { name: "0 certificados" })).toBeTruthy();
  });

  it("in English", async () => {
    const { user } = await openSeededTable({ actions: FOUR, settings: { language: "en" } });
    await user.click(screen.getByRole("tab", { name: "Players" }));
    expect(within(tileOf("p1")).getByRole("img", { name: "6 of 16 certificates" })).toBeTruthy();
  });
});
