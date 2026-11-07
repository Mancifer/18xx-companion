import type Anthropic from "@anthropic-ai/sdk";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLang } from "../../src/app/language";
import type { VoiceDeps } from "../../src/app/useVoice";
import { App } from "../../src/ui/App";
import { anthropicReply } from "../../src/voice/providers/anthropic";
import type { RecognizerLike } from "../../src/voice/speech";
import { setNavigatorLanguages } from "../helpers/session";
import { byLine, openMenuItem, openSeededTable } from "./helpers";

/**
 * Feature 014 T047 (contracts/ui.md "Switching language", FR-002, SC-008): every open view
 * re-renders in the new language; a confirmation card keeps its action; the choice survives a
 * restart even when the device says otherwise.
 */

type User = ReturnType<typeof userEvent.setup>;

/** A harness inside the App: switches the language the way Settings does. */
const harness: { switchTo?: (lang: "en" | "es") => Promise<void> } = {};
function Harness() {
  const { setLang } = useLang();
  useEffect(() => {
    harness.switchTo = setLang;
  });
  return null;
}
const switchLanguage = async (lang: "en" | "es") => {
  await act(async () => {
    await harness.switchTo?.(lang);
  });
};

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
    Promise.resolve(
      anthropicReply(JSON.parse(readFileSync("tests/voice/recorded/payout.json", "utf8")) as Anthropic.Message, "claude-sonnet-5"),
    ),
};

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
  await user.pointer({ keys: "[/MouseLeft]", target: screen.getByRole("button", { name: "Suelta para enviar" }) });
}

afterEach(() => {
  vi.unstubAllEnvs();
  delete harness.switchTo;
});

describe("switching language (feature 014 T047)", () => {
  it("the Table, its round indicator and money re-render at once, then History", async () => {
    const { user } = await openSeededTable({ actions: OR_SETUP, overlay: <Harness /> });
    expect(screen.getByRole("tab", { name: "Jugadores" })).toBeTruthy();
    await switchLanguage("en");
    expect(screen.getByRole("tab", { name: "Players" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Menu" })).toBeTruthy();
    expect(screen.getByTestId("round").textContent).toBe("OR 1.1");
    expect(document.documentElement.lang).toBe("en");
    await openMenuItem(user, "History");
    expect(await screen.findByRole("heading", { name: "History" })).toBeTruthy();
    await switchLanguage("es");
    expect(screen.getByRole("heading", { name: "Historial" })).toBeTruthy();
  });

  it("an open sheet re-renders in place", async () => {
    const { user } = await openSeededTable({ actions: OR_SETUP, overlay: <Harness /> });
    await openMenuItem(user, "Terminar partida");
    await screen.findByRole("dialog", { name: "¿Terminar la partida?" });
    await switchLanguage("en");
    const sheet = screen.getByRole("dialog", { name: "End the game?" });
    expect(within(sheet).getByRole("button", { name: "End" })).toBeTruthy();
  });

  it("a voice confirmation card keeps its action; only its wording changes", async () => {
    vi.stubEnv("VITE_VOICE_LANGUAGES", "es,en");
    const { user } = await openSeededTable({
      actions: OR_SETUP,
      settings: { apiKeys: { anthropic: "sk-ant-test" }, rememberKey: true },
      voiceDeps,
      overlay: <Harness />,
    });
    await speak(user, "240, paga");
    const card = await screen.findByRole("dialog", { name: "Confirmar orden de voz" });
    expect(within(card).getByText(byLine(/PRR paga \$240/))).toBeTruthy();
    await switchLanguage("en");
    const english = screen.getByRole("dialog", { name: "Confirm voice command" });
    expect(within(english).getByText(byLine(/PRR pays \$240/))).toBeTruthy();
    await user.click(within(english).getByRole("button", { name: "Confirm" }));
    expect(screen.getByTestId("cash-p1").textContent).toBe("$144");
  });

  it("after a restart the app opens in the saved language, whatever the device says (FR-002, SC-008)", async () => {
    const { dbName } = await openSeededTable({ overlay: <Harness /> });
    await switchLanguage("en");
    cleanup();
    setNavigatorLanguages(["es-UY"]);
    render(<App dbName={dbName} />);
    expect(await screen.findByRole("button", { name: "New game" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
  });
});
