import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { builtInGames } from "../../src/domain/games";
import { App } from "../../src/ui/App";
import { freshDbName, setNavigatorLanguages } from "../helpers/session";
import { openMenuItem, openSeededTable } from "./helpers";

/**
 * Feature 014 T021 (SC-001): on an English device, no Spanish reaches the screen. Same seeds and
 * screens as the Spanish golden (T001), plus every sheet reachable from the Table menu. Proper
 * nouns (companies, privates, trains, players) and user text are allowed.
 */

type User = ReturnType<typeof userEvent.setup>;

const ACCENTS = /[áéíóúñ¿¡]/i;
const SPANISH_WORDS = new Set(
  (
    "de del la el los las y con sin para por una uno compra vende paga retiene ronda banco jugador compañía acciones " +
    "tren trenes deshacer confirmar cancelar editar guardar partida historial nota ingresos fase"
  ).split(" "),
);

const PLAYERS = ["Ana", "Bruno", "Carla", "Dani"];
/** Names that are the same in every language: the games' companies, privates, trains and phases. */
const PROPER_NOUNS = [
  ...PLAYERS,
  // Each language is listed by its own name in Settings (FR-011).
  "Español",
  ...builtInGames.flatMap((g) => [
    g.name,
    ...g.companies.flatMap((c) => [c.name, c.shortName, ...(c.altName ? [c.altName] : [])]),
    ...g.privates.map((p) => p.name),
    ...g.trains.flatMap((t) => [t.type, t.displayName ?? t.type]),
  ]),
].sort((a, b) => b.length - a.length);

const stripProperNouns = (s: string) => PROPER_NOUNS.reduce((acc, n) => acc.split(n).join(" "), s);

/** Every text node, aria-label, title and placeholder under `root`. */
function strings(root: HTMLElement = document.body): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n.textContent ?? "");
  for (const el of root.querySelectorAll("[aria-label], [title], [placeholder]")) {
    for (const attr of ["aria-label", "title", "placeholder"]) {
      const v = el.getAttribute(attr);
      if (v) out.push(v);
    }
  }
  return out.map((s) => s.trim()).filter((s) => s !== "");
}

/** The strings that read as Spanish, with where they were seen. */
function leaks(where: string, root?: HTMLElement): string[] {
  return strings(root).flatMap((raw) => {
    const s = stripProperNouns(raw);
    const words = s.toLocaleLowerCase("es").split(/[^a-záéíóúñü]+/i);
    return ACCENTS.test(s) || words.some((w) => SPANISH_WORDS.has(w)) ? [`${where}: ${raw}`] : [];
  });
}

const shares = (company: string, to: string, units: number) => ({
  type: "transferShares",
  company,
  from: `ipo:${company}`,
  to,
  units,
  presidency: true,
});

const SEEDS: Readonly<Record<string, { game: string; players?: readonly string[]; actions: readonly unknown[] }>> = {
  "1830": {
    game: "1830",
    actions: [
      shares("PRR", "player:p1", 6),
      shares("NYC", "player:p2", 2),
      { type: "startOR" },
      { type: "runAndPayout", company: "PRR", parts: [{ part: "revenue", amount: 120 }], mode: "full" },
      { type: "transferMoney", from: "player:p3", to: "bank", amount: 1200 },
    ],
  },
  "1848": {
    game: "1848",
    actions: [shares("QR", "player:p1", 6), { type: "startOR" }, { type: "runAndPayout", company: "QR", parts: [{ part: "revenue", amount: 90 }], mode: "full" }],
  },
  "21moon": { game: "21moon", actions: [shares("SWP", "player:p1", 6), { type: "startOR" }] },
  rotla: {
    game: "rotla",
    players: ["Ana", "Bruno", "Carla"],
    actions: [{ type: "launchCompany", player: "p1", company: "EXP", bid: 160, price: null }, { type: "startOR" }],
  },
};

async function closeDialog(user: User) {
  const dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Close" }));
}

async function walk(user: User): Promise<string[]> {
  const found = leaks("table");
  // The first player's sheet and the operating company's turn.
  await user.click(screen.getAllByRole("button", { name: /Ana/ })[0]!);
  found.push(...leaks("player sheet", await screen.findByRole("dialog")));
  await closeDialog(user);
  const operate = screen.queryByRole("button", { name: /^Operate / });
  if (operate) {
    await user.click(operate);
    found.push(...leaks("operate sheet", await screen.findByRole("dialog")));
    await closeDialog(user);
  }
  await user.click(screen.getByRole("button", { name: /^Menu$/ }));
  found.push(...leaks("menu", await screen.findByRole("dialog")));
  await closeDialog(user);

  await openMenuItem(user, "Chips");
  found.push(...leaks("chips sheet", await screen.findByRole("dialog")));
  await closeDialog(user);
  const income = screen.queryByRole("button", { name: "OR income" });
  if (income) {
    await user.click(income);
    found.push(...leaks("income sheet", await screen.findByRole("dialog")));
    await closeDialog(user);
  }
  await openMenuItem(user, "History");
  await screen.findByRole("heading", { name: "History" });
  for (const details of document.querySelectorAll("details")) details.open = true;
  found.push(...leaks("history"));
  await user.click(screen.getByRole("button", { name: "Back" }));
  await openMenuItem(user, "Market");
  await screen.findByRole("heading", { name: "Market" });
  found.push(...leaks("market"));
  await user.click(screen.getByRole("button", { name: "Back" }));
  await openMenuItem(user, "End game");
  const sheet = await screen.findByRole("dialog", { name: "End the game?" });
  found.push(...leaks("end game sheet", sheet));
  await user.click(within(sheet).getByRole("button", { name: "End" }));
  await screen.findByRole("heading", { name: "Results" });
  found.push(...leaks("results"));
  return found;
}

describe("English everywhere (feature 014 T021, SC-001)", () => {
  for (const [id, seed] of Object.entries(SEEDS)) {
    it(`${id}: Table, its sheets, History, Market and Results have no Spanish`, async () => {
      setNavigatorLanguages(["en-US"]);
      const { user } = await openSeededTable({ game: seed.game, actions: seed.actions, ...(seed.players ? { players: seed.players } : {}) });
      if (id === "1830") expect(document.body.textContent).toMatch(/\$\d{1,3},\d{3}/);
      expect(await walk(user)).toEqual([]);
    });
  }

  it("Home, New game and Settings have no Spanish", async () => {
    setNavigatorLanguages(["en-US"]);
    const user = userEvent.setup();
    render(<App dbName={freshDbName()} />);
    await screen.findByRole("button", { name: "New game" });
    const found = leaks("home");
    await user.click(screen.getByRole("button", { name: "New game" }));
    await screen.findByRole("heading", { name: "New game" });
    found.push(...leaks("new game"));
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(await screen.findByRole("button", { name: "Settings" }));
    await screen.findByRole("heading", { name: "Settings" });
    found.push(...leaks("settings"));
    expect(found).toEqual([]);
  });
});
