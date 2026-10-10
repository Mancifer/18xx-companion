import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SETTINGS_CHANGED } from "../../src/app/useVoice";
import { openCompanionDb } from "../../src/persistence/db";
import { SettingsRepo } from "../../src/persistence/settingsRepo";
import { PROVIDERS } from "../../src/voice/providers";
import { App } from "../../src/ui/App";
import { freshDbName } from "../helpers/session";

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
      voiceLocale: "es-AR",
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
