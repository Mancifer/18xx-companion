import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SETTINGS_CHANGED } from "../../src/app/useVoice";
import { openCompanionDb } from "../../src/persistence/db";
import { DEFAULT_MODEL, SettingsRepo } from "../../src/persistence/settingsRepo";
import { App } from "../../src/ui/App";
import { freshDbName } from "../helpers/session";

/** T133: the Settings screen (FR-076, research R17). */

async function openSettings(seed?: Parameters<SettingsRepo["set"]>[0]) {
  const dbName = freshDbName();
  if (seed) {
    const db = await openCompanionDb(dbName);
    await new SettingsRepo(db).set(seed);
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
    expect(screen.getByLabelText("Clave de API")).toHaveProperty("type", "password");
    expect(screen.getByLabelText("Modelo")).toHaveProperty("value", DEFAULT_MODEL);
    expect(screen.getByLabelText("Variante de español")).toHaveProperty("value", "es-ES");
    expect(screen.getByText(/servicio de voz del navegador/)).toBeTruthy();
    expect(screen.getByText(/límite de gasto mensual/)).toBeTruthy();
  });

  it("masks the key and toggles show/hide", async () => {
    const { user } = await openSettings({ apiKey: "sk-ant-secret", rememberKey: true });
    const input = screen.getByLabelText("Clave de API");
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
      await user.type(screen.getByLabelText("Clave de API"), "sk-ant-new");
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
    expect(s).toMatchObject({ apiKey: "sk-ant-new", voiceLocale: "es-AR", model: "claude-haiku-4-5", rememberKey: true });
  });

  it("does not persist the key when 'no recordar' is on", async () => {
    const { user, dbName } = await openSettings({ apiKey: "sk-ant-old", rememberKey: true });
    await user.click(screen.getByLabelText("No recordar la clave en este dispositivo"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Guardado");
    const s = await stored(dbName);
    expect(s.rememberKey).toBe(false);
    expect(s.apiKey).toBeUndefined();
    // Still usable in this page load.
    expect(screen.getByLabelText("Clave de API")).toHaveProperty("value", "sk-ant-old");
  });

  it("an empty model falls back to the default", async () => {
    const { user, dbName } = await openSettings({ model: "x" });
    await user.clear(screen.getByLabelText("Modelo"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Guardado");
    expect((await stored(dbName)).model).toBe(DEFAULT_MODEL);
  });

  it("goes back to Home", async () => {
    const { user } = await openSettings();
    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect(await screen.findByRole("button", { name: "Nueva partida" })).toBeTruthy();
  });
});
