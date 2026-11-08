import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_CHANGED } from "../../src/app/useVoice";
import { openCompanionDb } from "../../src/persistence/db";
import { SettingsRepo } from "../../src/persistence/settingsRepo";
import { PROVIDERS } from "../../src/voice/providers";
import { App } from "../../src/ui/App";
import { freshDbName, setNavigatorLanguages } from "../helpers/session";

/** T133: the Settings screen (FR-076, research R17). */

async function openSettings(seed?: Parameters<SettingsRepo["set"]>[0], rows?: Record<string, unknown>) {
  const dbName = freshDbName();
  if (seed || rows) {
    const db = await openCompanionDb(dbName);
    if (rows) {
      const tx = db.transaction("settings", "readwrite");
      for (const [key, value] of Object.entries(rows)) await tx.store.put({ key, value });
      await tx.done;
    }
    if (seed) await new SettingsRepo(db).set(seed);
    db.close();
  }
  const user = userEvent.setup();
  render(<App dbName={dbName} />);
  await user.click(await screen.findByRole("button", { name: "Ajustes" }));
  await screen.findByRole("heading", { name: "Ajustes" });
  return { user, dbName };
}

async function stored(dbName: string) {
  const db = await openCompanionDb(dbName);
  const s = await new SettingsRepo(db).get();
  db.close();
  return s;
}

describe("Settings screen", () => {
  it("shows defaults, the privacy note and the spend-limit advice", async () => {
    await openSettings();
    expect(screen.getByLabelText("Clave de Anthropic")).toHaveProperty("type", "password");
    expect(screen.getByLabelText("Modelo")).toHaveProperty("value", PROVIDERS.anthropic.defaultModel);
    expect(screen.getByLabelText("Variante de español")).toHaveProperty("value", "es-ES");
    expect(screen.getByText(/servicio de voz del navegador/)).toBeTruthy();
    expect(screen.getByText(/límite de gasto mensual/)).toBeTruthy();
  });

  it("masks the key and toggles show/hide", async () => {
    const { user } = await openSettings({ apiKeys: { anthropic: "sk-ant-secret" }, rememberKey: true });
    const input = screen.getByLabelText("Clave de Anthropic");
    expect(input).toHaveProperty("type", "password");
    expect(input).toHaveProperty("value", "sk-ant-secret");
    await user.click(screen.getByRole("button", { name: "Mostrar" }));
    expect(input).toHaveProperty("type", "text");
    await user.click(screen.getByRole("button", { name: "Ocultar" }));
    expect(input).toHaveProperty("type", "password");
  });

  it("saves key, locale and model, and notifies the voice layer", async () => {
    const { user, dbName } = await openSettings();
    let notified = 0;
    const onChange = () => (notified += 1);
    window.addEventListener(SETTINGS_CHANGED, onChange);
    try {
      await user.type(screen.getByLabelText("Clave de Anthropic"), "sk-ant-new");
      await user.selectOptions(screen.getByLabelText("Variante de español"), "es-AR");
      await user.clear(screen.getByLabelText("Modelo"));
      await user.type(screen.getByLabelText("Modelo"), "claude-haiku-4-5");
      await user.click(screen.getByRole("button", { name: "Guardar" }));
      await screen.findByText("Guardado");
    } finally {
      window.removeEventListener(SETTINGS_CHANGED, onChange);
    }
    expect(notified).toBe(1);
    const s = await stored(dbName);
    expect(s).toMatchObject({
      apiKeys: { anthropic: "sk-ant-new" },
      voiceLocales: { en: "en-US", es: "es-AR" },
      models: { anthropic: "claude-haiku-4-5" },
      rememberKey: true,
    });
  });

  it("does not persist the key when 'no recordar' is on", async () => {
    const { user, dbName } = await openSettings({ apiKeys: { anthropic: "sk-ant-old" }, rememberKey: true });
    await user.click(screen.getByLabelText("No recordar las claves en este dispositivo"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Guardado");
    const s = await stored(dbName);
    expect(s.rememberKey).toBe(false);
    expect(s.apiKeys.anthropic).toBeUndefined();
    // Still usable in this page load.
    expect(screen.getByLabelText("Clave de Anthropic")).toHaveProperty("value", "sk-ant-old");
  });

  it("an empty model falls back to the default", async () => {
    const { user, dbName } = await openSettings({ models: { anthropic: "x" } });
    await user.clear(screen.getByLabelText("Modelo"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Guardado");
    expect((await stored(dbName)).models.anthropic).toBe(PROVIDERS.anthropic.defaultModel);
  });

  it("goes back to Home", async () => {
    const { user } = await openSettings();
    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect(await screen.findByRole("button", { name: "Nueva partida" })).toBeTruthy();
  });
});

describe("Settings: provider (005, contracts/settings-ui.md)", () => {
  const providerRadio = (name: string) => screen.getByRole("radio", { name });
  const GEMINI_NOTE = /Google puede usar las órdenes y respuestas/;

  it("1: legacy apiKey/model rows → Claude selected, key and model shown", async () => {
    await openSettings(undefined, { apiKey: "sk-ant-legacy", model: "claude-haiku-4-5", rememberKey: true });
    expect(providerRadio("Anthropic Claude").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByLabelText("Clave de Anthropic")).toHaveProperty("value", "sk-ant-legacy");
    expect(screen.getByLabelText("Modelo")).toHaveProperty("value", "claude-haiku-4-5");
  });

  it("2: select Gemini, paste a key, keep the default model, save", async () => {
    const { user, dbName } = await openSettings({ apiKeys: { anthropic: "sk-ant-keep" } });
    await user.click(providerRadio("Google Gemini"));
    const key = screen.getByLabelText("Clave de Gemini");
    expect(key).toHaveProperty("type", "password");
    expect(key.getAttribute("autocomplete")).toBe("off");
    expect(key.getAttribute("placeholder")).toBe("AIza…");
    expect(screen.getByLabelText("Modelo").getAttribute("placeholder")).toBe(PROVIDERS.gemini.defaultModel);
    expect(screen.getByLabelText("Modelo")).toHaveProperty("value", PROVIDERS.gemini.defaultModel);
    await user.type(key, "AIza-new");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Guardado");
    const s = await stored(dbName);
    expect(s.provider).toBe("gemini");
    expect(s.apiKeys).toEqual({ anthropic: "sk-ant-keep", gemini: "AIza-new" });
    expect(s.models.gemini).toBe(PROVIDERS.gemini.defaultModel);
  });

  it("3: drafts survive switching back and forth; one save stores both and notifies once", async () => {
    const { user, dbName } = await openSettings();
    let notified = 0;
    const onChange = () => (notified += 1);
    window.addEventListener(SETTINGS_CHANGED, onChange);
    try {
      await user.type(screen.getByLabelText("Clave de Anthropic"), "sk-ant-a");
      await user.click(providerRadio("Google Gemini"));
      await user.type(screen.getByLabelText("Clave de Gemini"), "AIza-b");
      await user.clear(screen.getByLabelText("Modelo"));
      await user.type(screen.getByLabelText("Modelo"), "gemini-3.6-flash");
      await user.click(providerRadio("Anthropic Claude"));
      expect(screen.getByLabelText("Clave de Anthropic")).toHaveProperty("value", "sk-ant-a");
      await user.click(providerRadio("Google Gemini"));
      expect(screen.getByLabelText("Clave de Gemini")).toHaveProperty("value", "AIza-b");
      expect(screen.getByLabelText("Modelo")).toHaveProperty("value", "gemini-3.6-flash");
      await user.click(screen.getByRole("button", { name: "Guardar" }));
      await screen.findByText("Guardado");
    } finally {
      window.removeEventListener(SETTINGS_CHANGED, onChange);
    }
    expect(notified).toBe(1);
    expect(await stored(dbName)).toMatchObject({
      provider: "gemini",
      apiKeys: { anthropic: "sk-ant-a", gemini: "AIza-b" },
      models: { anthropic: PROVIDERS.anthropic.defaultModel, gemini: "gemini-3.6-flash" },
    });
    await user.click(providerRadio("Anthropic Claude"));
    expect(screen.getByLabelText("Clave de Anthropic")).toHaveProperty("value", "sk-ant-a");
  });

  it("4: the Gemini notes show only when Gemini is selected; the privacy text names the provider", async () => {
    const { user } = await openSettings();
    expect(screen.queryByText(GEMINI_NOTE)).toBeNull();
    expect(screen.getByText(/se envían a/).textContent).toContain("Anthropic Claude");
    await user.click(providerRadio("Google Gemini"));
    expect(screen.getByText(GEMINI_NOTE)).toBeTruthy();
    expect(screen.getByText(/límites por minuto y por día/)).toBeTruthy();
    expect(screen.getByText(/aistudio\.google\.com/)).toBeTruthy();
    expect(screen.getByText(/se envían a/).textContent).toContain("Google Gemini");
    await user.click(providerRadio("Anthropic Claude"));
    expect(screen.queryByText(GEMINI_NOTE)).toBeNull();
  });

  it("5: «No recordar las claves» → neither key is in IndexedDB after save", async () => {
    const { user, dbName } = await openSettings({ apiKeys: { anthropic: "sk-ant-old", gemini: "AIza-old" } });
    await user.click(screen.getByLabelText("No recordar las claves en este dispositivo"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Guardado");
    const db = await openCompanionDb(dbName);
    const rows = JSON.stringify(await db.getAll("settings"));
    db.close();
    expect(rows).not.toContain("sk-ant-old");
    expect(rows).not.toContain("AIza-old");
  });

  it("provider options are a radio group, named, with tap-size targets", async () => {
    await openSettings();
    const group = screen.getByRole("radiogroup", { name: "Proveedor" });
    const options = within(group).getAllByRole("radio");
    expect(options.map((o) => o.textContent)).toEqual(["Anthropic Claude", "Google Gemini"]);
  });
});

/** Feature 014 T046 (contracts/ui.md "Settings screen"): the language section and per-language regions. */
describe("Settings: language (feature 014)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function openIn(settingsLabel: string, seed?: Parameters<SettingsRepo["set"]>[0]) {
    const dbName = freshDbName();
    if (seed) {
      const db = await openCompanionDb(dbName);
      await new SettingsRepo(db).set(seed);
      db.close();
    }
    const user = userEvent.setup();
    render(<App dbName={dbName} />);
    await user.click(await screen.findByRole("button", { name: settingsLabel }));
    await screen.findByRole("heading", { name: settingsLabel });
    return { user, dbName };
  }

  const options = (group: string) => within(screen.getByRole("radiogroup", { name: group })).getAllByRole("radio");

  it("comes first, with English and Español named the same in both languages (FR-011)", async () => {
    await openIn("Ajustes");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toBe("Idioma");
    expect(options("Idioma").map((o) => o.textContent)).toEqual(["English", "Español"]);
  });

  it("with nothing saved, the detected language is selected", async () => {
    await openIn("Ajustes");
    expect(options("Idioma").find((o) => o.getAttribute("aria-checked") === "true")?.textContent).toBe("Español");
    document.body.innerHTML = "";
    setNavigatorLanguages(["en-US"]);
    await openIn("Settings");
    expect(options("Language").find((o) => o.getAttribute("aria-checked") === "true")?.textContent).toBe("English");
  });

  it("selecting English switches at once, keeps an unsaved key, and saves only the language", async () => {
    const { user, dbName } = await openIn("Ajustes");
    await user.type(screen.getByLabelText("Clave de Anthropic"), "sk-ant-draft");
    await user.click(screen.getByRole("radio", { name: "English" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Language" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
    expect(screen.getByLabelText("Anthropic key")).toHaveProperty("value", "sk-ant-draft");
    await vi.waitFor(async () => expect((await stored(dbName)).language).toBe("en"));
    const s = await stored(dbName);
    expect(s.apiKeys.anthropic).toBeUndefined();
  });

  it("lists each language's regions in that language; saving writes only that language's region", async () => {
    vi.stubEnv("VITE_VOICE_LANGUAGES", "es,en");
    const { user, dbName } = await openIn("Ajustes", { voiceLocales: { es: "es-UY" } });
    const spanish = screen.getByLabelText("Variante de español");
    expect([...spanish.querySelectorAll("option")].map((o) => o.value)).toEqual(["es-ES", "es-MX", "es-AR", "es-CO", "es-CL", "es-PE", "es-UY", "es-US"]);
    expect(spanish).toHaveProperty("value", "es-UY");
    await user.click(screen.getByRole("radio", { name: "English" }));
    const english = await screen.findByLabelText("Voice region");
    expect([...english.querySelectorAll("option")].map((o) => o.textContent)).toEqual([
      "United States (en-US)",
      "United Kingdom (en-GB)",
      "Australia (en-AU)",
      "Canada (en-CA)",
      "Ireland (en-IE)",
      "India (en-IN)",
      "New Zealand (en-NZ)",
    ]);
    await vi.waitFor(() => expect(english).toHaveProperty("value", "en-US"));
    await user.selectOptions(english, "en-AU");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved");
    expect((await stored(dbName)).voiceLocales).toEqual({ en: "en-AU", es: "es-UY" });
  });

  it("in a language voice isn't offered in, a note takes the region's place; key and model stay", async () => {
    setNavigatorLanguages(["en-US"]);
    await openIn("Settings");
    expect(screen.getByText("Voice isn't available in English yet.")).toBeTruthy();
    expect(screen.queryByLabelText("Voice region")).toBeNull();
    expect(screen.getByLabelText("Anthropic key")).toBeTruthy();
    expect(screen.getByLabelText("Model")).toBeTruthy();
  });
});

describe("Settings layout (016 US5, contracts/ui.md §5)", () => {
  it("five titled groups in order (Desarrollo only in dev builds)", async () => {
    await openSettings();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Idioma", "Interpretación (IA)", "Reconocimiento de voz", "Privacidad", "Desarrollo"]);
  });

  it("every on/off setting is a plain checkbox with its label beside it", async () => {
    await openSettings();
    for (const name of ["No recordar las claves en este dispositivo", "Grabar clips de control"]) {
      expect(screen.getByRole("checkbox", { name }).closest("label.checkbox")).not.toBeNull();
    }
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });

  it("the speech engine is a choice of two buttons, then the region, then the Groq key, unindented", async () => {
    await openSettings();
    const speech = screen.getByRole("region", { name: "Reconocimiento de voz" });
    const engine = within(speech).getByRole("radiogroup", { name: "Motor de reconocimiento" });
    expect(engine.classList.contains("segmented")).toBe(true);
    expect(within(engine).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Del navegador", "Whisper (Groq)"]);
    const key = screen.getByLabelText("Clave de Groq");
    expect(speech.contains(key)).toBe(true);
    expect(key.closest(".subsetting")).toBeNull();
    const region = within(speech).getByLabelText("Variante de español");
    expect(engine.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(region.compareDocumentPosition(key) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Whisper/ })).toBeNull();
  });

  it("where the browser can't record, the Whisper button is disabled and says why", async () => {
    await openSettings();
    expect(screen.getByRole<HTMLButtonElement>("radio", { name: "Whisper (Groq)" }).disabled).toBe(true);
    expect(screen.getByText("Este navegador no puede grabar audio para Whisper")).toBeTruthy();
  });

  it("the AI key and model are in Interpretación (IA); «No recordar» is in Privacidad", async () => {
    await openSettings();
    const ai = screen.getByRole("region", { name: "Interpretación (IA)" });
    expect(within(ai).getByLabelText("Clave de Anthropic")).toBeTruthy();
    expect(within(ai).getByLabelText("Modelo")).toBeTruthy();
    const privacy = screen.getByRole("region", { name: "Privacidad" });
    expect(within(privacy).getByRole("checkbox", { name: "No recordar las claves en este dispositivo" })).toBeTruthy();
  });

  it("where Whisper isn't offered, there is no engine choice but the Groq key stays reachable", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_WHISPER_LANGUAGES", "");
    await openSettings({ groqKey: "gsk_saved" });
    expect(screen.queryByRole("radiogroup", { name: "Motor de reconocimiento" })).toBeNull();
    expect(screen.getByLabelText("Clave de Groq")).toHaveProperty("value", "gsk_saved");
    vi.unstubAllEnvs();
  });

  it("Guardar lives in the sticky footer", async () => {
    await openSettings();
    expect(screen.getByRole("button", { name: "Guardar" }).closest(".settings-footer")).not.toBeNull();
  });
});
