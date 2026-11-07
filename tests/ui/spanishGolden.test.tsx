import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../../src/ui/App";
import { freshDbName } from "../helpers/session";
import { openMenuItem, openSeededTable } from "./helpers";

/**
 * Feature 014 T001: the Spanish golden snapshot (SC-002, FR-010). Recorded on the code before
 * any multi-language change; every later change must leave it identical, except intentional
 * fixes listed in tasks.md T078.
 */

type User = ReturnType<typeof userEvent.setup>;

/** Dates and clock times vary between runs; everything else is kept exactly. */
const normalize = (s: string) =>
  s
    .replace(/\d{2}\/\d{2}(\/\d{2,4})? \d{2}:\d{2}/g, "<fecha>")
    .replace(/\d{2}:\d{2}/g, "<hora>")
    .replace(/\s+/g, " ")
    .trim();

/** The visible text and every aria-label, in document order. */
function capture(root: HTMLElement = document.body): string {
  const labels = [...root.querySelectorAll("[aria-label]")].map((el) => el.getAttribute("aria-label") ?? "");
  return `TEXT: ${normalize(root.textContent)}\nLABELS: ${labels.map(normalize).join(" | ")}`;
}

const shares = (company: string, to: string, units: number, presidency = false) => ({
  type: "transferShares",
  company,
  from: `ipo:${company}`,
  to,
  units,
  presidency: presidency || null,
});

interface Seed {
  readonly game: string;
  readonly players?: readonly string[];
  readonly actions: readonly unknown[];
}

const SEEDS: Readonly<Record<string, Seed>> = {
  "1830": {
    game: "1830",
    actions: [
      shares("PRR", "player:p1", 6, true),
      shares("NYC", "player:p2", 2, true),
      { type: "startOR" },
      { type: "runAndPayout", company: "PRR", parts: [{ part: "revenue", amount: 120 }], mode: "full" },
      { type: "transferMoney", from: "player:p3", to: "bank", amount: 1200 },
    ],
  },
  "1848": {
    game: "1848",
    actions: [
      shares("QR", "player:p1", 6, true),
      { type: "startOR" },
      { type: "runAndPayout", company: "QR", parts: [{ part: "revenue", amount: 90 }], mode: "full" },
    ],
  },
  "21moon": {
    game: "21moon",
    actions: [
      shares("SWP", "player:p1", 6, true),
      { type: "startOR" },
    ],
  },
  rotla: {
    game: "rotla",
    players: ["Ana", "Bruno", "Carla"],
    actions: [{ type: "launchCompany", player: "p1", company: "EXP", bid: 160, price: null }, { type: "startOR" }],
  },
};

async function screens(user: User): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  out["table"] = capture();
  await openMenuItem(user, "Historial");
  await screen.findByRole("heading", { name: "Historial" });
  out["history"] = capture();
  await user.click(screen.getByRole("button", { name: "Volver" }));
  await openMenuItem(user, "Mercado");
  await screen.findByRole("heading", { name: "Mercado" });
  out["market"] = capture();
  await user.click(screen.getByRole("button", { name: "Volver" }));
  const income = screen.queryByRole("button", { name: "Ingresos de las ORs" });
  if (income) {
    await user.click(income);
    const dialog = await screen.findByRole("dialog");
    out["income"] = capture(dialog);
    await user.click(within(dialog).getByRole("button", { name: "Cerrar" }));
  }
  await openMenuItem(user, "Terminar partida");
  const sheet = await screen.findByRole("dialog", { name: "¿Terminar la partida?" });
  await user.click(within(sheet).getByRole("button", { name: "Terminar" }));
  await screen.findByRole("heading", { name: "Resultados" });
  out["results"] = capture();
  return out;
}

describe("Spanish golden snapshot (feature 014 T001)", () => {
  for (const [id, seed] of Object.entries(SEEDS)) {
    it(`${id}: Table, History, Market, income and Results read exactly as before`, async () => {
      const { user } = await openSeededTable({ game: seed.game, actions: seed.actions, ...(seed.players ? { players: seed.players } : {}) });
      expect(await screens(user)).toMatchSnapshot();
    });
  }

  it("Home, New session and Settings read exactly as before", async () => {
    const user = userEvent.setup();
    render(<App dbName={freshDbName()} />);
    await screen.findByRole("button", { name: "Nueva partida" });
    const out: Record<string, string> = { home: capture() };
    await user.click(screen.getByRole("button", { name: "Nueva partida" }));
    await screen.findByRole("heading", { name: "Nueva partida" });
    out["newSession"] = capture();
    await user.click(screen.getByRole("button", { name: "Volver" }));
    await user.click(await screen.findByRole("button", { name: "Ajustes" }));
    await screen.findByRole("heading", { name: "Ajustes" });
    out["settings"] = capture();
    expect(out).toMatchSnapshot();
  });
});
