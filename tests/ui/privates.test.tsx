import type Anthropic from "@anthropic-ai/sdk";
import { act, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { VoiceDeps } from "../../src/app/useVoice";
import { getBuiltInGame } from "../../src/domain/games";
import type { RecognizerLike } from "../../src/voice/speech";
import { openSeededTable } from "./helpers";

/** US4 (T031): "Comprar privada" appears only when a private can be bought (FR-014, FR-015, SC-005). */

const buyAll = (game: string) =>
  getBuiltInGame(game).privates.map((p, i) => ({
    type: "buyPrivate",
    buyer: `p${(i % 3) + 1}`,
    private: p.id,
    price: p.cost,
    par: p.grants?.some((g) => g.par === "ownerChooses") ? 100 : null,
  }));
const control = () => screen.queryByRole("button", { name: "Comprar privada" });
const PLAYERS = ["Ana", "Bruno", "Carla"];

describe.each(["1830", "1848", "21moon"])("%s: the Comprar privada control", (game) => {
  it("is shown in the private round while privates are unsold", async () => {
    await openSeededTable({ game, players: PLAYERS });
    expect(control()).toBeTruthy();
  });

  it("is hidden in SR 1 once every private is sold", async () => {
    await openSeededTable({ game, players: PLAYERS, actions: [...buyAll(game), { type: "startSR" }] });
    expect(control()).toBeNull();
  });

  it("in SR 2 is shown only where players trade privates", async () => {
    await openSeededTable({ game, players: PLAYERS, actions: [...buyAll(game), { type: "startSR" }, { type: "startSR" }] });
    expect(control() !== null).toBe(game === "1830");
  });

  it("is hidden in an OR", async () => {
    await openSeededTable({ game, players: PLAYERS, actions: [{ type: "startOR" }] });
    expect(control()).toBeNull();
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

const voiceDeps: VoiceDeps = {
  recognizer: () => new FakeRecognizer(),
  online: () => true,
  createInterpreter: () => () =>
    Promise.resolve(JSON.parse(readFileSync("tests/voice/recorded/buy-private.json", "utf8")) as Anthropic.Message),
};

describe("the private sheet with nothing to buy (FR-015)", () => {
  it("«Hacerlo a mano» after a refused private purchase explains instead of showing an empty list", async () => {
    const { user } = await openSeededTable({
      game: "1830",
      players: PLAYERS,
      actions: [...buyAll("1830"), { type: "startSR" }],
      settings: { apiKey: "sk-ant-test", rememberKey: true },
      voiceDeps,
    });
    const mic = await screen.findByRole("button", { name: "Mantén pulsado para hablar" });
    await user.pointer({ keys: "[MouseLeft>]", target: mic });
    act(() => FakeRecognizer.current?.say("Bruno compra la Schuylkill"));
    await screen.findByText("Bruno compra la Schuylkill");
    await user.pointer({ keys: "[/MouseLeft]", target: screen.getByRole("button", { name: "Suelta para enviar" }) });
    const card = await screen.findByRole("dialog", { name: "No entendí" });
    await user.click(within(card).getByRole("button", { name: "Hacerlo a mano" }));
    const sheet = await screen.findByRole("dialog", { name: /Comprar privada/ });
    expect(within(sheet).getByText("No hay privadas a la venta ahora.")).toBeTruthy();
  });
});
