import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { openMenuItem, openSeededTable } from "./helpers";

const startSR = { type: "startSR" };
const par = (player: string, company: string, price: number) => ({ type: "parCompany", player, company, price });

describe("Market (US7-3, FR-052)", () => {
  it("tap a token, then a cell: records a manual move that History shows", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100)] });
    await openMenuItem(user, "Mercado");

    const from = await screen.findByRole("button", { name: /^Casilla \$100 \(fila 1, columna 7\)/ });
    expect(within(from).getByRole("button", { name: "Ficha PRR" })).toBeTruthy();

    await user.click(within(from).getByRole("button", { name: "Ficha PRR" }));
    await user.click(screen.getByRole("button", { name: /^Casilla \$70 \(fila 2, columna 4\)/ }));

    const to = screen.getByRole("button", { name: /^Casilla \$70 \(fila 2, columna 4\)/ });
    expect(await within(to).findByRole("button", { name: "Ficha PRR" })).toBeTruthy();
    expect(screen.getByText(/PRR movida a mano a \$70/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Volver" }));
    await openMenuItem(user, "Historial");
    expect(await screen.findByText(/PRR movida a mano a \$70/)).toBeTruthy();
  });

  it("shows the 1848 BoE track with its token", async () => {
    const { user } = await openSeededTable({ game: "1848" });
    await openMenuItem(user, "Mercado");
    const start = await screen.findByRole("button", { name: /^Casilla £70 \(posición 0\)/ });
    expect(within(start).getByRole("button", { name: "Ficha BoE" })).toBeTruthy();
  });

  it("tapping the selected token again cancels the move", async () => {
    const { user } = await openSeededTable({ actions: [startSR, par("p1", "PRR", 100)] });
    await openMenuItem(user, "Mercado");
    const tokenButton = await screen.findByRole("button", { name: "Ficha PRR" });
    await user.click(tokenButton);
    expect(tokenButton.getAttribute("aria-pressed")).toBe("true");
    await user.click(tokenButton);
    expect(tokenButton.getAttribute("aria-pressed")).toBe("false");
  });
});
