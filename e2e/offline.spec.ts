import { expect, test, type Page } from "@playwright/test";
import { newSession, openCompany, showCompanies, toast, trade, typeAmount } from "./helpers";

/**
 * T164 (FR-093, quickstart 11): after the first load the app works offline, except the voice.
 * Also the plan's timing goals on the phone project: cold start to a rendered Table < 1 s, and
 * tap to updated tile < 100 ms.
 */

async function saveKey(page: Page, key: string) {
  await page.getByRole("button", { name: "Menú" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Ajustes" }).click();
  await page.getByLabel("Clave de API").fill(key);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado")).toBeVisible();
  await page.getByRole("button", { name: "Volver" }).click();
}

/** PRR floated with Ana as president, then the OR starts. */
async function floatPrr(page: Page) {
  await page.getByRole("button", { name: "Empezar ronda de acciones" }).click();
  const parSheet = await openCompany(page, "PRR");
  await parSheet.getByRole("button", { name: "$100", exact: true }).click();
  await parSheet.getByRole("button", { name: "Ana", exact: true }).click();
  await trade(page, "PRR", "IPO Ana", 4);
  await page.getByRole("button", { name: "Fin de ronda de acciones" }).click();
  await page.getByRole("button", { name: "Empezar OR" }).click();
}

test("quickstart 11: offline reload keeps the session and touch; the mic is unavailable", async ({ page, context }, info) => {
  await newSession(page, { players: ["Ana", "Bruno", "Carla", "Dani"] });
  // The service worker must be active (precache done) before going offline.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await saveKey(page, "sk-ant-api03-offline-test");

  await context.setOffline(true);
  const started = Date.now();
  await page.reload();
  await page.getByRole("button", { name: /^Continuar/ }).click();
  await expect(page.getByRole("button", { name: "Menú" })).toBeVisible();
  const coldStartMs = Date.now() - started;
  if (info.project.name === "phone") expect(coldStartMs, "cold start to Table").toBeLessThan(1000);

  const mic = page.getByRole("button", { name: "Mantén pulsado para hablar" });
  await expect(mic).toBeDisabled();
  // Offline, or (in a browser without speech recognition) that reason first: unavailable either way.
  await expect(page.locator(".mic-reason")).toHaveText(/Sin conexión|no reconoce la voz/);

  await floatPrr(page);
  const operate = await openCompany(page, "PRR");
  await typeAmount(page, 240);

  // Time from the tap to Ana's tile showing her dividend, measured inside the page.
  await page.evaluate(() => {
    const w = window as unknown as { tapTiming?: { start?: number; end?: number } };
    const timing: { start?: number; end?: number } = {};
    w.tapTiming = timing;
    document.addEventListener("click", () => (timing.start ??= performance.now()), { capture: true, once: true });
    const tile = document.querySelector('[data-testid="cash-p1"]')!;
    const before = tile.textContent;
    new MutationObserver((_m, obs) => {
      if (document.querySelector('[data-testid="cash-p1"]')?.textContent !== before) {
        timing.end = performance.now();
        obs.disconnect();
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await operate.getByRole("button", { name: "Pagar", exact: true }).click();
  await expect(toast(page)).toContainText("PRR paga $240");
  // The turn stays open after the payout; finishing it closes the sheet.
  await operate.getByRole("button", { name: /^Terminar turno/ }).click();
  await showCompanies(page);
  await expect(page.getByTestId("treasury-PRR")).toHaveText("$1.000");
  const tapMs = await page.evaluate(() => {
    const t = (window as unknown as { tapTiming: { start?: number; end?: number } }).tapTiming;
    return t.start !== undefined && t.end !== undefined ? t.end - t.start : Number.POSITIVE_INFINITY;
  });
  if (info.project.name === "phone") expect(tapMs, "tap to updated tile").toBeLessThan(100);
  await context.setOffline(false);
});

test("the manifest and its icons are served (T165)", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();
  const manifest = (await (await request.get(`/${href!.replace(/^\//, "")}`)).json()) as { icons: { src: string; purpose?: string }[] };
  expect(manifest.icons.map((i) => i.src)).toEqual(["icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"]);
  expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
  for (const src of [...manifest.icons.map((i) => i.src), "icons/apple-touch-icon.png"]) {
    const res = await request.get(`/${src}`);
    expect(res.status(), src).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  }
});
