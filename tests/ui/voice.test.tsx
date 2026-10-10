import type Anthropic from "@anthropic-ai/sdk";
import { act, screen, waitFor, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SETTINGS_CHANGED, type VoiceDeps } from "../../src/app/useVoice";
import { openCompanionDb } from "../../src/persistence/db";
import { SettingsRepo } from "../../src/persistence/settingsRepo";
import { VoiceProviderError } from "../../src/voice/errors";
import { PROVIDERS, type ProviderId } from "../../src/voice/providers";
import { geminiReply } from "../../src/voice/providers/gemini";
import { anthropicReply } from "../../src/voice/providers/anthropic";
import type { ModelReply } from "../../src/voice/reply";
import type { RecognizerLike } from "../../src/voice/speech";
import { cashText, openSeededTable } from "./helpers";

/** US5 by touch and voice, with a fake recognizer and recorded model responses (no network). */

type User = ReturnType<typeof userEvent.setup>;
const recorded = (name: string): ModelReply =>
  // Relative to the repo root: under jsdom, import.meta.url is not a file URL.
  anthropicReply(JSON.parse(readFileSync(`tests/voice/recorded/${name}.json`, "utf8")) as Anthropic.Message, "claude-sonnet-5");

const gemini = (name: string): ModelReply =>
  geminiReply(JSON.parse(readFileSync(`tests/voice/recorded/gemini/${name}.json`, "utf8")), "gemini-3.8-flash");

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

const KEY = { apiKeys: { anthropic: "sk-ant-test" }, rememberKey: true };
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
    expect(await screen.findByText("Añade tu clave de Anthropic en Ajustes")).toBeTruthy();
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

describe("voice «siguiente compañía» with no run recorded (T016, FR-009)", () => {
  const TWO_IN_OR = [
    { type: "startSR" },
    { type: "parCompany", player: "p1", company: "PRR", price: 100 },
    { type: "buyShare", buyer: "player:p1", company: "PRR", source: "ipo", count: 4 },
    { type: "parCompany", player: "p2", company: "NYC", price: 90 },
    { type: "buyShare", buyer: "player:p2", company: "NYC", source: "ipo", count: 4 },
    { type: "endSR" },
    { type: "startOR" },
  ];

  it("the card shows the no-run warning and the price move; nothing changes until Confirmar", async () => {
    const { user } = await openSeededTable({
      actions: TWO_IN_OR,
      settings: KEY,
      voiceDeps: deps({ "siguiente compañía": "next-company" }),
    });
    await speak(user, "siguiente compañía");
    const card = await screen.findByRole("dialog", { name: "Confirmar orden de voz" });
    expect(within(card).getByText(/No se registró la operación de PRR: cuenta como que no corrió y su acción baja./)).toBeTruthy();
    expect(within(card).getByText(/PRR no corrió · PRR → \$90/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Operar PRR" })).toBeTruthy();

    await user.click(within(card).getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("button", { name: "Operar NYC" })).toBeTruthy();
  });
});

describe("voice with a provider choice (005)", () => {
  interface Created {
    readonly provider: ProviderId;
    readonly apiKey: string;
    readonly model: string;
  }

  /** Records every interpreter built; each answers from `answer(provider)`. */
  function providerDeps(created: Created[], answer: (c: Created, transcript: string) => Promise<ModelReply>): VoiceDeps {
    return {
      recognizer: () => new FakeRecognizer(),
      online: () => true,
      createInterpreter: (provider, apiKey, model) => {
        const c = { provider, apiKey, model };
        created.push(c);
        return (_session, message) => answer(c, /Transcripción: «(.*)»/.exec(message)?.[1] ?? "");
      },
    };
  }

  async function changeSettings(dbName: string, write: (repo: SettingsRepo) => Promise<unknown>) {
    const db = await openCompanionDb(dbName);
    await write(new SettingsRepo(db));
    db.close();
    act(() => {
      window.dispatchEvent(new Event(SETTINGS_CHANGED));
    });
  }

  it("Gemini selected with only a Claude key: unavailable, and no provider is called", async () => {
    const created: Created[] = [];
    await openSeededTable({
      actions: OR_SETUP,
      settings: { provider: "gemini", apiKeys: { anthropic: "sk-ant-test" } },
      voiceDeps: providerDeps(created, () => Promise.resolve(recorded("payout"))),
    });
    expect(await screen.findByText("Añade tu clave de Gemini en Ajustes")).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Mantén pulsado para hablar" }).disabled).toBe(true);
    expect(created).toEqual([]);
  });

  it("Gemini selected with a key: its own interpreter and model, the same card as Claude", async () => {
    const created: Created[] = [];
    const { user } = await openSeededTable({
      actions: OR_SETUP,
      settings: { provider: "gemini", apiKeys: { anthropic: "sk-ant-test", gemini: "AIza-test" } },
      voiceDeps: providerDeps(created, () => Promise.resolve(gemini("payout"))),
    });
    await speak(user, "240, paga");
    const card = await screen.findByRole("dialog", { name: "Confirmar orden de voz" });
    expect(within(card).getByText(/PRR paga \$240/)).toBeTruthy();
    expect(created.at(-1)).toEqual({ provider: "gemini", apiKey: "AIza-test", model: PROVIDERS.gemini.defaultModel });
    expect(cashText("p1")).toBe("$0");
  });

  it("an unavailable model ends in «No entendí» with the touch fallback", async () => {
    const created: Created[] = [];
    const { user } = await openSeededTable({
      actions: OR_SETUP,
      settings: { provider: "gemini", apiKeys: { gemini: "AIza-test" }, models: { gemini: "gemini-nope" } },
      voiceDeps: providerDeps(created, () => Promise.reject(new VoiceProviderError("model", "Gemini HTTP 404 NOT_FOUND"))),
    });
    await speak(user, "240, paga");
    const card = await screen.findByRole("dialog", { name: "No entendí" });
    expect(within(card).getByText("Este modelo no está disponible para esta clave.")).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Hacerlo a mano" })).toBeTruthy();
  });

  it("US3-1: switching the provider makes the next command use its interpreter and model", async () => {
    const created: Created[] = [];
    const { user, dbName } = await openSeededTable({
      actions: OR_SETUP,
      settings: { apiKeys: { anthropic: "sk-ant-test", gemini: "AIza-test" }, models: { gemini: "gemini-3.6-flash" } },
      voiceDeps: providerDeps(created, (c) => Promise.resolve(c.provider === "gemini" ? gemini("payout") : recorded("payout"))),
    });
    await speak(user, "240, paga");
    await screen.findByRole("dialog", { name: "Confirmar orden de voz" });
    expect(created.at(-1)?.provider).toBe("anthropic");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await changeSettings(dbName, (repo) => repo.set({ provider: "gemini" }));
    await waitFor(() => expect(created.at(-1)?.provider).toBe("gemini"));
    await speak(user, "240, paga");
    await screen.findByRole("dialog", { name: "Confirmar orden de voz" });
    expect(created.at(-1)).toEqual({ provider: "gemini", apiKey: "AIza-test", model: "gemini-3.6-flash" });
  });

  it("a command started before a switch resolves with the interpreter it started with", async () => {
    const created: Created[] = [];
    let release: (reply: ModelReply) => void = () => undefined;
    const used: ProviderId[] = [];
    const { user, dbName } = await openSeededTable({
      actions: OR_SETUP,
      settings: { apiKeys: { anthropic: "sk-ant-test", gemini: "AIza-test" } },
      voiceDeps: providerDeps(created, (c) => {
        used.push(c.provider);
        return new Promise<ModelReply>((resolve) => {
          release = resolve;
        });
      }),
    });
    await speak(user, "240, paga");
    await waitFor(() => expect(used).toEqual(["anthropic"]));

    await changeSettings(dbName, (repo) => repo.set({ provider: "gemini" }));
    await waitFor(() => expect(created.at(-1)?.provider).toBe("gemini"));
    act(() => release(recorded("payout")));
    const card = await screen.findByRole("dialog", { name: "Confirmar orden de voz" });
    expect(within(card).getByText(/PRR paga \$240/)).toBeTruthy();
    expect(used).toEqual(["anthropic"]);
  });

  it("US3-2: an upgraded user with only legacy Claude rows keeps getting Claude", async () => {
    const created: Created[] = [];
    const { user, dbName } = await openSeededTable({
      actions: OR_SETUP,
      voiceDeps: providerDeps(created, () => Promise.resolve(recorded("payout"))),
    });
    expect(await screen.findByText("Añade tu clave de Anthropic en Ajustes")).toBeTruthy();
    const db = await openCompanionDb(dbName);
    const tx = db.transaction("settings", "readwrite");
    await tx.store.put({ key: "apiKey", value: "sk-ant-legacy" });
    await tx.store.put({ key: "model", value: "claude-haiku-4-5" });
    await tx.done;
    db.close();
    act(() => {
      window.dispatchEvent(new Event(SETTINGS_CHANGED));
    });
    await speak(user, "240, paga");
    await screen.findByRole("dialog", { name: "Confirmar orden de voz" });
    expect(created.at(-1)).toEqual({ provider: "anthropic", apiKey: "sk-ant-legacy", model: "claude-haiku-4-5" });
  });
});
