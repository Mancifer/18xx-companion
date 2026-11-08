import type Anthropic from "@anthropic-ai/sdk";
import { act, screen, waitFor, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_CHANGED, type VoiceDeps } from "../../src/app/useVoice";
import { openCompanionDb } from "../../src/persistence/db";
import { SettingsRepo } from "../../src/persistence/settingsRepo";
import { anthropicReply } from "../../src/voice/providers/anthropic";
import type { ModelReply } from "../../src/voice/reply";
import { browserRecognizer, type RecognizerLike } from "../../src/voice/speech";
import { TranscriptionError } from "../../src/voice/transcription/errors";
import type { TranscribeOptions, Transcriber, TranscriptionResult } from "../../src/voice/transcription/groq";
import { fakeMediaDeps, type FakeMedia, type FakeMediaOptions } from "../helpers/fakeMedia";
import { setNavigatorLanguages } from "../helpers/session";
import { cashText, openMenuItem, openSeededTable } from "./helpers";

/**
 * Feature 015 T021 (US1, FR-003–FR-013, FR-017, FR-018): Whisper from the Table and Settings, with
 * the real recorder on media fakes, a fake Groq transcriber and recorded model replies.
 */

type User = ReturnType<typeof userEvent.setup>;

const recorded = (name: string): ModelReply =>
  anthropicReply(JSON.parse(readFileSync(`tests/voice/recorded/${name}.json`, "utf8")) as Anthropic.Message, "claude-sonnet-5");

const OR_SETUP = [
  { type: "startSR" },
  { type: "parCompany", player: "p1", company: "PRR", price: 100 },
  { type: "buyShare", buyer: "player:p1", company: "PRR", source: "ipo", count: 4 },
  { type: "endSR" },
  { type: "startOR" },
];

class FakeRecognizer implements RecognizerLike {
  static started = 0;
  static current: FakeRecognizer | undefined;
  lang = "";
  interimResults = false;
  continuous = false;
  onresult: RecognizerLike["onresult"] = null;
  onerror: RecognizerLike["onerror"] = null;
  onend: RecognizerLike["onend"] = null;
  start() {
    FakeRecognizer.started += 1;
    FakeRecognizer.current = this;
  }
  say(text: string) {
    this.onresult?.({ results: { length: 1, 0: { length: 1, 0: { transcript: text } } } });
  }
  stop() {
    queueMicrotask(() => this.onend?.());
  }
  abort() {
    this.onend?.();
  }
}

interface Rig {
  readonly deps: VoiceDeps;
  readonly media: FakeMedia;
  readonly calls: { blob: Blob; options: TranscribeOptions }[];
  /** Settles a held transcription (with `hold: true`). */
  release(result: TranscriptionResult): void;
}

function rig({
  speech = false,
  media: mediaOptions = {},
  text = "240, paga",
  result,
  hold = false,
}: { speech?: boolean; media?: FakeMediaOptions; text?: string; result?: TranscriptionResult; hold?: boolean } = {}): Rig {
  const media = fakeMediaDeps(mediaOptions);
  const calls: Rig["calls"] = [];
  let settle: (r: TranscriptionResult) => void = () => undefined;
  const transcriber: Transcriber = (blob, options) => {
    calls.push({ blob, options });
    const r = result ?? { kind: "text", text, ms: 400 };
    if (!hold) return Promise.resolve(r);
    return new Promise((resolve) => {
      settle = resolve;
      options.signal?.addEventListener("abort", () => resolve({ kind: "empty", reason: "cancelled" }));
    });
  };
  const deps: VoiceDeps = {
    recognizer: speech ? () => new FakeRecognizer() : browserRecognizer,
    online: () => true,
    createInterpreter: () => (_session, message) => {
      const transcript = /Transcripción: «(.*)»/.exec(message)?.[1] ?? "";
      return Promise.resolve(recorded(transcript === "240, paga" ? "payout" : "not-understood"));
    },
    media: () => media.deps,
    transcriber,
  };
  return { deps, media, calls, release: (r) => settle(r) };
}

const KEYS = { apiKeys: { anthropic: "sk-ant-test" }, rememberKey: true };
const WHISPER = { ...KEYS, whisper: true, groqKey: "gsk_test" };

const HOLD = "Mantén pulsado para hablar";
const RELEASE = "Suelta para enviar";

async function micButton(name = HOLD) {
  // The recorder comes up across several promise hops; give it room under full-suite load.
  const mic = await screen.findByRole<HTMLButtonElement>("button", { name }, { timeout: 4000 });
  return mic;
}

/** Presses the mic and waits for the recorder to be live. */
async function press(hold = HOLD, releaseName = RELEASE) {
  const mic = await micButton(hold);
  await waitFor(() => expect(mic.disabled).toBe(false));
  await act(async () => {
    mic.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await Promise.resolve();
  });
  return micButton(releaseName);
}

/** Moves the clock as if the button was held `ms`, then releases. */
async function release(ms = 1500, releaseName = RELEASE) {
  vi.setSystemTime(Date.now() + ms);
  const mic = await micButton(releaseName);
  await act(async () => {
    mic.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    await Promise.resolve();
  });
}

async function openSettingsFromTable(user: User) {
  await openMenuItem(user, "Ajustes");
  await screen.findByRole("heading", { name: "Ajustes" });
}

async function storedSettings(dbName: string) {
  const db = await openCompanionDb(dbName);
  const s = await new SettingsRepo(db).get();
  db.close();
  return s;
}

beforeEach(() => {
  // Only Date is faked: the recording's length comes from the clock, everything else runs normally.
  vi.useFakeTimers({ toFake: ["Date"] });
  FakeRecognizer.started = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Whisper in Settings (015 FR-002, FR-003, FR-005)", () => {
  it("the browser engine is chosen by default, the key field shows anyway, with the billing note", async () => {
    const { user } = await openSeededTable({ settings: KEYS, voiceDeps: rig().deps });
    await openSettingsFromTable(user);
    const engine = screen.getByRole("radiogroup", { name: "Motor de reconocimiento" });
    expect(within(engine).getByRole("radio", { name: "Del navegador" }).getAttribute("aria-checked")).toBe("true");
    expect(within(engine).getByRole("radio", { name: "Whisper (Groq)" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/Groq puede cobrar según tu plan/)).toBeTruthy();
  });

  it("saving a key leaves the browser engine chosen; choosing Whisper switches the privacy line to Groq", async () => {
    const { user, dbName } = await openSeededTable({ settings: KEYS, voiceDeps: rig().deps });
    await openSettingsFromTable(user);
    expect(screen.getByText(/servicio de voz del navegador/)).toBeTruthy();
    await user.type(screen.getByLabelText("Clave de Groq"), "gsk_new");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Guardado");
    expect(await storedSettings(dbName)).toMatchObject({ whisper: false, groqKey: "gsk_new" });

    await user.click(screen.getByRole("radio", { name: "Whisper (Groq)" }));
    expect(screen.getByText(/se manda a Groq para pasarla a texto/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(async () => expect(await storedSettings(dbName)).toMatchObject({ whisper: true, groqKey: "gsk_new" }));
  });

  it("English", async () => {
    vi.stubEnv("VITE_VOICE_LANGUAGES", "es,en");
    setNavigatorLanguages(["en-US"]);
    const { user } = await openSeededTable({ settings: { ...KEYS, language: "en" }, voiceDeps: rig().deps });
    await openMenuItem(user, "Settings");
    await screen.findByRole("heading", { name: "Settings" });
    expect(within(screen.getByRole("radiogroup", { name: "Speech engine" })).getByRole("radio", { name: "Browser built-in" })).toBeTruthy();
    expect(screen.getByLabelText("Groq key")).toBeTruthy();
  });
});

describe("Whisper from the Table (015 US1)", () => {
  it("016 US3-1: no recognizer and the toggle off → no mic and no voice message on the Table", async () => {
    await openSeededTable({ settings: KEYS, voiceDeps: rig().deps });
    // Let the settings load before asserting absence.
    await waitFor(() => expect(screen.getByRole("button", { name: "Menú" })).toBeTruthy());
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(screen.queryByRole("button", { name: HOLD })).toBeNull();
    expect(screen.queryByText(/no reconoce la voz/)).toBeNull();
  });

  it("016 US3-3: turning Whisper on with a Groq key brings the mic back without remounting", async () => {
    const { user } = await openSeededTable({ settings: { ...KEYS, groqKey: "gsk_test" }, voiceDeps: rig().deps });
    expect(screen.queryByRole("button", { name: HOLD })).toBeNull();
    await openSettingsFromTable(user);
    await user.click(screen.getByRole("radio", { name: "Whisper (Groq)" }));
    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect((await micButton()).disabled).toBe(false);
  });

  it("US1-1/US1-3: toggle on + key → hold, level ring, transcribing with Cancelar, card, confirm applies", async () => {
    const r = rig({ hold: true });
    const { user } = await openSeededTable({ actions: OR_SETUP, settings: WHISPER, voiceDeps: r.deps });
    const before = cashText("p1");
    const mic = await press();
    expect(screen.getByText("Escuchando…")).toBeTruthy();
    await waitFor(() => expect(mic.style.getPropertyValue("--mic-level")).not.toBe(""));
    await release();
    expect(await screen.findByText("Transcribiendo…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
    expect(r.media.allStopped()).toBe(true);
    act(() => r.release({ kind: "text", text: "240, paga", ms: 400 }));
    const card = await screen.findByRole("dialog", { name: "Confirmar orden de voz" });
    await user.click(within(card).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(cashText("p1")).not.toBe(before));
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0]?.options.lang).toBe("es");
    expect(r.calls[0]?.options.apiKey).toBe("gsk_test");
  });

  it("US1-4 / FR-017: a denied microphone explains why, and touch stays available", async () => {
    const r = rig({ media: { fail: "NotAllowedError" } });
    await openSeededTable({ actions: OR_SETUP, settings: WHISPER, voiceDeps: r.deps });
    const mic = await micButton();
    await waitFor(() => expect(mic.disabled).toBe(false));
    await act(async () => {
      mic.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      await Promise.resolve();
    });
    const card = await screen.findByRole("dialog", { name: "No entendí" });
    expect(within(card).getByText("La voz necesita el micrófono. Hay que permitirlo en los ajustes del sitio del navegador")).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Hacerlo a mano" })).toBeTruthy();
    expect(r.calls).toHaveLength(0);
  });

  it("FR-009: a quick tap says it heard nothing and sends nothing", async () => {
    const r = rig();
    await openSeededTable({ actions: OR_SETUP, settings: WHISPER, voiceDeps: r.deps });
    await press();
    await release(150);
    expect(await screen.findByText("No escuché nada")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(r.calls).toHaveLength(0);
  });

  it("FR-013: hiding the page while listening cancels and frees the microphone", async () => {
    const r = rig();
    await openSeededTable({ actions: OR_SETUP, settings: WHISPER, voiceDeps: r.deps });
    await press();
    hidePage();
    expect(await micButton(HOLD)).toBeTruthy();
    expect(r.media.allStopped()).toBe(true);
    expect(r.calls).toHaveLength(0);
  });

  it("FR-013: hiding the page while transcribing aborts the request and shows no card", async () => {
    const r = rig({ hold: true });
    await openSeededTable({ actions: OR_SETUP, settings: WHISPER, voiceDeps: r.deps });
    await press();
    await release();
    await screen.findByText("Transcribiendo…");
    hidePage();
    await waitFor(() => expect(r.calls[0]?.options.signal?.aborted).toBe(true));
    expect(await micButton(HOLD)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Cancelar while transcribing aborts the request", async () => {
    const r = rig({ hold: true });
    const { user } = await openSeededTable({ actions: OR_SETUP, settings: WHISPER, voiceDeps: r.deps });
    await press();
    await release();
    await user.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(r.calls[0]?.options.signal?.aborted).toBe(true);
    expect(screen.queryByText("Transcribiendo…")).toBeNull();
  });
});

async function changeSettings(dbName: string, patch: Parameters<SettingsRepo["set"]>[0]) {
  const db = await openCompanionDb(dbName);
  await new SettingsRepo(db).set(patch);
  db.close();
  act(() => {
    window.dispatchEvent(new Event(SETTINGS_CHANGED));
  });
}

describe("Whisper where the browser also recognizes speech (015 US2)", () => {
  it("the engine choice saves at once: back to the browser with no Guardar, back at the table the next command uses the browser", async () => {
    // Found on a phone, 2026-11-07: Guardar is off screen below the toggle, so the change was lost.
    const r = rig({ speech: true });
    const { user, dbName } = await openSeededTable({ actions: OR_SETUP, settings: WHISPER, voiceDeps: r.deps });
    await openSettingsFromTable(user);
    // An unsaved key edit stays a draft: the toggle saves only itself (FR-003).
    await user.clear(screen.getByLabelText("Clave de Groq"));
    await user.type(screen.getByLabelText("Clave de Groq"), "gsk_draft");
    await user.click(screen.getByRole("radio", { name: "Del navegador" }));
    await waitFor(async () => expect(await storedSettings(dbName)).toMatchObject({ whisper: false, groqKey: "gsk_test" }));

    await user.click(screen.getByRole("button", { name: "Volver" }));
    await press();
    await release();
    expect(FakeRecognizer.started).toBe(1);
    expect(r.calls).toHaveLength(0);
  });

  it("US2-1: with the toggle off, a saved Groq key keeps the browser engine and sends nothing to Groq", async () => {
    const r = rig({ speech: true });
    await openSeededTable({ actions: OR_SETUP, settings: { ...KEYS, groqKey: "gsk_test" }, voiceDeps: r.deps });
    await press();
    await release();
    expect(FakeRecognizer.started).toBe(1);
    expect(r.calls).toHaveLength(0);
  });

  it("US2-2: off uses the recognizer, on again uses Groq with no key re-entry, and the toggle is remembered", async () => {
    const r = rig({ speech: true });
    const { dbName } = await openSeededTable({ actions: OR_SETUP, settings: WHISPER, voiceDeps: r.deps });
    await changeSettings(dbName, { whisper: false });
    await waitFor(async () => expect((await storedSettings(dbName)).whisper).toBe(false));
    await press();
    await release();
    expect(FakeRecognizer.started).toBe(1);
    expect(r.calls).toHaveLength(0);

    await changeSettings(dbName, { whisper: true });
    await screen.findByRole("button", { name: HOLD });
    await press();
    await release();
    await waitFor(() => expect(r.calls).toHaveLength(1));
    expect(r.calls[0]?.options.apiKey).toBe("gsk_test");
    expect((await storedSettings(dbName)).whisper).toBe(true);
  });

  it("US2-3: the request carries the session's player names and company short names as a hint", async () => {
    const r = rig();
    await openSeededTable({ actions: OR_SETUP, settings: WHISPER, voiceDeps: r.deps });
    await press();
    await release();
    await waitFor(() => expect(r.calls).toHaveLength(1));
    const prompt = r.calls[0]?.options.prompt ?? "";
    for (const name of ["Ana", "Bruno", "Carla", "Dani", "PRR", "B&O"]) expect(prompt).toContain(name);
  });

  it("US2-4: the transcription is requested in the display language", async () => {
    vi.stubEnv("VITE_VOICE_LANGUAGES", "es,en");
    setNavigatorLanguages(["en-US"]);
    const r = rig({ text: "how much does Ana have" });
    await openSeededTable({ actions: OR_SETUP, settings: { ...WHISPER, language: "en" }, voiceDeps: r.deps });
    await press("Hold to talk", "Release to send");
    await release(1500, "Release to send");
    await waitFor(() => expect(r.calls).toHaveLength(1));
    expect(r.calls[0]?.options.lang).toBe("en");
    expect(r.calls[0]?.options.prompt).toContain("Players:");
  });
});

describe("Whisper failures (015 US3)", () => {
  const ERRORS: readonly [kind: TranscriptionError["kind"], text: string][] = [
    ["auth", "Groq: la clave no es válida. Revisar la clave en Ajustes"],
    ["permission", "Groq: esta clave no puede usar el modelo de transcripción"],
    ["model", "Groq: el modelo de transcripción no está disponible"],
    ["rateLimit", "Groq: demasiados pedidos, intentar de nuevo en un momento"],
    ["audio", "Groq no pudo leer la grabación"],
    ["service", "Groq no responde, intentar de nuevo"],
    ["timeout", "Groq tardó demasiado en responder"],
    ["connection", "Sin conexión con Groq"],
  ];

  it.each(ERRORS)("US3-1: %s → its message, no transcript, nothing proposed, touch still works", async (kind, text) => {
    const r = rig({ result: { kind: "error", error: new TranscriptionError(kind, `Groq: ${kind}`) } });
    const { user } = await openSeededTable({ actions: OR_SETUP, settings: WHISPER, voiceDeps: r.deps });
    const before = cashText("p1");
    await press();
    await release();
    const card = await screen.findByRole("dialog", { name: "No entendí" });
    expect(within(card).getByText(text)).toBeTruthy();
    expect(within(card).queryByText(/«/)).toBeNull();
    await user.click(within(card).getByRole("button", { name: "Cerrar" }));
    expect(cashText("p1")).toBe(before);
    await openMenuItem(user, "Historial");
    expect(await screen.findByRole("heading", { name: "Historial" })).toBeTruthy();
  });

  it("US3-1 in English", async () => {
    vi.stubEnv("VITE_VOICE_LANGUAGES", "es,en");
    setNavigatorLanguages(["en-US"]);
    const r = rig({ result: { kind: "error", error: new TranscriptionError("auth", "Groq: 401") } });
    await openSeededTable({ actions: OR_SETUP, settings: { ...WHISPER, language: "en" }, voiceDeps: r.deps });
    await press("Hold to talk", "Release to send");
    await release(1500, "Release to send");
    expect(await screen.findByText("Groq: the key isn't valid. Check it in Settings")).toBeTruthy();
  });

  it("US3-2: where the browser recognizes speech, one tap turns Whisper off; nothing is recorded in the history", async () => {
    const r = rig({ speech: true, result: { kind: "error", error: new TranscriptionError("rateLimit", "Groq: 429") } });
    const { user, dbName } = await openSeededTable({ actions: OR_SETUP, settings: WHISPER, voiceDeps: r.deps });
    await press();
    await release();
    const card = await screen.findByRole("dialog", { name: "No entendí" });
    await user.click(within(card).getByRole("button", { name: "Usar el reconocimiento del navegador" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "No entendí" })).toBeNull());
    await waitFor(async () => expect((await storedSettings(dbName)).whisper).toBe(false));
    expect((await storedSettings(dbName)).groqKey).toBe("gsk_test");
    await press();
    await release();
    expect(FakeRecognizer.started).toBe(1);
    expect(r.calls).toHaveLength(1);
  });

  it("US3-4: without a browser recognizer, that button isn't offered", async () => {
    const r = rig({ result: { kind: "error", error: new TranscriptionError("service", "Groq: 500") } });
    await openSeededTable({ actions: OR_SETUP, settings: WHISPER, voiceDeps: r.deps });
    await press();
    await release();
    const card = await screen.findByRole("dialog", { name: "No entendí" });
    expect(within(card).queryByRole("button", { name: "Usar el reconocimiento del navegador" })).toBeNull();
  });

  it("no microphone → it says so", async () => {
    const r = rig({ media: { fail: "NotFoundError" } });
    await openSeededTable({ actions: OR_SETUP, settings: WHISPER, voiceDeps: r.deps });
    const mic = await micButton();
    await waitFor(() => expect(mic.disabled).toBe(false));
    await act(async () => {
      mic.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      await Promise.resolve();
    });
    expect(await screen.findByText("No se encontró un micrófono")).toBeTruthy();
  });

  it("US3-3: nothing heard → the hint, and no model call", async () => {
    let interpreted = 0;
    const r = rig({ result: { kind: "empty", reason: "noSpeech" } });
    const deps: VoiceDeps = { ...r.deps, createInterpreter: () => () => ((interpreted += 1), Promise.reject(new Error("unused"))) };
    await openSeededTable({ actions: OR_SETUP, settings: WHISPER, voiceDeps: deps });
    await press();
    await release();
    expect(await screen.findByText("No escuché nada")).toBeTruthy();
    expect(r.calls).toHaveLength(1);
    expect(interpreted).toBe(0);
  });
});

describe("dev check clips (015 research R11, T040)", () => {
  it("with the browser engine, “Guardar para eval” also saves the same hold's audio next to the candidate", async () => {
    const saved: { name: string; blob: Blob }[] = [];
    const blobs = new Map<string, Blob>();
    let n = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
      const url = `blob:test-${(n += 1)}`;
      blobs.set(url, b as Blob);
      return url;
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ name: this.download, blob: blobs.get(this.href)! });
    });

    const r = rig({ speech: true });
    const { user } = await openSeededTable({ actions: OR_SETUP, settings: { ...KEYS, checkClips: true }, voiceDeps: r.deps });
    await press();
    act(() => FakeRecognizer.current?.say("240, paga"));
    await release();
    const card = await screen.findByRole("dialog", { name: "Confirmar orden de voz" });
    await user.click(within(card).getByRole("button", { name: "Guardar para eval" }));
    await waitFor(() => expect(saved).toHaveLength(2));
    const clip = saved.find((s) => s.name.endsWith(".webm"));
    const json = saved.find((s) => s.name.endsWith(".json"));
    expect(clip?.blob.type).toBe("audio/webm;codecs=opus");
    const candidate = JSON.parse(await json!.blob.text()) as Record<string, unknown>;
    expect(candidate).toMatchObject({ transcript: "240, paga", audio: clip?.name, engine: "browser", lang: "es" });
    expect(candidate["expect"]).toMatchObject({ type: "runAndPayout" });
    expect(r.calls).toHaveLength(0);
    expect(r.media.allStopped()).toBe(true);
  });

  it("on Android, Settings says check clips can't be recorded with the browser's recognition", async () => {
    const ua = vi.spyOn(navigator, "userAgent", "get");
    ua.mockReturnValue("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36");
    const { user } = await openSeededTable({ settings: KEYS, voiceDeps: rig().deps });
    await openSettingsFromTable(user);
    expect(screen.getByText(/En Android, el reconocimiento del navegador no puede grabar clips a la vez/)).toBeTruthy();
    ua.mockRestore();
  });

  it("on desktop there is no such note", async () => {
    const { user } = await openSeededTable({ settings: KEYS, voiceDeps: rig().deps });
    await openSettingsFromTable(user);
    expect(screen.getByRole("checkbox", { name: "Grabar clips de control" })).toBeTruthy();
    expect(screen.queryByText(/En Android, el reconocimiento del navegador/)).toBeNull();
  });

  it("with check clips off, nothing is recorded alongside the browser engine", async () => {
    const r = rig({ speech: true });
    await openSeededTable({ actions: OR_SETUP, settings: KEYS, voiceDeps: r.deps });
    await press();
    await release();
    expect(r.media.streams).toHaveLength(0);
  });
});

describe("Whisper language gate (015 FR-018)", () => {
  it("where Whisper isn't offered: no toggle, the key field stays, and a stored toggle has no effect", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_WHISPER_LANGUAGES", "");
    const r = rig({ speech: true });
    const { user } = await openSeededTable({ actions: OR_SETUP, settings: WHISPER, voiceDeps: r.deps });
    await press();
    expect(FakeRecognizer.started).toBe(1);
    await release();
    expect(r.calls).toHaveLength(0);
    await openSettingsFromTable(user);
    expect(screen.queryByRole("radiogroup", { name: "Motor de reconocimiento" })).toBeNull();
    expect(screen.getByLabelText("Clave de Groq")).toBeTruthy();
  });
});

function hidePage() {
  act(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  // Restore for the next test.
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
}
