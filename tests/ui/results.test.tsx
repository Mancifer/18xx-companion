import { act, screen, waitFor, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { VoiceDeps } from "../../src/app/useVoice";
import { openCompanionDb } from "../../src/persistence/db";
import { SessionRepo } from "../../src/persistence/sessionRepo";
import type { ModelReply } from "../../src/voice/reply";
import type { RecognizerLike } from "../../src/voice/speech";
import { openMenuItem, openSeededTable } from "./helpers";

/** The results screen and "Terminar partida" (feature 007, contracts/ui.md §1–§2). */

type User = ReturnType<typeof userEvent.setup>;

/** Every 1830 player starts at $600; the bank holds $9,600 with four players. */
const BREAK_BANK = { type: "transferMoney", from: "bank", to: "player:p1", amount: 9600 };

async function confirmEnd(user: User) {
  const sheet = await screen.findByRole("dialog", { name: "¿Terminar la partida?" });
  await user.click(within(sheet).getByRole("button", { name: "Terminar" }));
  return screen.findByRole("heading", { name: "Resultados" });
}

/** Menú → Terminar partida → Terminar (3 taps). */
async function endFromMenu(user: User) {
  await openMenuItem(user, "Terminar partida");
  return confirmEnd(user);
}

function rows(): HTMLElement[] {
  return within(screen.getByRole("table")).getAllByRole("row").slice(1);
}
const cells = (row: HTMLElement) => within(row).getAllByRole("cell").map((c) => c.textContent);

async function backToTable(user: User) {
  await user.click(screen.getByRole("button", { name: "Volver" }));
  await screen.findByRole("button", { name: "Menú" });
}

async function declarePlayerBankrupt(user: User, playerId: string, name: string) {
  await user.click(screen.getByRole("tab", { name: "Jugadores" }));
  await user.click(screen.getByTestId(`cash-${playerId}`).closest("button")!);
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Declarar quiebra" }));
  const confirm = await screen.findByRole("dialog", { name: `Quiebra de ${name}` });
  await user.click(within(confirm).getByRole("button", { name: "Declarar quiebra" }));
  await user.click(await screen.findByRole("button", { name: "Seguir jugando" }));
}

describe("Terminar partida (US1, FR-002, FR-006)", () => {
  it("Menú → Terminar partida with no condition fired says so; Terminar opens the results (3 taps)", async () => {
    const { user } = await openSeededTable();
    await openMenuItem(user, "Terminar partida");
    const sheet = await screen.findByRole("dialog", { name: "¿Terminar la partida?" });
    expect(within(sheet).getByText("Todavía no se cumplió ninguna condición de fin de partida.")).toBeTruthy();
    await user.click(within(sheet).getByRole("button", { name: "Terminar" }));
    expect(await screen.findByRole("heading", { name: "Resultados" })).toBeTruthy();
    expect(screen.getByText(/^1830 · terminó .* · sin condición de fin$/)).toBeTruthy();
  });

  it("with an end condition fired, the banner's primary Terminar partida → Terminar is 2 taps (SC-003)", async () => {
    const { user } = await openSeededTable({ actions: [BREAK_BANK] });
    const banner = screen.getByRole("alert");
    const button = within(banner).getByRole("button", { name: "Terminar partida" });
    expect(button.className).toContain("primary");
    await user.click(button);
    const sheet = await screen.findByRole("dialog", { name: "¿Terminar la partida?" });
    expect(within(sheet).getByText("Banca quebrada: se termina el set de rondas de operaciones.")).toBeTruthy();
    await user.click(within(sheet).getByRole("button", { name: "Terminar" }));
    expect(await screen.findByRole("heading", { name: "Resultados" })).toBeTruthy();
    expect(screen.getByText(/^1830 · terminó .* · banca quebrada$/)).toBeTruthy();
  });

  it("the UndoToast on the results undoes the end in one tap, and the game is open again (FR-004)", async () => {
    const { user } = await openSeededTable();
    await endFromMenu(user);
    await user.click(within(screen.getByRole("status")).getByRole("button", { name: "Deshacer" }));
    expect(await screen.findByRole("heading", { name: "Clasificación provisional" })).toBeTruthy();
    await backToTable(user);
    expect(screen.queryByRole("button", { name: /Partida completa/ })).toBeNull();
  });
});

describe("the results table (US1, FR-007–FR-009, FR-013)", () => {
  it("columns Puesto, Jugador, Dinero, Acciones, Total; a four-way tie is =1 for everyone, all winners", async () => {
    const { user } = await openSeededTable();
    await endFromMenu(user);
    const headers = within(screen.getByRole("table")).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Puesto", "Jugador", "Dinero", "Acciones", "Total"]);
    expect(rows().map((r) => cells(r)[0])).toEqual(["=1", "=1", "=1", "=1"]);
    for (const row of rows()) expect(within(row).getByText("🏆 Ganador")).toBeTruthy();
  });

  it("the rank-1 row carries the 🏆 Ganador text badge; the rest share =2", async () => {
    const { user } = await openSeededTable({ actions: [{ type: "transferMoney", from: "bank", to: "player:p1", amount: 100 }] });
    await endFromMenu(user);
    const [first, ...others] = rows();
    expect(cells(first!)[0]).toBe("1");
    expect(first!.textContent).toContain("Ana");
    expect(within(first!).getByText("🏆 Ganador")).toBeTruthy();
    expect(cells(first!).slice(2)).toEqual(["$700", "$0", "$700"]);
    for (const row of others) {
      expect(cells(row)[0]).toBe("=2");
      expect(within(row).queryByText(/Ganador/)).toBeNull();
    }
  });

  it("Menú → Clasificación before the end shows the provisional ranking (FR-014); Volver goes back to the Table", async () => {
    const { user } = await openSeededTable();
    await openMenuItem(user, "Clasificación");
    expect(await screen.findByRole("heading", { name: "Clasificación provisional" })).toBeTruthy();
    expect(screen.getByText("La partida no terminó todavía.")).toBeTruthy();
    expect(rows()).toHaveLength(4);
    await backToTable(user);
  });
});

describe("a finished game on the Table (FR-012)", () => {
  it("shows Partida completa · Ver resultados, does not reopen the results by itself, and counts later entries", async () => {
    const { user } = await openSeededTable();
    await endFromMenu(user);
    await backToTable(user);
    expect(screen.queryByRole("heading", { name: "Resultados" })).toBeNull();
    const banner = screen.getByRole("button", { name: "Partida completa · Ver resultados" });

    await user.click(screen.getByRole("button", { name: "Menú" }));
    const menu = await screen.findByRole("dialog", { name: "Menú" });
    expect(within(menu).queryByRole("button", { name: "Terminar partida" })).toBeNull();
    expect(within(menu).getByRole("button", { name: "Clasificación" })).toBeTruthy();
    expect(within(menu).getByRole("button", { name: "Resultados" })).toBeTruthy();
    await user.click(within(menu).getByRole("button", { name: "Cerrar" }));

    // A bankruptcy after the end moves Ana's cash to the bank (1830 base), but not in the results.
    await declarePlayerBankrupt(user, "p1", "Ana");
    await user.click(banner);
    expect(await screen.findByText("Hay 1 entrada posterior al final que no cuenta en esta clasificación.")).toBeTruthy();
    const ana = rows().find((r) => r.textContent.includes("Ana"))!;
    expect(cells(ana).slice(2)).toEqual(["$600", "$0", "$600"]);
    expect(within(ana).queryByText(/Quiebra|Eliminado/)).toBeNull();

    await backToTable(user);
    await declarePlayerBankrupt(user, "p2", "Bruno");
    await user.click(screen.getByRole("button", { name: "Partida completa · Ver resultados" }));
    expect(await screen.findByText("Hay 2 entradas posteriores al final que no cuentan en esta clasificación.")).toBeTruthy();
    expect(rows().map((r) => cells(r)[4])).toEqual(["$600", "$600", "$600", "$600"]);
  });
});

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

const endGameReply: ModelReply = { provider: "anthropic", model: "test", calls: [{ name: "endGame", input: {} }], stop: "done", rawStop: "tool_use" };
const voiceDeps: VoiceDeps = {
  recognizer: () => new FakeRecognizer(),
  online: () => true,
  createInterpreter: () => () => Promise.resolve(endGameReply),
};

describe("voice endGame (FR-002)", () => {
  it("on a game already finished, a confirmed voice endGame moves the end and opens the results again", async () => {
    const { user } = await openSeededTable({ voiceDeps, settings: { apiKeys: { anthropic: "sk-ant-test" }, rememberKey: true } });
    await endFromMenu(user);
    await backToTable(user);
    const mic = await screen.findByRole("button", { name: "Mantén pulsado para hablar" });
    await user.pointer({ keys: "[MouseLeft>]", target: mic });
    act(() => FakeRecognizer.current?.say("terminamos la partida"));
    await user.pointer({ keys: "[/MouseLeft]", target: screen.getByRole("button", { name: "Suelta para enviar" }) });
    const card = await screen.findByRole("dialog", { name: "Confirmar orden de voz" });
    expect(card.textContent).toContain("Terminar la partida");
    await user.click(within(card).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Resultados" })).toBeTruthy());
  });
});

describe("bankrupt players on the results (US2, FR-010, FR-013)", () => {
  /** Player sheet → Declarar quiebra → confirm → next step Terminar partida → Terminar. */
  async function bankruptThenEnd(user: User, playerId: string, name: string) {
    await user.click(screen.getByRole("tab", { name: "Jugadores" }));
    await user.click(screen.getByTestId(`cash-${playerId}`).closest("button")!);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Declarar quiebra" }));
    const confirm = await screen.findByRole("dialog", { name: `Quiebra de ${name}` });
    await user.click(within(confirm).getByRole("button", { name: "Declarar quiebra" }));
    await user.click(await within(confirm).findByRole("button", { name: "Terminar partida" }));
    await confirmEnd(user);
  }

  it("21Moon: an eliminated player is last, with — for Puesto and Eliminado as the total (text)", async () => {
    const { user } = await openSeededTable({ game: "21moon" });
    await bankruptThenEnd(user, "p2", "Bruno");
    const last = rows().at(-1)!;
    expect(cells(last)[0]).toBe("—");
    expect(cells(last)[1]).toBe("Bruno");
    expect(cells(last)[4]).toBe("Eliminado");
  });

  it("1830 Classic: a bankrupt player keeps their holdings, is ranked, and shows the Quiebra text badge", async () => {
    const { user } = await openSeededTable({ options: { ruleset: "classic" } });
    await bankruptThenEnd(user, "p1", "Ana");
    const ana = rows().find((r) => r.textContent.includes("Ana"))!;
    expect(within(ana).getByText("Quiebra")).toBeTruthy();
    expect(cells(ana)[0]).not.toBe("—");
    expect(cells(ana)[4]).toBe("$600");
  });
});

describe("Reabrir partida (US4, FR-005a, contracts/ui.md §1)", () => {
  const BODY = "La partida deja de estar completa y se pueden registrar o corregir entradas. El final queda en el historial.";
  const askReopen = async (user: User) => {
    await user.click(screen.getByRole("button", { name: "Reabrir partida" }));
    const sheet = await screen.findByRole("dialog", { name: "¿Reabrir la partida?" });
    expect(within(sheet).getByText(BODY)).toBeTruthy();
    return sheet;
  };

  it("is offered only on a finished game", async () => {
    const { user } = await openSeededTable();
    await openMenuItem(user, "Clasificación");
    await screen.findByRole("heading", { name: "Clasificación provisional" });
    expect(screen.queryByRole("button", { name: "Reabrir partida" })).toBeNull();
    await backToTable(user);
    await endFromMenu(user);
    expect(screen.getByRole("button", { name: "Reabrir partida" })).toBeTruthy();
  });

  it("Cancelar, ✕ and the backdrop leave the game finished with the same results (US4-5)", async () => {
    const { user } = await openSeededTable({ actions: [{ type: "transferMoney", from: "bank", to: "player:p2", amount: 50 }] });
    await endFromMenu(user);
    const before = rows().map(cells);
    await user.click(within(await askReopen(user)).getByRole("button", { name: "Cancelar" }));
    await user.click(within(await askReopen(user)).getByRole("button", { name: "Cerrar" }));
    const sheet = await askReopen(user);
    await user.click(sheet.parentElement!);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "¿Reabrir la partida?" })).toBeNull());
    expect(screen.getByRole("heading", { name: "Resultados" })).toBeTruthy();
    expect(rows().map(cells)).toEqual(before);
  });

  it("Reabrir partida → Reabrir (2 taps, SC-006) reopens the game and goes to the Table", async () => {
    const { user } = await openSeededTable();
    await endFromMenu(user);
    await user.click(screen.getByRole("button", { name: "Reabrir partida" }));
    await user.click(within(await screen.findByRole("dialog", { name: "¿Reabrir la partida?" })).getByRole("button", { name: "Reabrir" }));
    expect(await screen.findByRole("button", { name: "Menú" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Partida completa · Ver resultados" })).toBeNull();
    await openMenuItem(user, "Clasificación");
    expect(await screen.findByRole("heading", { name: "Clasificación provisional" })).toBeTruthy();
  });

  it("a store failure shows its message and stays on the results", async () => {
    const { user, dbName, meta } = await openSeededTable();
    await endFromMenu(user);
    const other = await openCompanionDb(dbName);
    await new SessionRepo(other).deleteSession(meta.id);
    other.close();
    await user.click(within(await askReopen(user)).getByRole("button", { name: "Reabrir" }));
    expect(await screen.findByText("No se pudo guardar. Inténtalo de nuevo.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Resultados" })).toBeTruthy();
  });

  it("reopening from results opened from Home also works, and Home then drops the Completa marker", async () => {
    const { user } = await openSeededTable();
    await endFromMenu(user);
    await backToTable(user);
    await openMenuItem(user, "Salir al inicio");
    await screen.findByRole("heading", { name: "Partidas" });
    const row = screen.getAllByRole("listitem").find((li) => li.textContent.includes("Completa"))!;
    await user.click(within(row).getAllByRole("button")[0]!);
    await screen.findByRole("heading", { name: "Resultados" });
    await user.click(within(await askReopen(user)).getByRole("button", { name: "Reabrir" }));
    await screen.findByRole("button", { name: "Menú" });
    await openMenuItem(user, "Salir al inicio");
    await screen.findByRole("heading", { name: "Partidas" });
    expect(screen.queryByText("Completa")).toBeNull();
  });
});
