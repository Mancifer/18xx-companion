import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { newSession } from "./helpers";

/**
 * Feature 015 T031 (US1, FR-003, FR-007, constitution V): Whisper end to end with both services
 * mocked, so no key or cost. The phone project (Chromium) records a looped synthetic tone through
 * the real MediaRecorder; the tablet project (WebKit has no fake-media flags) stubs the media APIs.
 *
 * Whisper is offered in this build only because playwright.config.ts passes VITE_WHISPER_LANGUAGES
 * to the e2e web server.
 */

const GROQ = "https://api.groq.com/openai/v1/audio/transcriptions";
const ANTHROPIC = "https://api.anthropic.com/v1/messages";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };

// The PWA service worker would hide the app's requests from page.route.
test.use({ serviceWorkers: "block" });

/** WebKit: a tiny stand-in for the recorder, the stream and the analyser. */
async function stubMediaOnWebKit(page: Page, browserName: string) {
  if (browserName !== "webkit") return;
  await page.addInitScript(() => {
    const track = { stop() {} };
    const stream = { getTracks: () => [track] };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: () => Promise.resolve(stream) },
    });
    class StubRecorder {
      static isTypeSupported(type: string) {
        return type === "audio/mp4";
      }
      mimeType = "audio/mp4";
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onstart: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      start() {
        queueMicrotask(() => this.onstart?.());
      }
      stop() {
        queueMicrotask(() => {
          this.ondataavailable?.({ data: new Blob(["audio"], { type: "audio/mp4" }) });
          this.onstop?.();
        });
      }
    }
    class StubAudioContext {
      createMediaStreamSource() {
        return { connect() {} };
      }
      createAnalyser() {
        return { fftSize: 1024, getFloatTimeDomainData: (a: Float32Array) => a.fill(0.2) };
      }
      close() {
        return Promise.resolve();
      }
    }
    Object.assign(window, { MediaRecorder: StubRecorder, AudioContext: StubAudioContext });
  });
}

interface Mocks {
  /** The multipart bodies Groq received. */
  readonly groqBodies: string[];
}

async function mockServices(page: Page, { groq = { text: "¿Cuánto tiene Ana?" }, groqStatus = 200, groqDelayMs = 0 } = {}): Promise<Mocks> {
  const groqBodies: string[] = [];
  const preflight = (route: Route) => route.fulfill({ status: 204, headers: CORS });
  await page.route(GROQ, async (route) => {
    if (route.request().method() === "OPTIONS") return preflight(route);
    groqBodies.push(route.request().postDataBuffer()?.toString("latin1") ?? "");
    if (groqDelayMs) await new Promise((r) => setTimeout(r, groqDelayMs));
    await route.fulfill({
      status: groqStatus,
      headers: { ...CORS, "content-type": "application/json" },
      body: JSON.stringify(groqStatus === 200 ? groq : { error: { message: "Invalid API Key", type: "invalid_request_error" } }),
    });
  });
  const reply = readFileSync("tests/voice/recorded/query.json", "utf8");
  await page.route(ANTHROPIC, (route) => {
    if (route.request().method() === "OPTIONS") return preflight(route);
    return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: reply });
  });
  return { groqBodies };
}

/** Settings from the Table: the AI key, the Whisper toggle, the Groq key. */
async function configure(page: Page, { whisper }: { whisper: boolean }) {
  await page.getByRole("button", { name: "Menú" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Ajustes" }).click();
  const toggle = page.getByRole("checkbox", { name: "Usar Whisper (Groq) para reconocer la voz" });
  await expect(
    toggle,
    "Whisper isn't offered in this build: stop the preview server on :4173 and re-run npm run test:e2e, so it rebuilds with VITE_WHISPER_LANGUAGES",
  ).toBeVisible();
  await page.getByLabel("Clave de Anthropic").fill("sk-ant-test");
  await page.getByLabel("Clave de Groq").fill("gsk_test");
  if (whisper) await toggle.check();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado")).toBeVisible();
  await page.getByRole("button", { name: "Volver" }).click();
}

/** Holds the mic about `ms`, then releases. */
async function hold(page: Page, ms: number) {
  const mic = page.getByRole("button", { name: "Mantén pulsado para hablar" });
  await expect(mic).toBeEnabled();
  await mic.hover();
  await page.mouse.down();
  await expect(page.getByRole("button", { name: "Suelta para enviar" })).toBeVisible();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

test.describe("Whisper (feature 015)", () => {
  test("hold, transcribing, card: the transcript goes through the usual path", async ({ page, browserName }) => {
    await stubMediaOnWebKit(page, browserName);
    const mocks = await mockServices(page, { groqDelayMs: 1200 });
    await newSession(page, { players: ["Ana", "Bruno", "Carla"] });
    await configure(page, { whisper: true });

    await hold(page, 1200);
    await expect(page.getByText("Transcribiendo…")).toBeVisible();
    // Constitution V: 48 px targets, also while transcribing.
    for (const button of [page.getByRole("button", { name: "Cancelar" }), page.getByRole("button", { name: "Mantén pulsado para hablar" })]) {
      const box = await button.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(48);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
    }
    await expect(page.getByRole("dialog", { name: "Respuesta" })).toBeVisible();
    expect(mocks.groqBodies).toHaveLength(1);
    const body = mocks.groqBodies[0] ?? "";
    expect(body).toContain('name="language"');
    expect(body).toContain("verbose_json");
    expect(body).toMatch(/filename="command\.(webm|mp4)"/);
  });

  test("US3: a 401 from Groq explains itself, proposes nothing, and touch keeps working", async ({ page, browserName }) => {
    await stubMediaOnWebKit(page, browserName);
    await mockServices(page, { groqStatus: 401 });
    await newSession(page, { players: ["Ana", "Bruno", "Carla"] });
    await configure(page, { whisper: true });
    await hold(page, 1200);
    const card = page.getByRole("dialog", { name: "No entendí" });
    await expect(card.getByText("Groq: la clave no es válida. Revisar la clave en Ajustes")).toBeVisible();
    // Headless browsers may not expose a recognizer: the way out is offered only where there is one.
    const recognizer = await page.evaluate(() => "SpeechRecognition" in window || "webkitSpeechRecognition" in window);
    const fallback = card.getByRole("button", { name: "Usar el reconocimiento del navegador" });
    if (recognizer) await expect(fallback).toBeVisible();
    else await expect(fallback).toHaveCount(0);
    await card.getByRole("button", { name: "Cerrar" }).click();
    await expect(card).toHaveCount(0);
    // Touch still works: open a player sheet.
    await page.locator(".player-tile", { hasText: "Ana" }).click();
    await expect(page.getByRole("button", { name: "Pagar…" })).toBeVisible();
  });

  test("FR-003: with the toggle off, a saved Groq key sends nothing to Groq", async ({ page, browserName }) => {
    await stubMediaOnWebKit(page, browserName);
    const mocks = await mockServices(page);
    await newSession(page, { players: ["Ana", "Bruno", "Carla"] });
    await configure(page, { whisper: false });
    const mic = page.getByRole("button", { name: "Mantén pulsado para hablar" });
    await mic.hover();
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();
    await page.waitForTimeout(500);
    expect(mocks.groqBodies).toHaveLength(0);
  });
});
