import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VoiceDeps } from "../../src/app/useVoice";
import type { RecognizerLike } from "../../src/voice/speech";
import { setNavigatorLanguages } from "../helpers/session";
import { openSeededTable } from "./helpers";

/**
 * Feature 014 T049 (FR-014e, contracts/voice.md): voice is offered only in the languages that
 * passed their eval gate. By default that is Spanish only; `VITE_VOICE_LANGUAGES=es,en` adds English.
 */

class FakeRecognizer implements RecognizerLike {
  static started: FakeRecognizer[] = [];
  lang = "";
  interimResults = false;
  continuous = false;
  onresult: RecognizerLike["onresult"] = null;
  onerror: RecognizerLike["onerror"] = null;
  onend: RecognizerLike["onend"] = null;
  start() {
    FakeRecognizer.started.push(this);
  }
  stop() {
    queueMicrotask(() => this.onend?.());
  }
  abort() {
    this.onend?.();
  }
}

function deps(created: { count: number }): VoiceDeps {
  return {
    recognizer: () => {
      created.count += 1;
      return new FakeRecognizer();
    },
    online: () => true,
    createInterpreter: () => () => Promise.reject(new Error("not used")),
  };
}

const KEY = { apiKeys: { anthropic: "sk-ant-test" }, rememberKey: true };

afterEach(() => {
  vi.unstubAllEnvs();
  FakeRecognizer.started = [];
});

async function holdMic(name: string) {
  const mic = await screen.findByRole("button", { name });
  // The mic is enabled once the settings (key and region) have loaded.
  await waitFor(() => expect(mic).toHaveProperty("disabled", false));
  // A pointer down starts listening (the hold-to-talk button).
  await act(async () => {
    mic.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await Promise.resolve();
  });
}

describe("voice language gate (feature 014 T049)", () => {
  it("English display, default gate: no mic, no voice panel, and no recognizer is created", async () => {
    setNavigatorLanguages(["en-US"]);
    const created = { count: 0 };
    await openSeededTable({ settings: KEY, voiceDeps: deps(created) });
    expect(screen.queryByRole("button", { name: "Hold to talk" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mantén pulsado para hablar" })).toBeNull();
    expect(document.querySelector(".mic-area")).toBeNull();
    expect(created.count).toBe(0);
  });

  it("Spanish display, default gate: the mic shows and listens with the Spanish region", async () => {
    const created = { count: 0 };
    await openSeededTable({ settings: { ...KEY, voiceLocales: { es: "es-UY" } }, voiceDeps: deps(created) });
    await holdMic("Mantén pulsado para hablar");
    expect(FakeRecognizer.started.at(-1)?.lang).toBe("es-UY");
  });

  it("with English in the gate, English shows the mic and listens with the English region", async () => {
    vi.stubEnv("VITE_VOICE_LANGUAGES", "es,en");
    setNavigatorLanguages(["en-US"]);
    const created = { count: 0 };
    await openSeededTable({ settings: { ...KEY, voiceLocales: { en: "en-GB" } }, voiceDeps: deps(created) });
    await holdMic("Hold to talk");
    expect(FakeRecognizer.started.at(-1)?.lang).toBe("en-GB");
  });
});
