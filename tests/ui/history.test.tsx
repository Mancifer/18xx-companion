import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { byLine, cashText, openMenuItem, openSeededTable } from "./helpers";

const pay = (from: string, to: string, amount: number) => ({ type: "transferMoney", from, to, amount });

function item(text: RegExp | string): HTMLElement {
  const items = screen.getAllByRole("listitem").filter((li) => li.classList.contains("history-item"));
  const found = items.find((li) => (typeof text === "string" ? li.textContent.includes(text) : text.test(li.textContent)));
  if (!found) throw new Error(`No history item with ${String(text)}`);
  return found;
}

describe("History (US2)", () => {
  it("undo from History marks the entry reverted and balances revert", async () => {
    const { user } = await openSeededTable({ actions: [pay("player:p1", "bank", 100)] });
    expect(cashText("p1")).toBe("$500");

    await openMenuItem(user, "Historial");
    const entry = item("Ana paga $100 al banco");
    await user.click(within(entry).getByRole("button", { name: "Deshacer" }));

    expect(await within(entry).findByText("deshecha")).toBeTruthy();
    expect(entry.querySelector("s")?.textContent).toBe("Ana paga $100 al banco");
    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect(cashText("p1")).toBe("$600");
  });

  it("only the newest entry shows Deshacer; tapping it undoes with no confirmation (FR-002, FR-004)", async () => {
    const { user } = await openSeededTable({ actions: [pay("bank", "player:p2", 240), pay("player:p1", "bank", 100)] });
    await openMenuItem(user, "Historial");
    expect(within(item("El banco paga $240 a Bruno")).queryByRole("button", { name: "Deshacer" })).toBeNull();
    expect(within(item(/Nueva partida/)).queryByRole("button", { name: "Deshacer" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Deshacer" })).toHaveLength(1);

    await user.click(within(item("Ana paga $100 al banco")).getByRole("button", { name: "Deshacer" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await within(item("Ana paga $100 al banco")).findByText("deshecha")).toBeTruthy();
    // The previous entry is now the newest.
    expect(within(item("El banco paga $240 a Bruno")).getByRole("button", { name: "Deshacer" })).toBeTruthy();
  });

  it("offers no Corregir or Deshacer corrección anywhere", async () => {
    const { user } = await openSeededTable({ actions: [pay("bank", "player:p2", 240), pay("player:p1", "bank", 100)] });
    await openMenuItem(user, "Historial");
    expect(screen.queryByRole("button", { name: "Corregir" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Deshacer corrección" })).toBeNull();
  });

  it("a legacy amended entry still shows corregida with the original struck through (FR-018)", async () => {
    const { user } = await openSeededTable({
      actions: [pay("bank", "player:p2", 240)],
      entries: (log) => {
        const last = log[log.length - 1]!;
        if (last.kind !== "group") throw new Error("no group");
        const action = pay("bank", "player:p2", 260) as never;
        const events = [{ t: "moneyTransfer", from: "bank", to: "player:p2", amount: 260 }] as never;
        return [{ kind: "amend", seq: last.seq + 1, at: last.at, groupId: last.id, action, events, touches: last.touches }];
      },
    });
    await openMenuItem(user, "Historial");
    const amended = await screen.findByText("corregida");
    const li = amended.closest("li")!;
    expect(li.querySelector("s")?.textContent).toBe("El banco paga $240 a Bruno");
    expect(li.textContent).toContain("El banco paga $260 a Bruno");
    expect(within(li).getByRole("button", { name: "Deshacer" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect(cashText("p2")).toBe("$860");
  });
});

describe("History: undo back to here (feature 010, US2)", () => {
  const three = [pay("player:p1", "bank", 10), pay("player:p1", "bank", 20), pay("player:p1", "bank", 30)];

  it("an older active entry offers Deshacer hasta acá in its panel; Cancelar changes nothing", async () => {
    const { user } = await openSeededTable({ actions: three });
    await openMenuItem(user, "Historial");
    const oldest = item("Ana paga $10 al banco");
    expect(within(oldest).queryByRole("button", { name: "Deshacer" })).toBeNull();
    await user.click(oldest.querySelector("summary")!);
    await user.click(within(oldest).getByRole("button", { name: "Deshacer hasta acá" }));

    const sheet = await screen.findByRole("dialog", { name: "¿Deshacer 3 entradas?" });
    expect(within(sheet).getByText("Desde: Ana paga $10 al banco")).toBeTruthy();
    expect(within(sheet).getByText("Hasta: Ana paga $30 al banco")).toBeTruthy();
    await user.click(within(sheet).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("deshecha")).toBeNull();
  });

  it("confirming undoes the range: the entries stay, marked deshecha, and the toast names the range", async () => {
    const { user } = await openSeededTable({ actions: three });
    await openMenuItem(user, "Historial");
    await user.click(item("Ana paga $10 al banco").querySelector("summary")!);
    await user.click(within(item("Ana paga $10 al banco")).getByRole("button", { name: "Deshacer hasta acá" }));
    await user.click(within(await screen.findByRole("dialog", { name: "¿Deshacer 3 entradas?" })).getByRole("button", { name: "Deshacer 3" }));

    expect(await screen.findByText("Deshechas 3 entradas: desde Ana paga $10 al banco hasta Ana paga $30 al banco")).toBeTruthy();
    for (const amount of [10, 20, 30]) {
      const li = item(`Ana paga $${amount} al banco`);
      expect(within(li).getByText("deshecha")).toBeTruthy();
      expect(within(li).queryByRole("button", { name: /Deshacer/ })).toBeNull();
      expect(li.querySelector("details")).toBeTruthy();
    }
    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect(cashText("p1")).toBe("$600");
  });
});

describe("History: where the money went (feature 010, US3)", () => {
  const PAYING = [
    { type: "startSR" },
    { type: "parCompany", player: "p1", company: "PRR", price: 100 },
    { type: "buyShare", buyer: "player:p2", company: "PRR", source: "ipo", count: 2 },
    { type: "buyShare", buyer: "player:p1", company: "PRR", source: "ipo", count: 3 },
    { type: "endSR" },
    { type: "startOR" },
    { type: "runAndPayout", company: "PRR", parts: [{ part: "revenue", amount: 100 }], mode: "full" },
  ];

  it("one tap on a payout shows Movimientos with each recipient and Saldos before → after (SC-003)", async () => {
    const { user } = await openSeededTable({ actions: PAYING });
    await openMenuItem(user, "Historial");
    const entry = item(/PRR paga \$100/);
    await user.click(entry.querySelector("summary")!);
    const panel = entry.querySelector(".history-panel") as HTMLElement;
    expect(within(panel).getByText("Movimientos")).toBeTruthy();
    expect(within(panel).getByText("$50: Banco → Ana")).toBeTruthy();
    expect(within(panel).getByText("$20: Banco → Bruno")).toBeTruthy();
    expect(within(panel).getByText("Saldos")).toBeTruthy();
    expect(within(panel).getByText(/^Ana: \$\d+ → \$\d+ \(\+\$50\)$/)).toBeTruthy();
    expect(within(panel).getByText(byLine(/^PRR: \$\d+ → \$\d+$/))).toBeTruthy();
  });

  it("every entry is expandable, omits empty sections, and an undone entry keeps its breakdown", async () => {
    const { user } = await openSeededTable({ actions: [{ type: "note", text: "hola" }, pay("player:p1", "bank", 100)] });
    await openMenuItem(user, "Historial");
    for (const li of screen.getAllByRole("listitem").filter((x) => x.classList.contains("history-item"))) {
      expect(li.querySelector("details > summary")).toBeTruthy();
    }
    const note = item("Nota: hola");
    await user.click(note.querySelector("summary")!);
    expect(within(note).queryByText("Movimientos")).toBeNull();
    expect(within(note).queryByText("Saldos")).toBeNull();

    const paid = item("Ana paga $100 al banco");
    await user.click(within(paid).getByRole("button", { name: "Deshacer" }));
    await within(paid).findByText("deshecha");
    await user.click(paid.querySelector("summary")!);
    expect(within(paid).getByText("$100: Ana → Banco")).toBeTruthy();
    expect(within(paid).getByText("Ana: $600 → $500 (−$100)")).toBeTruthy();
  });
});

describe("History marks out-of-turn actions (T028, FR-012)", () => {
  it("an operating action for a company whose turn it is not shows the outOfTurn warning", async () => {
    const { user } = await openSeededTable({
      actions: [
        { type: "startSR" },
        { type: "parCompany", player: "p1", company: "PRR", price: 100 },
        { type: "buyShare", buyer: "player:p1", company: "PRR", source: "ipo", count: 4 },
        { type: "parCompany", player: "p2", company: "NYC", price: 90 },
        { type: "buyShare", buyer: "player:p2", company: "NYC", source: "ipo", count: 4 },
        { type: "endSR" },
        { type: "startOR" },
        { type: "payCost", company: "NYC", amount: 20, reason: null },
      ],
    });
    await openMenuItem(user, "Historial");
    expect(item("NYC paga $20").textContent).toContain("NYC opera fuera de turno (le toca a PRR).");
  });
});

describe("History: the game end (feature 007, contracts/ui.md §4)", () => {
  async function endFromMenu(user: Awaited<ReturnType<typeof openSeededTable>>["user"]) {
    await openMenuItem(user, "Terminar partida");
    await user.click(within(await screen.findByRole("dialog", { name: "¿Terminar la partida?" })).getByRole("button", { name: "Terminar" }));
    await screen.findByRole("heading", { name: "Resultados" });
    await user.click(screen.getByRole("button", { name: "Volver" }));
  }

  it("an endGame entry reads Fin de la partida with its conditions, and can be undone but not corrected", async () => {
    const { user } = await openSeededTable();
    await endFromMenu(user);
    await openMenuItem(user, "Historial");
    const entry = item("Fin de la partida (sin condición de fin)");
    expect(within(entry).getByRole("button", { name: "Deshacer" })).toBeTruthy();
    expect(within(entry).queryByRole("button", { name: "Corregir" })).toBeNull();
  });

  it("the group that reached an automatic end carries Fin de la partida (automático)", async () => {
    const setTurn = { type: "setTurn", round: "OR", srNumber: 4, orSet: 4, orIndex: 1, orsInSet: 2, company: null };
    const { user } = await openSeededTable({ game: "rotla", players: ["Ana", "Bruno", "Carla"], options: { mode: "short" }, actions: [setTurn] });
    await user.click(screen.getByRole("button", { name: /^Turno:/ }));
    const sheet = await screen.findByRole("dialog", { name: "Turno y fase" });
    await user.click(within(sheet).getByRole("button", { name: "OR del set: más" }));
    await user.click(within(sheet).getByRole("button", { name: "Fijar turno" }));
    await screen.findByRole("heading", { name: "Resultados" });
    await user.click(screen.getByRole("button", { name: "Volver" }));
    await openMenuItem(user, "Historial");
    const tagged = screen.getAllByText("Fin de la partida (automático)");
    expect(tagged).toHaveLength(1);
    expect(tagged[0]!.closest("li")?.getAttribute("data-group")).toBe("g3");
  });
});

describe("History: a reopened game (feature 007, US4-3)", () => {
  type User = Awaited<ReturnType<typeof openSeededTable>>["user"];
  async function setOrIndex(user: User, button: "más" | "menos") {
    await user.click(screen.getByRole("button", { name: /^Turno:/ }));
    const sheet = await screen.findByRole("dialog", { name: "Turno y fase" });
    await user.click(within(sheet).getByRole("button", { name: `OR del set: ${button}` }));
    await user.click(within(sheet).getByRole("button", { name: "Fijar turno" }));
  }
  async function reopen(user: User) {
    await user.click(await screen.findByRole("button", { name: "Reabrir partida" }));
    await user.click(within(await screen.findByRole("dialog", { name: "¿Reabrir la partida?" })).getByRole("button", { name: "Reabrir" }));
    await screen.findByRole("button", { name: "Menú" });
  }

  it("shows the end and the reopening, earlier entries unchanged", async () => {
    const { user } = await openSeededTable({ actions: [pay("player:p1", "bank", 100)] });
    await openMenuItem(user, "Terminar partida");
    await user.click(within(await screen.findByRole("dialog", { name: "¿Terminar la partida?" })).getByRole("button", { name: "Terminar" }));
    await reopen(user);
    await openMenuItem(user, "Historial");
    expect(item("Fin de la partida (sin condición de fin)")).toBeTruthy();
    expect(item("Partida reabierta")).toBeTruthy();
    expect(within(item("Ana paga $100 al banco")).queryByText("deshecha")).toBeNull();
  });

  it("RotLA: the reached end keeps its automático tag after a reopening, and a new automatic end is tagged too", async () => {
    const setTurn = { type: "setTurn", round: "OR", srNumber: 4, orSet: 4, orIndex: 1, orsInSet: 2, company: null };
    const { user } = await openSeededTable({ game: "rotla", players: ["Ana", "Bruno", "Carla"], options: { mode: "short" }, actions: [setTurn] });
    await setOrIndex(user, "más");
    await screen.findByRole("heading", { name: "Resultados" });
    await reopen(user);
    await openMenuItem(user, "Historial");
    expect(screen.getAllByText("Fin de la partida (automático)")).toHaveLength(1);
    expect(item("Partida reabierta")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Volver" }));

    await setOrIndex(user, "menos");
    await setOrIndex(user, "más");
    await screen.findByRole("heading", { name: "Resultados" });
    await user.click(screen.getByRole("button", { name: "Volver" }));
    await openMenuItem(user, "Historial");
    expect(screen.getAllByText("Fin de la partida (automático)")).toHaveLength(2);
  });
});

describe("History: round-end titles (feature 011, US5)", () => {
  const par = { type: "parCompany", player: "p1", company: "PRR", price: 100 };
  const buy = (buyer: string) => ({ type: "buyShare", buyer, company: "PRR", source: "ipo", count: null });
  const withhold = { type: "runAndPayout", company: null, parts: [{ part: "revenue", amount: 0 }], mode: "withhold" };

  it("names the end of OR 1.1 and the end of the set, in History and in the undo toast (FR-022, FR-023)", async () => {
    const { user } = await openSeededTable({
      actions: [{ type: "startSR" }, par, buy("player:p2"), buy("player:p3"), buy("player:p4"), buy("player:p2"), { type: "setPhase", phase: "3" }, { type: "startOR" }, withhold, { type: "nextCompany" }, withhold],
    });
    await user.click(screen.getByRole("tab", { name: "Compañías" }));
    await user.click(screen.getByTestId("treasury-PRR").closest("button")!);
    const sheet = await screen.findByRole("dialog");
    await user.click(within(sheet).getByRole("button", { name: /^Terminar turno/ }));
    const toast = (await screen.findAllByText(/Fin de las rondas de operaciones/))[0]!.closest(".toast")!;
    expect(toast.textContent).not.toMatch(/Siguiente compañía|empieza la ronda de acciones/);

    await openMenuItem(user, "Historial");
    expect(item(/^.*Fin de la OR 1\.1 · empieza la OR 1\.2/)).toBeTruthy();
    expect(item(/Fin de las rondas de operaciones/)).toBeTruthy();
  });
});

describe("History: round sections (feature 011, US4)", () => {
  const par = { type: "parCompany", player: "p1", company: "PRR", price: 100 };
  const buy = (buyer: string) => ({ type: "buyShare", buyer, company: "PRR", source: "ipo", count: 2 });
  const sr1ToSr2 = [{ type: "startSR" }, par, buy("player:p1"), buy("player:p2"), { type: "startOR" }, { type: "nextCompany" }, { type: "startSR" }, pay("player:p1", "bank", 10)];
  const sections = () => screen.getAllByRole("region");

  it("shows the rounds newest first, with headers, start bands and entries newest first", async () => {
    const { user } = await openSeededTable({ actions: sr1ToSr2 });
    await openMenuItem(user, "Historial");
    const titles = sections().map((s) => s.getAttribute("aria-label"));
    expect(titles.slice(0, 3)).toEqual(["Ronda de acciones 2", "Ronda de operaciones 1.1", "Ronda de acciones 1"]);
    const [sr2, or11, sr1] = sections();
    expect(sr2!.querySelector(".round-header")?.textContent).toBe("💼 Ronda de acciones 2 · en curso");
    expect(or11!.querySelector(".round-header")?.textContent).toBe("🚂 Ronda de operaciones 1.1 · terminada");
    expect(sr1!.querySelector(".round-header")?.textContent).toBe("💼 Ronda de acciones 1 · terminada");
    expect(sr2!.querySelector(".round-start")?.textContent).toBe("Inicio · Ronda de acciones 2");
    const sr2Items = within(sr2!).getAllByRole("listitem").map((li) => li.textContent);
    expect(sr2Items[0]).toContain("Ana paga $10 al banco");
    expect(sr2Items.at(-1)).toContain("Empieza la ronda de acciones");
    expect(within(sr2!).getByRole("button", { name: "Deshacer" })).toBeTruthy();
  });

  it("undoing the start of SR 2 removes its section; the undone entry stays struck through in OR 1.1", async () => {
    const { user } = await openSeededTable({ actions: sr1ToSr2.slice(0, -1) });
    await openMenuItem(user, "Historial");
    await user.click(within(item(/Empieza la ronda de acciones/)).getByRole("button", { name: "Deshacer" }));
    await within(item(/Empieza la ronda de acciones/)).findByText("deshecha");
    expect(screen.queryByRole("region", { name: "Ronda de acciones 2" })).toBeNull();
    const or11 = screen.getByRole("region", { name: "Ronda de operaciones 1.1" });
    expect(or11.querySelector(".round-header")?.textContent).toContain("en curso");
    expect(within(or11).getByText(/Empieza la ronda de acciones/, { selector: "s" })).toBeTruthy();
  });
});

describe("History: company badges (feature 013, US1)", () => {
  const PAYING = [
    { type: "startSR" },
    { type: "parCompany", player: "p1", company: "PRR", price: 100 },
    { type: "buyShare", buyer: "player:p2", company: "PRR", source: "ipo", count: 2 },
    { type: "buyShare", buyer: "player:p1", company: "PRR", source: "ipo", count: 3 },
    { type: "endSR" },
    { type: "startOR" },
    { type: "runAndPayout", company: "PRR", parts: [{ part: "revenue", amount: 100 }], mode: "full" },
  ];
  const badges = (el: Element, short: string) =>
    [...el.querySelectorAll<HTMLElement>(".company-badge")].filter((b) => b.textContent === short);

  it("summaries show each company as its badge, with the same text as before", async () => {
    const { user } = await openSeededTable({ actions: PAYING });
    await openMenuItem(user, "Historial");
    const entry = item(/Bruno compra 2 PRR/);
    const summary = entry.querySelector(".history-summary")!;
    const [badge] = badges(summary, "PRR");
    expect(badge).toBeTruthy();
    expect(badge!.style.background).not.toBe("");
    expect(summary.textContent).toMatch(/^Bruno compra 2 PRR de la IPO/);
  });

  it("movements and balances show badges once the entry is expanded", async () => {
    const { user } = await openSeededTable({ actions: [...PAYING, pay("bank", "company:PRR", 50)] });
    await openMenuItem(user, "Historial");
    const bought = item(/Bruno compra 2 PRR/);
    await user.click(bought.querySelector("summary")!);
    expect(badges(bought.querySelector(".history-moves")!, "PRR").length).toBeGreaterThan(0);
    const funded = item(/El banco paga \$50 a PRR/);
    await user.click(funded.querySelector("summary")!);
    expect(badges(funded.querySelector(".history-balances")!, "PRR").length).toBeGreaterThan(0);
  });

  it("an undone entry stays struck through, with its badge inside the strike", async () => {
    const { user } = await openSeededTable({ actions: PAYING });
    await openMenuItem(user, "Historial");
    const entry = item(/PRR paga \$100/);
    await user.click(within(entry).getByRole("button", { name: "Deshacer" }));
    await within(entry).findByText("deshecha");
    const struck = entry.querySelector("s")!;
    expect(badges(struck, "PRR").length).toBeGreaterThan(0);
    expect(struck.textContent).toMatch(/^PRR paga \$100/);
  });
});
