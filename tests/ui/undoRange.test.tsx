import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Action } from "../../src/domain/actions/schemas";
import { getBuiltInGame } from "../../src/domain/games";
import type { LogEntry } from "../../src/domain/ledger/entries";
import { undoRangeOf } from "../../src/domain/ledger/undo";
import { UndoRangeSheet } from "../../src/ui/components/UndoRangeSheet";
import { makePlayers } from "../helpers/dispatch";

/** contracts/history-ui.md, UndoRangeSheet (feature 010, US2). */

const game = getBuiltInGame("1830");
const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
const ctx = { game, players };

const pay = (seq: number, amount: number): LogEntry => ({
  kind: "group",
  seq,
  id: `g${seq}`,
  at: "2026-10-12T20:00:00.000Z",
  source: "touch",
  action: { type: "transferMoney", from: "player:p1", to: "bank", amount } as Action,
  events: [{ t: "moneyTransfer", from: "player:p1", to: "bank", amount }],
  touches: [],
  warnings: [],
});

const range = undoRangeOf([pay(1, 10), pay(2, 20), pay(3, 30)], "g1")!;

function open(transcript?: string) {
  const onConfirm = vi.fn(() => Promise.resolve());
  const onClose = vi.fn();
  render(
    <UndoRangeSheet range={range} ctx={ctx} onConfirm={onConfirm} onClose={onClose} {...(transcript ? { transcript } : {})} />,
  );
  return { onConfirm, onClose, sheet: screen.getByRole("dialog", { name: "¿Deshacer 3 entradas?" }) };
}

describe("UndoRangeSheet", () => {
  it("names the count, the oldest and the newest entry, with the note", () => {
    const { sheet } = open();
    expect(within(sheet).getByText("Desde: Ana paga $10 al banco")).toBeTruthy();
    expect(within(sheet).getByText("Hasta: Ana paga $30 al banco")).toBeTruthy();
    expect(within(sheet).getByText("Quedan en el historial marcadas como deshechas. Después volvé a anotar lo que corresponda.")).toBeTruthy();
  });

  it("Cancelar closes without undoing", async () => {
    const { sheet, onConfirm, onClose } = open();
    await userEvent.setup().click(within(sheet).getByRole("button", { name: "Cancelar" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("Deshacer N confirms, then closes", async () => {
    const { sheet, onConfirm, onClose } = open();
    await userEvent.setup().click(within(sheet).getByRole("button", { name: "Deshacer 3" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the transcript from voice above the title", () => {
    const { sheet } = open("deshacé hasta el pago de Ana");
    expect(within(sheet).getByText("«deshacé hasta el pago de Ana»")).toBeTruthy();
  });
});
