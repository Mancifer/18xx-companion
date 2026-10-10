import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { VoiceDeps } from "../../src/app/useVoice";
import type { RecognizerLike } from "../../src/voice/speech";
import { describe, expect, it } from "vitest";
import { getBuiltInGame } from "../../src/domain/games";
import { App } from "../../src/ui/App";
import { freshDbName } from "../helpers/session";
import { openMenuItem, openSeededTable } from "./helpers";

/** RotLA screens (feature 004, contracts/ui.md). */

async function openNewSession() {
  const user = userEvent.setup();
  render(<App dbName={freshDbName()} />);
  await user.click(await screen.findByRole("button", { name: "Nueva partida" }));
  await user.click(await screen.findByRole("button", { name: /Railways of the Lost Atlas/ }));
  return user;
}

const select = (label: string) => screen.getByLabelText<HTMLSelectElement>(label);

describe("New Session for RotLA (US1)", () => {
  it("shows the mode and variant selects", async () => {
    await openNewSession();
    expect(select("Modo").value).toBe("long");
    for (const label of ["Caída por acción", "Quiebra de banca", "Fusiones hostiles", "Sedes"]) {
      expect(select(label)).toBeTruthy();
    }
  });

  it("changing the mode updates the cash and train previews", async () => {
    const user = await openNewSession();
    // Four players by default.
    expect(screen.getByTestId("cash-preview").textContent).toContain("$275");
    expect(screen.getByTestId("train-preview").textContent).toBe("2×7 · 3×6 · 4×4 · 5×3 · 6×3 · 7/∞");
    await user.click(screen.getAllByRole("button", { name: "Quitar" })[0]!);
    expect(screen.getByTestId("cash-preview").textContent).toContain("$300");
    expect(screen.getByTestId("train-preview").textContent).toBe("2×7 · 3×5 · 4×4 · 5×3 · 6×2 · 7/∞");
    await user.selectOptions(select("Modo"), "short");
    expect(screen.getByTestId("train-preview").textContent).toBe("2×6 · 3×4 · 4×3 · 5×2 · 6×1 · 7/∞");
  });

  it("the minors checklist shows 8 de 12 for Short and warns when the count differs", async () => {
    const user = await openNewSession();
    await user.selectOptions(select("Modo"), "short");
    const minors = screen.getByRole("group", { name: /Minors en juego/ });
    expect(within(minors).getByTestId("minors-count").textContent).toBe("8 de 12");
    expect(within(minors).getAllByRole("checkbox")).toHaveLength(8);
    expect(screen.queryByText(/este modo usa/)).toBeNull();
    await user.click(within(minors).getByRole("checkbox", { name: /TUN/ }));
    expect(within(minors).getByTestId("minors-count").textContent).toBe("7 de 12");
    expect(screen.getByText(/hay 7; este modo usa 8/)).toBeTruthy();
  });

  it("5 players with Short warns and Empezar stays enabled", async () => {
    const user = await openNewSession();
    await user.selectOptions(select("Modo"), "short");
    await user.click(screen.getByRole("button", { name: "Añadir jugador" }));
    expect(screen.getByText("El juego corto es para 2–4 jugadores.")).toBeTruthy();
    const names = ["Ana", "Bruno", "Carla", "Dani", "Eva"];
    for (const [i, n] of names.entries()) await user.type(screen.getByLabelText(`Nombre del jugador ${i + 1}`), n);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Empezar" }).disabled).toBe(false);
  });
});

const three = ["Ana", "Bruno", "Carla"];

async function typeAmount(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, amount: number) {
  await user.click(within(dialog).getByRole("button", { name: "Vaciar" }));
  for (const d of String(amount)) await user.click(within(dialog).getByRole("button", { name: new RegExp(`^${d}$`) }));
}

describe("Launch sheet (US2)", () => {
  it("offers players, the unstarted minors and a bid prefilled with 120", async () => {
    const { user } = await openSeededTable({ game: "rotla", players: three, actions: [{ type: "launchCompany", player: "p2", company: "EXP", bid: 165, price: null }] });
    await user.click(screen.getByRole("button", { name: "Abrir minor" }));
    const dialog = await screen.findByRole("dialog");
    for (const name of three) expect(within(dialog).getByRole("button", { name })).toBeTruthy();
    const minors = within(dialog).getByRole("group", { name: "Minor" });
    expect(within(minors).getAllByRole("button")).toHaveLength(11);
    expect(within(minors).queryByRole("button", { name: /EXP/ })).toBeNull();
    expect(within(dialog).getByTestId("keypad-value").textContent).toBe("$120");
  });

  it("previews the price, treasury and shares; a capped price can be overridden; one tap confirms", async () => {
    const { user } = await openSeededTable({ game: "rotla", players: three });
    await user.click(screen.getByRole("button", { name: "Abrir minor" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Ana" }));
    await user.click(within(dialog).getByRole("button", { name: /TUN/ }));
    await typeAmount(user, dialog, 140);
    expect(within(dialog).getByTestId("launch-preview").textContent).toBe("Precio $70 · Tesorería $140 · 3 acciones en tesorería");
    expect(within(dialog).getByText(/Ana entrega \$140/)).toBeTruthy();

    await typeAmount(user, dialog, 200);
    expect(within(dialog).getByText("Tope de fase $90")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: /^Precio \$90/ }));
    await user.click(within(dialog).getByRole("button", { name: "$100" }));
    expect(within(dialog).getByTestId("launch-preview").textContent).toContain("Precio $100");

    await user.click(within(dialog).getByRole("button", { name: "Abrir" }));
    expect(await screen.findByText(/Ana abre Tunneling por \$200/, { selector: ".toast-summary" })).toBeTruthy();
  });

  it("an unstarted minor's card opens the Launch sheet in the SR", async () => {
    const { user } = await openSeededTable({ game: "rotla", players: three });
    await user.click(screen.getByTestId("treasury-TUN").closest("button")!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("launch-preview")).toBeTruthy();
    expect(within(within(dialog).getByRole("group", { name: "Minor" })).getByRole("button", { name: /TUN/ }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("Stock round in RotLA (US3)", () => {
  it("a treasury purchase takes ≤ 2 taps and pays the company", async () => {
    const { user } = await openSeededTable({
      game: "rotla",
      players: three,
      actions: [{ type: "launchCompany", player: "p1", company: "EXP", bid: 160, price: null }],
    });
    let taps = 0;
    const tap = async (el: Element) => {
      taps += 1;
      await user.click(el);
    };
    await tap(screen.getByTestId("treasury-EXP").closest("button")!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "IPO Bruno" })).toBeNull();
    await tap(within(dialog).getByRole("button", { name: "Tesorería Bruno" }));
    expect(await screen.findByText(/Bruno compra 1 EXP de la tesorería/, { selector: ".toast-summary" })).toBeTruthy();
    expect(screen.getByTestId("treasury-EXP").textContent).toContain("$240");
    expect(taps).toBeLessThanOrEqual(2);
  });
});

describe("Stock sheet buy sources in RotLA (bug rotla-buy-default-treasury)", () => {
  it("never shows an IPO button, even once the treasury is sold out", async () => {
    const buy = (buyer: string) => ({ type: "buyShare", buyer: `player:${buyer}`, company: "EXP", source: "treasury", count: 1 });
    const { user } = await openSeededTable({
      game: "rotla",
      players: three,
      actions: [{ type: "launchCompany", player: "p1", company: "EXP", bid: 160, price: null }, buy("p2"), buy("p3"), buy("p2")],
    });
    await user.click(screen.getByTestId("treasury-EXP").closest("button")!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "IPO Bruno" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Tesorería Bruno" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Pool Bruno" })).toBeTruthy();
  });
});

describe("round indicator in cycles (US1)", () => {
  it("shows Ciclo n de N · RA, then RO 1/2", async () => {
    const { user } = await openSeededTable({ game: "rotla", players: ["Ana", "Bruno", "Carla"], options: { mode: "short" } });
    expect(screen.getByTestId("round").textContent).toBe("Ciclo 1 de 4 · RA");
    expect(screen.getByText(/fase Amarilla/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Empezar (OR|RO)/ }));
    await waitFor(() => expect(screen.getByTestId("round").textContent).toBe("Ciclo 1 de 4 · RO 1/2"));
  });
});

describe("Operate sheet in RotLA (US5)", () => {
  const launch = (company: string, player = "p1", bid = 140) => ({ type: "launchCompany", player, company, bid, price: null });

  async function operate(seed: Parameters<typeof openSeededTable>[0], company: string) {
    const opened = await openSeededTable(seed);
    await opened.user.click(screen.getByTestId(`treasury-${company}`).closest("button")!);
    return { ...opened, dialog: await screen.findByRole("dialog") };
  }

  it("Emitir and Recomprar are one tap each; Recomprar waits for a pool share", async () => {
    const { user, dialog } = await operate({ game: "rotla", players: three, actions: [launch("EXP"), { type: "startOR" }] }, "EXP");
    expect(within(dialog).getByRole<HTMLButtonElement>("button", { name: /^Recomprar/ }).disabled).toBe(true);
    await user.click(within(dialog).getByRole("button", { name: /^Emitir/ }));
    expect(await screen.findByText(/EXP emite 1 acción de su tesorería al pool/, { selector: ".toast-summary" })).toBeTruthy();
    const again = await screen.findByRole("dialog");
    await user.click(within(again).getByRole("button", { name: /^Recomprar/ }));
    expect(await screen.findByText(/EXP recompra 1 acción del pool/, { selector: ".toast-summary" })).toBeTruthy();
  });

  it("Montaña records one namedPayment: one group, both lines in one entry", async () => {
    const { user, dialog } = await operate({ game: "rotla", players: three, actions: [launch("TUN"), { type: "startOR" }] }, "TUN");
    await user.click(within(dialog).getByRole("button", { name: "Montaña (−40 / +60)" }));
    expect(await screen.findByText("Tunneling: montaña −$40 · bonificación +$60", { selector: ".toast-summary" })).toBeTruthy();
    expect(screen.getByTestId("treasury-TUN").textContent).toContain("$160");
  });

  it("Ficha extra shows its cost", async () => {
    const { dialog } = await operate({ game: "rotla", players: three, actions: [launch("EXV"), { type: "startOR" }] }, "EXV");
    expect(within(dialog).getByRole("button", { name: "Ficha extra (−40)" })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /Montaña/ })).toBeNull();
  });

  it("Sede (+…) opens the keypad for the amount", async () => {
    const base = getBuiltInGame("rotla");
    const game = {
      ...base,
      companies: base.companies.map((c) =>
        c.id === "EXP" ? { ...c, traits: { payments: [{ id: "headquarters", labelEs: "Sede", amount: 0, direction: "bankPays" as const }] } } : c,
      ),
    };
    const { user, dialog } = await operate({ game, players: three, actions: [launch("EXP"), { type: "startOR" }] }, "EXP");
    await user.click(within(dialog).getByRole("button", { name: "Sede (+…)" }));
    const keypad = await screen.findByRole("dialog");
    await typeAmount(user, keypad, 35);
    await user.click(within(keypad).getByRole("button", { name: /^Cobrar/ }));
    expect(await screen.findByText("Express: sede +$35", { selector: ".toast-summary" })).toBeTruthy();
  });

  it("the payout still takes ≤ 2 taps after the amount", async () => {
    const { user, dialog } = await operate({ game: "rotla", players: three, actions: [launch("EXP"), { type: "startOR" }] }, "EXP");
    await typeAmount(user, dialog, 90);
    await user.click(within(dialog).getByRole("button", { name: "Pagar" }));
    expect(await screen.findByText(/EXP paga \$90/, { selector: ".toast-summary" })).toBeTruthy();
  });

  it("1830 shows neither Emitir nor Recomprar", async () => {
    const shares = { type: "transferShares", company: "PRR", from: "ipo:PRR", to: "player:p1", units: 6, presidency: true };
    const { dialog } = await operate({ game: "1830", actions: [shares, { type: "startOR" }] }, "PRR");
    expect(within(dialog).queryByRole("button", { name: /^Emitir/ })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /^Recomprar/ })).toBeNull();
  });
});

describe("Trains in RotLA (US6)", () => {
  const launch = (company: string, player = "p1", bid = 120) => ({ type: "launchCompany", player, company, bid, price: null });
  const fund = (company: string, amount: number) => ({ type: "transferMoney", from: "bank", to: `company:${company}`, amount });
  const buy = (company: string, trainType: string) => ({
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
  const turnTo = (company: string) => ({ type: "setTurn", round: null, srNumber: null, orSet: null, orIndex: null, orsInSet: null, company });

  async function operate(actions: unknown[], company: string) {
    const opened = await openSeededTable({ game: "rotla", players: three, actions });
    await opened.user.click(screen.getByTestId(`treasury-${company}`).closest("button")!);
    return { ...opened, dialog: await screen.findByRole("dialog") };
  }

  it("7/∞ shows both prices and '∞ entregando…', which leaves out the trains this purchase rusts", async () => {
    const { user, dialog } = await operate(
      [launch("EXP"), fund("EXP", 3000), buy("EXP", "4"), buy("EXP", "5"), startOR],
      "EXP",
    );
    await user.click(within(dialog).getByRole("button", { name: "Comprar tren" }));
    const trains = await screen.findByRole("dialog");
    expect(within(trains).getByRole("button", { name: "7: $750" })).toBeTruthy();
    expect(within(trains).getByRole("button", { name: "∞: $1.000" })).toBeTruthy();
    await user.click(within(trains).getByRole("button", { name: "∞ entregando…" }));
    expect(within(trains).getByRole("button", { name: "∞ entregando un 5 · $800" })).toBeTruthy();
    expect(within(trains).queryByRole("button", { name: /entregando un 4/ })).toBeNull();
  });

  it("a company with no train and too little cash gets the Compra forzada card", async () => {
    const pay = { type: "payCost", company: "EXP", amount: 50, reason: null };
    const { user, dialog } = await operate([launch("EXP"), startOR, pay], "EXP");
    await user.click(within(dialog).getByRole("button", { name: "Comprar tren" }));
    const trains = await screen.findByRole("dialog");
    const card = within(trains).getByRole("group", { name: "Compra forzada" });
    expect(within(card).getByText(/El presidente pone \$30/)).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Añadir venta" })).toBeTruthy();
    await user.click(within(card).getByRole("button", { name: /^Comprar el 2/ }));
    expect(await screen.findByText(/Compra forzada: EXP compra un 2 al banco/, { selector: ".toast-summary" })).toBeTruthy();
  });

  it("a Resourceful rusted train shows 'Oxidado · última carrera' and Retirar", async () => {
    const { user, dialog } = await operate(
      [launch("RES"), buy("RES", "2"), launch("TUN", "p2", 160), fund("TUN", 300), buy("TUN", "4"), startOR, turnTo("RES")],
      "RES",
    );
    expect(within(dialog).getByText("2 · Oxidado · última carrera")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Retirar el 2" }));
    expect(await screen.findByText(/RES descarta un 2/, { selector: ".toast-summary" })).toBeTruthy();
  });

  it("an over-limit banner on the Table opens the discard picker", async () => {
    const { user } = await openSeededTable({
      game: "rotla",
      players: three,
      actions: [launch("EXP"), fund("EXP", 500), buy("EXP", "2"), buy("EXP", "2"), buy("EXP", "2")],
    });
    const banner = screen.getByRole("button", { name: "Express: 3 trenes, límite 2. Elegir cuál va al pool" });
    await user.click(banner);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getAllByRole("button", { name: "Descartar un 2" })[0]!);
    expect(await screen.findByText(/EXP descarta un 2/, { selector: ".toast-summary" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /3 trenes, límite 2/ })).toBeNull();
  });

  it("the Market shows the train stack and the limits", async () => {
    const { user } = await openSeededTable({ game: "rotla", players: three });
    await openMenuItem(user, "Mercado");
    const section = await screen.findByRole("region", { name: "Trenes" });
    expect(within(section).getByTestId("train-stack").textContent).toBe("2×7 · 3×5 · 4×4 · 5×3 · 6×2 · 7/∞×∞");
    expect(within(section).getByText("Límite: minor 2 · major 2")).toBeTruthy();
  });
});

describe("Merger sheet (US7)", () => {
  const launch = (company: string, player: string, bid: number) => ({ type: "launchCompany", player, company, bid, price: null });
  const toMR = { type: "setTurn", round: "MR", srNumber: null, orSet: null, orIndex: null, orsInSet: null, company: null };

  async function openMerger() {
    const opened = await openSeededTable({
      game: "rotla",
      players: three,
      actions: [launch("TUN", "p2", 140), launch("EXP", "p1", 160), toMR],
    });
    await opened.user.click(screen.getByRole("button", { name: "Fusionar…" }));
    return { ...opened, dialog: await screen.findByRole("dialog") };
  }

  it("lists minors in operating order and unstarted majors with both identities", async () => {
    const { user, dialog } = await openMerger();
    const minors = within(dialog).getByRole("group", { name: "Minors" });
    expect(within(minors).getAllByRole("button").map((b) => b.textContent)).toEqual(["EXP", "TUN"]);
    const majors = within(dialog).getByRole("group", { name: "Corporación" });
    expect(within(majors).getAllByRole("button", { name: /^[A-Z]{3}/ })).toHaveLength(6);
    await user.click(within(majors).getByRole("button", { name: /^UNI/ }));
    const identity = within(dialog).getByRole("group", { name: "Identidad" });
    expect(within(identity).getByRole("button", { name: "Union" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(identity).getByRole("button", { name: "Unlimited" })).toBeTruthy();
  });

  it("previews the merger, merges in ≤ 3 taps after the minors, and History lists every transfer", async () => {
    const { user, dialog } = await openMerger();
    const minors = within(dialog).getByRole("group", { name: "Minors" });
    await user.click(within(minors).getByRole("button", { name: "EXP" }));
    await user.click(within(minors).getByRole("button", { name: "TUN" }));
    let taps = 0;
    const tap = async (el: Element) => {
      taps += 1;
      await user.click(el);
    };
    await tap(within(within(dialog).getByRole("group", { name: "Corporación" })).getByRole("button", { name: /^UNI/ }));
    const preview = within(dialog).getByTestId("merge-preview");
    expect(preview.textContent).toContain("Presidencia: Ana");
    expect(within(preview).getByText("desempate por orden")).toBeTruthy();
    expect(preview.textContent).toContain("Ana 2 · Bruno 2 · tesorería 6");
    expect(preview.textContent).toContain("Precio $70 · Tesorería $300 · 0 trenes");
    await tap(within(dialog).getByRole("button", { name: "Fusionar" }));
    expect(taps).toBeLessThanOrEqual(3);
    expect(
      await screen.findByText("Express + Tunneling → Union · presidente Ana · precio $70 · tesorería $300 · 0 trenes", {
        selector: ".toast-summary",
      }),
    ).toBeTruthy();

    await openMenuItem(user, "Historial");
    const entries = screen.getAllByRole("listitem").filter((li) => li.textContent.includes("Express + Tunneling → Union"));
    expect(entries).toHaveLength(1);
    await user.click(within(entries[0]!).getByText("Movimientos"));
    expect(within(entries[0]!).getByText("2 EXP (presidencia): Ana → fuera del juego")).toBeTruthy();
    expect(within(entries[0]!).getByText("$160: EXP → UNI")).toBeTruthy();
  });

  it("the Table offers Ronda de fusiones only when it is due", async () => {
    await openSeededTable({ game: "rotla", players: three });
    expect(screen.queryByRole("button", { name: "Ronda de fusiones" })).toBeNull();
  });
});

describe("Cycle round controls and the Score sheet (US8)", () => {
  const startOR = { type: "startOR" };
  const turn = (t: Record<string, unknown>) => ({
    type: "setTurn",
    round: null,
    srNumber: null,
    orSet: null,
    orIndex: null,
    orsInSet: null,
    company: null,
    ...t,
  });
  const lastCycleDone = turn({ round: "OR", srNumber: 4, orSet: 4, orIndex: 2, orsInSet: 2 });

  it("one button per transition: RO 1, RO 2, then export and a new SR with its preview", async () => {
    const { user } = await openSeededTable({ game: "rotla", players: three });
    expect(screen.queryByRole("button", { name: "Empezar ronda de acciones" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Empezar RO 1" }));
    await user.click(await screen.findByRole("button", { name: "Empezar RO 2" }));
    const next = await screen.findByRole("button", { name: /^Exportar y nueva RA/ });
    expect(next.textContent).toContain("Salen 7×2 · quedan 5×3");
    await user.click(next);
    expect(await screen.findByRole("button", { name: "Empezar RO 1" })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("round").textContent).toBe("Ciclo 2 de 6 · RA"));
  });

  it("from green on, OR 2 leads to the Merger Round, which offers Fusionar… and the export", async () => {
    const { user } = await openSeededTable({ game: "rotla", players: three, actions: [{ type: "setPhase", phase: "green" }, startOR, startOR] });
    await user.click(screen.getByRole("button", { name: "Ronda de fusiones" }));
    expect(await screen.findByRole("button", { name: "Fusionar…" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Exportar y nueva RA/ })).toBeTruthy();
  });

  it("after the last cycle: Ver puntuación, and the Score sheet opens by itself", async () => {
    const { user } = await openSeededTable({
      game: "rotla",
      players: three,
      options: { mode: "short" },
      actions: [{ type: "launchCompany", player: "p1", company: "EXP", bid: 160, price: null }, lastCycleDone],
    });
    const sheet = await screen.findByRole("dialog", { name: "Puntuación" });
    const rows = within(sheet).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell").map((c) => c.textContent))).toEqual([
      ["1", "Ana", "$140", "$160", "$300"],
      ["2", "Bruno", "$300", "$0", "$300"],
      ["2", "Carla", "$300", "$0", "$300"],
    ]);
    expect(within(sheet).getByText("desempate: presidente de EXP")).toBeTruthy();
    await user.click(within(sheet).getByRole("button", { name: "Cerrar" }));
    expect(screen.getByRole("button", { name: "Ver puntuación" })).toBeTruthy();
  });

  it("the menu opens the Score sheet at any time", async () => {
    const { user } = await openSeededTable({ game: "rotla", players: three });
    await openMenuItem(user, "Puntuación");
    expect(await screen.findByRole("dialog", { name: "Puntuación" })).toBeTruthy();
  });
});

describe("Eliminated players (US9-4)", () => {
  const launch = (company: string, player: string, bid: number) => ({ type: "launchCompany", player, company, bid, price: null });

  it("a bankruptcy offers Terminar partida, which lists the player last as Eliminado", async () => {
    const { user } = await openSeededTable({ game: "rotla", players: three, actions: [launch("EXP", "p3", 160)] });
    await user.click(screen.getByRole("tab", { name: "Jugadores" }));
    await user.click(screen.getByTestId("cash-p3").closest("button")!);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Declarar quiebra" }));
    const confirm = await screen.findByRole("dialog", { name: "Quiebra de Carla" });
    expect(within(confirm).getByText(/se cierran las compañías que preside/)).toBeTruthy();
    await user.click(within(confirm).getByRole("button", { name: "Declarar quiebra" }));
    await user.click(await screen.findByRole("button", { name: "Terminar partida" }));
    const sheet = await screen.findByRole("dialog", { name: "Puntuación" });
    const last = within(sheet).getAllByRole("row").at(-1)!;
    expect(within(last).getAllByRole("cell").map((c) => c.textContent)).toEqual(["—", "Carla", "$0", "$0", "Eliminado"]);
  });

  it("an eliminated player is marked on the Table and hidden from the Launch and Stock pickers", async () => {
    const { user } = await openSeededTable({
      game: "rotla",
      players: three,
      actions: [launch("EXP", "p3", 160), launch("TUN", "p1", 140), { type: "declareBankruptcy", player: "p3", company: null }],
    });
    expect(screen.getByText("Eliminado")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Abrir minor" }));
    const launchSheet = await screen.findByRole("dialog");
    expect(within(launchSheet).queryByRole("button", { name: "Carla" })).toBeNull();
    await user.click(within(launchSheet).getByRole("button", { name: "Cerrar" }));
    await user.click(screen.getByRole("tab", { name: "Compañías" }));
    await user.click(screen.getByTestId("treasury-TUN").closest("button")!);
    const stock = await screen.findByRole("dialog");
    expect(within(stock).queryByRole("button", { name: /Carla$/ })).toBeNull();
    expect(within(stock).getAllByRole("button", { name: /Bruno$/ }).length).toBeGreaterThan(0);
  });
});

describe("Voice confirmation card in RotLA (US10, T088)", () => {
  class FakeRecognizer implements RecognizerLike {
    static current: FakeRecognizer | undefined;
    lang = "";
    interimResults = false;
    continuous = false;
    onresult: RecognizerLike["onresult"] = null;
    onerror: RecognizerLike["onerror"] = null;
    onend: RecognizerLike["onend"] = null;
    start() {
      FakeRecognizer.current = this;
    }
    stop() {
      queueMicrotask(() => this.onend?.());
    }
    abort() {
      this.onend?.();
    }
    say(text: string) {
      this.onresult?.({ results: { length: 1, 0: { length: 1, 0: { transcript: text } } } });
    }
  }
  const replyWith = (name: string, input: Record<string, unknown>): VoiceDeps => ({
    recognizer: () => new FakeRecognizer(),
    online: () => true,
    createInterpreter: () => () =>
      Promise.resolve({ provider: "anthropic", model: "claude-sonnet-5", calls: [{ name, input }], stop: "done", rawStop: "tool_use" }),
  });
  async function speak(user: ReturnType<typeof userEvent.setup>, text: string) {
    const mic = await screen.findByRole("button", { name: "Mantén pulsado para hablar" });
    await user.pointer({ keys: "[MouseLeft>]", target: mic });
    act(() => FakeRecognizer.current?.say(text));
    expect(await screen.findByText(text)).toBeTruthy();
    await user.pointer({ keys: "[/MouseLeft]", target: screen.getByRole("button", { name: "Suelta para enviar" }) });
  }
  const settings = { apiKeys: { anthropic: "sk-ant-test" }, rememberKey: true };

  it("launchCompany shows the bid, the price, the treasury and the chips handed over", async () => {
    const { user } = await openSeededTable({
      game: "rotla",
      players: three,
      settings,
      voiceDeps: replyWith("launchCompany", { player: "p1", company: "TUN", bid: 140, price: null }),
    });
    await speak(user, "Ana abre Tunneling por 140");
    const card = await screen.findByRole("dialog", { name: "Confirmar orden de voz" });
    expect(within(card).getByText("Ana abre Tunneling por $140 · precio $70 · tesorería $140 · 3 acciones en tesorería")).toBeTruthy();
    expect(within(card).getByText(/Ana entrega \$140/)).toBeTruthy();
  });

  it("mergeCompanies shows the merger preview with the chosen identity", async () => {
    const { user } = await openSeededTable({
      game: "rotla",
      players: three,
      settings,
      actions: [
        { type: "launchCompany", player: "p2", company: "TUN", bid: 140, price: null },
        { type: "launchCompany", player: "p1", company: "EXP", bid: 160, price: null },
        { type: "setTurn", round: "MR", srNumber: null, orSet: null, orIndex: null, orsInSet: null, company: null },
      ],
      voiceDeps: replyWith("mergeCompanies", { a: "EXP", b: "TUN", into: "UNI", identity: "alt" }),
    });
    await speak(user, "Express y Tunneling se fusionan en Unlimited");
    const card = await screen.findByRole("dialog", { name: "Confirmar orden de voz" });
    expect(within(card).getByText("Express + Tunneling → Unlimited · presidente Ana · precio $70 · tesorería $300 · 0 trenes")).toBeTruthy();
    expect(within(card).getByText(/Empate a 2: preside Ana/)).toBeTruthy();
  });
});

describe("Landmarks chips (US11)", () => {
  const launch = (company: string, player: string, bid: number) => ({ type: "launchCompany", player, company, bid, price: null });
  const buy2 = { type: "buyTrain", company: "EXP", trainType: "2", variant: null, from: "bank", seller: null, price: null, tradeIn: null };
  const setup = (options: Record<string, string>) =>
    openSeededTable({ game: "rotla", players: three, options, actions: [launch("EXP", "p1", 160), buy2, { type: "startOR" }] });
  async function operateEXP(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByTestId("treasury-EXP").closest("button")!);
    return screen.findByRole("dialog");
  }

  it("are shown only with the expansion", async () => {
    const { user } = await setup({});
    const dialog = await operateEXP(user);
    expect(within(dialog).queryByRole("button", { name: /Formación rocosa/ })).toBeNull();
  });

  it("Formación rocosa is one tap; then it reads Ya usada, and a long press still repeats it with a warning", async () => {
    const { user } = await setup({ expansion: "landmarks" });
    const dialog = await operateEXP(user);
    expect(within(dialog).getByRole("button", { name: /^Acantilado/ })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /^Cañón/ })).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Formación rocosa (+2)" }));
    expect(await screen.findByText(/EXP: formación rocosa \(\+2\)/, { selector: ".toast-summary" })).toBeTruthy();
    const again = await screen.findByRole("dialog");
    const used = within(again).getByRole("button", { name: /Formación rocosa \(\+2\) · Ya usada/ });
    expect(used.getAttribute("aria-disabled")).toBe("true");
    await user.click(used);
    expect(screen.getAllByText(/formación rocosa/, { selector: ".toast-summary" })).toHaveLength(1);
    await user.pointer({ keys: "[MouseRight]", target: used });
    expect(await screen.findByText(/ya usó la formación rocosa/)).toBeTruthy();
  });

  it("Acantilado picks a train and sells it to the bank for half", async () => {
    const { user } = await setup({ expansion: "landmarks" });
    const dialog = await operateEXP(user);
    await user.click(within(dialog).getByRole("button", { name: /^Acantilado/ }));
    const pick = await screen.findByRole("dialog");
    await user.click(within(pick).getByRole("button", { name: "Vender el 2" }));
    expect(await screen.findByText("EXP vende el 2 en el acantilado: +$50", { selector: ".toast-summary" })).toBeTruthy();
  });
});
