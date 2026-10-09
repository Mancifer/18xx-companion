import { screen, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { cashText, openSeededTable } from "./helpers";

type User = ReturnType<typeof userEvent.setup>;

const shares = (company: string, to: string, units: number, presidency = false) => ({
  type: "transferShares",
  company,
  from: `ipo:${company}`,
  to,
  units,
  presidency: presidency || null,
});

const buyTrain = (company: string, trainType: string) => ({
  type: "buyTrain",
  company,
  trainType,
  variant: null,
  from: "bank",
  seller: null,
  price: null,
  tradeIn: null,
});

const startOR = { type: "startOR" };

async function openCompany(user: User, company: string): Promise<HTMLElement> {
  await user.click(screen.getByRole("tab", { name: "Compañías" }));
  const card = screen.getByTestId(`treasury-${company}`).closest("button")!;
  await user.click(card);
  return screen.findByRole("dialog");
}

async function typeOn(user: User, dialog: HTMLElement, digits: string) {
  for (const d of digits) await user.click(within(dialog).getByRole("button", { name: new RegExp(`^${d}$`) }));
}

describe("OperateSheet (US3)", () => {
  it("1830: Pagar and Retener, no Mitad and no Préstamo", async () => {
    const { user } = await openSeededTable({ game: "1830", actions: [shares("PRR", "player:p1", 6, true), startOR] });
    const dialog = await openCompany(user, "PRR");
    expect(within(dialog).getByRole("button", { name: "Pagar" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Retener" })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Mitad" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Préstamo/ })).toBeNull();
  });

  it("1848 in phase 3: Préstamo is offered and there is no repay action", async () => {
    const { user } = await openSeededTable({
      game: "1848",
      actions: [shares("QR", "player:p1", 6, true), buyTrain("QR", "3"), startOR],
    });
    const dialog = await openCompany(user, "QR");
    const loan = within(dialog).getByRole("button", { name: /^Préstamo/ });
    expect((loan as HTMLButtonElement).disabled).toBe(false);
    expect(within(dialog).queryByRole("button", { name: /Devolver/ })).toBeNull();
  });

  it("1848 before phase 3: Préstamo is shown disabled with the reason", async () => {
    const { user } = await openSeededTable({ game: "1848", actions: [shares("QR", "player:p1", 6, true), startOR] });
    const dialog = await openCompany(user, "QR");
    const loan = within(dialog).getByRole<HTMLButtonElement>("button", { name: /^Préstamo/ });
    expect(loan.disabled).toBe(true);
    expect(loan.textContent).toContain("fase 3");
  });

  it("21Moon: one input per revenue part and no mode buttons", async () => {
    const { user } = await openSeededTable({
      game: "21moon",
      players: ["Ana", "Bruno", "Carla"],
      actions: [shares("VH", "player:p1", 2, true), startOR],
    });
    const dialog = await openCompany(user, "VH");
    expect(within(dialog).getByRole("button", { name: /Base local/ })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /Puerto espacial/ })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Pagar" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Retener" })).toBeNull();

    await typeOn(user, dialog, "60");
    await user.click(within(dialog).getByRole("button", { name: /Puerto espacial/ }));
    await typeOn(user, dialog, "40");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText(/VH: base local ₡60, puerto espacial ₡40/)).toBeTruthy();
    expect(cashText("p1")).toBe("₡548");
  });

  it("a payout takes one tap after entering the revenue (SC-006)", async () => {
    const { user } = await openSeededTable({
      game: "1830",
      actions: [shares("PRR", "player:p1", 6, true), shares("PRR", "player:p2", 2), startOR],
    });
    const dialog = await openCompany(user, "PRR"); // tap 1
    await typeOn(user, dialog, "240"); // revenue entry
    await user.click(within(dialog).getByRole("button", { name: "Pagar" })); // tap 2
    expect(await screen.findByText(/PRR paga \$240/)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Jugadores" }));
    expect(cashText("p1")).toBe("$744");
    expect(cashText("p2")).toBe("$648");
  });
});
