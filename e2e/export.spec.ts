/// <reference types="node" />
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { newSession, payBank, showPlayers } from "./helpers";

const KEY = "sk-ant-api03-e2e-secret";

test("quickstart 10: export mid-game without the key, import into a fresh profile (US8)", async ({ page, browser }) => {
  await newSession(page, { players: ["Ana", "Bruno", "Carla", "Dani"] });
  await payBank(page, "Ana", 100);
  await expect(page.getByTestId("cash-p1")).toHaveText("$500");

  // A key saved on this device (as Settings would) must never reach the file (FR-092).
  await page.evaluate(
    (key) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("companion");
        req.onerror = () => reject(new Error("open"));
        req.onsuccess = () => {
          const tx = req.result.transaction("settings", "readwrite");
          tx.objectStore("settings").put({ key: "apiKey", value: key });
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
          tx.onerror = () => reject(new Error("write"));
        };
      }),
    KEY,
  );

  await page.getByRole("button", { name: "Menú" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("dialog").getByRole("button", { name: "Exportar partida" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^18xx-1830-\d{8}-\d{4}\.json$/);
  const path = await download.path();
  const text = await readFile(path, "utf8");
  expect(text).not.toContain("sk-ant");
  expect(text).not.toContain(KEY);

  // A different browser profile: nothing shared with the first page's IndexedDB.
  const fresh = await browser.newContext({ baseURL: "http://localhost:4173" });
  const other = await fresh.newPage();
  await other.goto("/");
  await other.getByLabel("Archivo de partida").setInputFiles(path);
  const dialog = other.getByRole("dialog");
  await expect(dialog).toContainText("1830");
  await expect(dialog.getByRole("alert")).toHaveCount(0); // the state hash matches
  await dialog.getByRole("button", { name: "Importar", exact: true }).click();

  await showPlayers(other);
  await expect(other.getByTestId("cash-p1")).toHaveText("$500");
  await expect(other.getByTestId("bank")).toHaveText("$9.700");
  await other.getByRole("button", { name: "Menú" }).click();
  await other.getByRole("dialog").getByRole("button", { name: "Historial" }).click();
  await expect(other.getByText("Ana paga $100 al banco")).toBeVisible();
  await fresh.close();
});
