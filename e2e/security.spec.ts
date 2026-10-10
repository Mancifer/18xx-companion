import { expect, test } from "@playwright/test";
import { newSession } from "./helpers";

/** T166 (quickstart 14, research R17): CSP in the built app, and the "no recordar" key option. */

test("the CSP blocks an injected third-party script", async ({ page }) => {
  // Chromium may still announce the request before CSP cancels it; no response may ever arrive.
  const external: string[] = [];
  page.on("response", (r) => {
    if (r.url().startsWith("https://example.com")) external.push(r.url());
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Nueva partida" })).toBeVisible();
  const blocked = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        document.addEventListener("securitypolicyviolation", (e) => resolve(`${e.violatedDirective} ${e.blockedURI}`), { once: true });
        const s = document.createElement("script");
        s.src = "https://example.com/evil.js";
        document.head.appendChild(s);
        setTimeout(() => resolve("not blocked"), 3000);
      }),
  );
  expect(blocked).toMatch(/^script-src(-elem)? https:\/\/example\.com/);
  expect(external).toEqual([]);
});

test("with 'no recordar la clave', a reload forgets the key and the mic is unavailable", async ({ page }) => {
  await newSession(page, { players: ["Ana", "Bruno", "Carla"] });
  await page.getByRole("button", { name: "Menú" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Ajustes" }).click();
  await page.getByLabel("Clave de Anthropic").fill("sk-ant-api03-forget-me");
  await page.getByLabel("No recordar las claves en este dispositivo").check();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado")).toBeVisible();

  const stored = await page.evaluate(
    () =>
      new Promise<unknown>((resolve, reject) => {
        const req = indexedDB.open("companion");
        req.onerror = () => reject(new Error("open"));
        req.onsuccess = () => {
          const get = req.result.transaction("settings").objectStore("settings").get("apiKeys");
          get.onsuccess = () => {
            req.result.close();
            resolve(get.result ?? null);
          };
        };
      }),
  );
  expect(stored).toBeNull();

  await page.reload();
  await page.getByRole("button", { name: /^Continuar/ }).click();
  await expect(page.getByRole("button", { name: "Mantén pulsado para hablar" })).toBeDisabled();
  // Without speech recognition in this browser that reason comes first; either way, no voice.
  await expect(page.locator(".mic-reason")).toHaveText(/clave de Anthropic|no reconoce la voz/);
  await page.getByRole("button", { name: "Menú" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Ajustes" }).click();
  await expect(page.getByLabel("Clave de Anthropic")).toHaveValue("");
});
