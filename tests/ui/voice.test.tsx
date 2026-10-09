import type Anthropic from "@anthropic-ai/sdk";
import { act, screen, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { VoiceDeps } from "../../src/app/useVoice";
import type { RecognizerLike } from "../../src/voice/speech";
import { cashText, openSeededTable } from "./helpers";

/** US5 by touch and voice, with a fake recognizer and recorded model responses (no network). */

type User = ReturnType<typeof userEvent.setup>;
const recorded = (name: string): Anthropic.Message =>
  // Relative to the repo root: under jsdom, import.meta.url is not a file URL.
  JSON.parse(readFileSync(`tests/voice/recorded/${name}.json`, "utf8")) as Anthropic.Message;

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

function deps(responses: Record<string, string>, calls: string[] = [], online = true): VoiceDeps {
  return {
    recognizer: () => new FakeRecognizer(),
    online: () => online,
    createInterpreter: () => (_session, message) => {
      calls.push(message);
      const transcript = /Transcripción: «(.*)»/.exec(message)?.[1] ?? "";
      return Promise.resolve(recorded(responses[transcript] ?? "not-understood"));
    },
  };
}

const KEY = { apiKey: "sk-ant-test", rememberKey: true };
// PRR operating, Ana with 60% (she paid $600 for it).
const OR_SETUP = [
  { type: "startSR" },
  { type: "parCompany", player: "p1", company: "PRR", price: 100 },
  { type: "buyShare", buyer: "player:p1", company: "PRR", source: "ipo", count: 4 },
  { type: "endSR" },
  { type: "startOR" },
];

async function speak(user: User, text: string) {
  const mic = await screen.findByRole("button", { name: "Mantén pulsado para hablar" });
  await user.pointer({ keys: "[MouseLeft>]", target: mic });
  act(() => FakeRecognizer.current?.say(text));
  expect(await screen.findByText(text)).toBeTruthy();
  await user.pointer({ keys: "[/MouseLeft]", target: screen.getByRole("button", { name: "Suelta para enviar" }) });
}

describe("voice (US5)", () => {
  it("US5-5: the mic says why it is unavailable — no key, offline, no speech recognition", async () => {
    await openSeededTable({ voiceDeps: deps({}) });
    expect(await screen.findByText("Añade tu clave de API en Ajustes")).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Mantén pulsado para hablar" }).disabled).toBe(true);
  });

  it("offline", async () => {
    await openSeededTable({ voiceDeps: deps({}, [], false), settings: KEY });
    expect(await screen.findByText("Sin conexión: la voz no está disponible")).toBeTruthy();
  });

  it("without SpeechRecognition (the default recognizer in this test browser)", async () => {
    await openSeededTable({ settings: KEY });
    expect(await screen.findByText("Este navegador no reconoce la voz")).toBeTruthy();
  });

  it("US5-1: live transcript while held; nothing changes until Confirmar", async () => {
    const { user } = await openSeededTable({ actions: OR_SETUP, settings: KEY, voiceDeps: deps({ "240, paga": "payout" }) });
    expect(cashText("p1")).toBe("$0");
    await speak(user, "240, paga");

    const card = await screen.findByRole("dialog", { name: "Confirmar orden de voz" });
    expect(within(card).getByText(/PRR paga \$240/)).toBeTruthy();
    expect(cashText("p1")).toBe("$0");

    await user.click(within(card).getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText(/PRR paga \$240/, { selector: ".toast-summary" })).toBeTruthy();
    expect(cashText("p1")).toBe("$144");
  });

  it("a field can be edited on the card", async () => {
    const { user } = await openSeededTable({ actions: OR_SETUP, settings: KEY, voiceDeps: deps({ "240, paga": "payout" }) });
    await speak(user, "240, paga");
    const card = await screen.findByRole("dialog", { name: "Confirmar orden de voz" });
    await user.click(within(card).getByRole("button", { name: "Editar" }));
    await user.click(within(screen.getByRole("dialog", { name: "Editar orden de voz" })).getByRole("button", { name: /Ingresos/ }));
    const keypad = screen.getByRole("dialog", { name: "Ingresos" });
    for (const d of "260") await user.click(within(keypad).getByRole("button", { name: new RegExp(`^${d}$`) }));
    await user.click(within(keypad).getByRole("button", { name: "Listo" }));
    await user.click(within(screen.getByRole("dialog", { name: "Editar orden de voz" })).getByRole("button", { name: "Listo" }));
    expect(within(screen.getByRole("dialog", { name: "Confirmar orden de voz" })).getByText(/PRR paga \$260/)).toBeTruthy();
  });

  it("Cancelar drops the proposal", async () => {
    const { user } = await openSeededTable({ actions: OR_SETUP, settings: KEY, voiceDeps: deps({ "240, paga": "payout" }) });
    await speak(user, "240, paga");
    await user.click(within(await screen.findByRole("dialog", { name: "Confirmar orden de voz" })).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog", { name: "Confirmar orden de voz" })).toBeNull();
    expect(cashText("p1")).toBe("$0");
  });

  it("FR-062: saying «sí» confirms the card on screen without another model call", async () => {
    const calls: string[] = [];
    const { user } = await openSeededTable({ actions: OR_SETUP, settings: KEY, voiceDeps: deps({ "240, paga": "payout" }, calls) });
    await speak(user, "240, paga");
    await screen.findByRole("dialog", { name: "Confirmar orden de voz" });
    await speak(user, "sí");
    expect(await screen.findByText(/PRR paga \$240/, { selector: ".toast-summary" })).toBeTruthy();
    expect(calls).toHaveLength(1);
    expect(cashText("p1")).toBe("$144");
  });

  it("US5-6: «No entendí» shows the transcript, and «Hacerlo a mano» opens the matching sheet", async () => {
    const { user } = await openSeededTable({ actions: OR_SETUP, settings: KEY, voiceDeps: deps({ "doscientos y pico": "bad-input" }) });
    await speak(user, "doscientos y pico");
    const card = await screen.findByRole("dialog", { name: "No entendí" });
    expect(within(card).getByText("«doscientos y pico»")).toBeTruthy();
    await user.click(within(card).getByRole("button", { name: "Hacerlo a mano" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("button", { name: "Pagar" })).toBeTruthy();
  });

  it("US5-4: a question is answered from state", async () => {
    const { user } = await openSeededTable({ actions: OR_SETUP, settings: KEY, voiceDeps: deps({ "¿cuánto tiene Ana?": "query" }) });
    await speak(user, "¿cuánto tiene Ana?");
    const card = await screen.findByRole("dialog", { name: "Respuesta" });
    expect(within(card).getByText("Ana tiene $0")).toBeTruthy();
  });
});
