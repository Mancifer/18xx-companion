import { screen, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { openSeededTable } from "./helpers";

type User = ReturnType<typeof userEvent.setup>;

async function playerAction(user: User, player: string, action: string, amount: number, confirm: RegExp) {
  await user.click(screen.getByText(player, { selector: ".player-name" }).closest("button")!);
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: action }));
  const dialog = await screen.findByRole("dialog");
  for (const d of String(amount)) await user.click(within(dialog).getByRole("button", { name: new RegExp(`^${d}$`) }));
  return within(dialog).getByRole("button", { name: confirm });
}

describe("chips in the toast (US6, FR-081)", () => {
  it("a bank payment of 287 shows the fewest chips (1830 preset)", async () => {
    const { user } = await openSeededTable();
    const pay = await playerAction(user, "Ana", "Cobrar del banco", 287, /^Cobrar/);
    await user.click(pay);
    const toast = (await screen.findByText(/El banco paga \$287 a Ana/)).closest(".toast") as HTMLElement;
    expect(within(toast).getByText(/El banco paga a Ana \$287/)).toBeTruthy();
    expect(within(toast).getAllByLabelText(/×/).map((el) => el.getAttribute("aria-label"))).toEqual([
      "2 × 100",
      "1 × 50",
      "1 × 20",
      "1 × 10",
      "1 × 5",
      "2 × 1",
    ]);
  });

  it("paying 30 to the bank with a 50 shows 20 in change", async () => {
    const { user } = await openSeededTable();
    await user.click(screen.getByText("Ana", { selector: ".player-name" }).closest("button")!);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Pagar…" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "el banco" }));
    for (const d of "30") await user.click(within(dialog).getByRole("button", { name: new RegExp(`^${d}$`) }));
    await user.click(within(dialog).getByRole("button", { name: /^Pagar \$30/ }));

    const toast = (await screen.findByText(/Ana paga \$30 al banco/)).closest(".toast") as HTMLElement;
    await user.click(within(toast).getByRole("button", { name: "50" }));
    const change = toast.querySelector<HTMLElement>(".chip-change")!;
    expect(within(change).getByText("cambio:")).toBeTruthy();
    expect(within(change).getAllByLabelText(/×/).map((el) => el.getAttribute("aria-label"))).toEqual(["1 × 20"]);
  });
});
