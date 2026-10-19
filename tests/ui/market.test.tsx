import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { byLine, openMenuItem, openSeededTable } from "./helpers";

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
    expect(screen.getByText(byLine(/PRR movida a mano a \$70/))).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Volver" }));
    await openMenuItem(user, "Historial");
    expect(await screen.findByText(byLine(/PRR movida a mano a \$70/))).toBeTruthy();
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
    // Feature 013: the prompt names the company with its badge.
    const prompt = screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "Toca la casilla a la que mover PRR.");
    expect(prompt.querySelector(".company-badge")?.textContent).toBe("PRR");
    await user.click(tokenButton);
    expect(tokenButton.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("RotLA's 1-D track (T102)", () => {
  it("is one wrapping strip: 27 cells, the 0 labeled Cerrada, stacks top to bottom, the launch range highlighted", async () => {
    const { user } = await openSeededTable({
      game: "rotla",
      players: ["Ana", "Bruno", "Carla"],
      actions: [
        { type: "launchCompany", player: "p1", company: "TUN", bid: 160, price: null },
        { type: "launchCompany", player: "p2", company: "EXP", bid: 165, price: null },
      ],
    });
    await openMenuItem(user, "Mercado");
    const strip = await screen.findByTestId("market-strip");
    const cells = within(strip).getAllByRole("button", { name: /^Casilla/ });
    expect(cells).toHaveLength(27);
    expect(within(strip).getByRole("button", { name: /^Casilla cerrada/ }).textContent).toContain("Cerrada");
    const at80 = within(strip).getByRole("button", { name: /^Casilla \$80/ });
    expect(within(at80).getAllByRole("button", { name: /^Ficha/ }).map((b) => b.getAttribute("aria-label"))).toEqual(["Ficha TUN", "Ficha EXP"]);
    const inRange = cells.filter((c) => c.classList.contains("launch-range")).map((c) => c.getAttribute("aria-label")?.split(" ")[1]);
    expect(inRange).toEqual(["$60", "$70", "$80", "$90"]);
  });

  it("reads like the board: Cerrada first (posición 1), $500 last (posición 27), and moves still land on the tapped cell", async () => {
    const { user } = await openSeededTable({
      game: "rotla",
      players: ["Ana", "Bruno", "Carla"],
      actions: [{ type: "launchCompany", player: "p1", company: "TUN", bid: 160, price: null }],
    });
    await openMenuItem(user, "Mercado");
    const strip = await screen.findByTestId("market-strip");
    const cells = within(strip).getAllByRole("button", { name: /^Casilla/ });
    expect(cells.at(0)?.getAttribute("aria-label")).toMatch(/^Casilla cerrada \(posición 1\)/);
    expect(cells.at(-1)?.getAttribute("aria-label")).toMatch(/^Casilla \$500 \(posición 27\)/);

    await user.click(within(strip).getByRole("button", { name: "Ficha TUN" }));
    await user.click(within(strip).getByRole("button", { name: /^Casilla \$120/ }));
    const at120 = within(strip).getByRole("button", { name: /^Casilla \$120/ });
    expect(await within(at120).findByRole("button", { name: "Ficha TUN" })).toBeTruthy();
    expect(screen.getByText(byLine(/TUN movida a mano a \$120/))).toBeTruthy();
  });
});

describe("closed companies (feature 013, US5)", () => {
  const close = (company: string) => ({ type: "closeCompany", company });
  const parred = [startSR, par("p1", "PRR", 100), par("p3", "NYC", 90)];

  it("a closed company has no token, on the grid or unplaced; the others stay", async () => {
    const { user } = await openSeededTable({ actions: [...parred, close("PRR")] });
    await openMenuItem(user, "Mercado");
    expect(await screen.findByRole("button", { name: "Ficha NYC" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ficha PRR" })).toBeNull();
    expect(screen.queryByText("Sin ficha en el mercado")).toBeNull();
  });

  it("undoing the close brings the token back to its cell", async () => {
    const { user } = await openSeededTable({ actions: [...parred, close("PRR")] });
    await openMenuItem(user, "Historial");
    const closed = screen.getAllByRole("listitem").find((li) => li.classList.contains("history-item") && li.textContent.includes("Se cierra PRR"))!;
    await user.click(within(closed).getByRole("button", { name: "Deshacer" }));
    await within(closed).findByText("deshecha");
    await user.click(screen.getByRole("button", { name: "Volver" }));
    await openMenuItem(user, "Mercado");
    const cell = await screen.findByRole("button", { name: /^Casilla \$100 \(fila 1, columna 7\)/ });
    expect(within(cell).getByRole("button", { name: "Ficha PRR" })).toBeTruthy();
  });

  it("a company in receivership is still shown (FR-022)", async () => {
    const { user } = await openSeededTable({
      game: "21moon",
      players: ["Ana", "Bruno", "Carla"],
      actions: [
        { type: "transferShares", company: "VH", from: "ipo:VH", to: "player:p1", units: 2, presidency: true },
        { type: "enterReceivership", company: "VH" },
      ],
    });
    await openMenuItem(user, "Mercado");
    expect(await screen.findByRole("button", { name: "Ficha VH" })).toBeTruthy();
  });

  it("RotLA: the merged minors are gone, the major and the Cerrada cell stay", async () => {
    const toMR = { type: "setTurn", round: "MR", srNumber: null, orSet: null, orIndex: null, orsInSet: null, company: null };
    const { user } = await openSeededTable({
      game: "rotla",
      players: ["Ana", "Bruno", "Carla"],
      actions: [
        { type: "launchCompany", player: "p2", company: "TUN", bid: 140, price: null },
        { type: "launchCompany", player: "p1", company: "EXP", bid: 160, price: null },
        toMR,
        { type: "mergeCompanies", a: "EXP", b: "TUN", into: "UNI", identity: "primary" },
      ],
    });
    await openMenuItem(user, "Mercado");
    const strip = await screen.findByTestId("market-strip");
    expect(within(strip).getByRole("button", { name: "Ficha UNI" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ficha EXP" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ficha TUN" })).toBeNull();
    expect(within(strip).getByRole("button", { name: /^Casilla cerrada/ })).toBeTruthy();
  });
});
