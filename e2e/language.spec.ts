import { expect, test, type Page } from "@playwright/test";

/**
 * Feature 014 T048 (contracts/ui.md, SC-003, SC-005, SC-008): first launch follows the device's
 * language; the Settings switch applies at once and survives a reload; the main screens fit and
 * keep 48 px targets in both languages.
 */

const TAP = 48;

/** No horizontal page scroll, and every visible button at least 48 px both ways. */
async function fits(page: Page, where: string) {
  await page.waitForTimeout(300);
  const { overflow, small } = await page.evaluate((tap) => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const tooSmall = [...document.querySelectorAll("button")]
      .filter(visible)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { name: (el.getAttribute("aria-label") ?? el.textContent).trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) };
      })
      .filter((b) => b.w < tap - 0.5 || b.h < tap - 0.5);
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, small: tooSmall };
  }, TAP);
  expect(overflow, `horizontal scroll on ${where}`).toBeLessThanOrEqual(0);
  expect(small, `buttons under ${TAP}px on ${where}`).toEqual([]);
}

/** The saved language, read from the app's IndexedDB settings store. */
function storedLanguage(page: Page): Promise<unknown> {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open("companion");
        open.onsuccess = () => {
          const get = open.result.transaction("settings").objectStore("settings").get("language");
          get.onsuccess = () => {
            resolve((get.result as { value?: unknown } | undefined)?.value);
            open.result.close();
          };
          get.onerror = () => resolve(undefined);
        };
        open.onerror = () => resolve(undefined);
      }),
  );
}

/** Starts a 4-player 1830 from Home in whichever language is showing. */
async function start1830(page: Page, newGame: string, start: string) {
  await page.getByRole("button", { name: newGame }).click();
  await page.getByRole("button", { name: "1830", exact: true }).click();
  for (const [i, name] of ["Ana", "Bruno", "Carla", "Dani"].entries()) await page.getByLabel(`Player ${i + 1} name`).fill(name);
  await page.getByRole("button", { name: start, exact: true }).click();
  await expect(page.getByTestId("bank")).toBeVisible();
}

test.describe("English device", () => {
  test.use({ locale: "en-US" });

  test("opens in English; Español in Settings applies at once and survives a reload", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "New game" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    const t0 = await page.evaluate(() => performance.now());
    await page.getByRole("radio", { name: "Español" }).click();
    await expect(page.getByRole("heading", { name: "Ajustes" })).toBeVisible();
    const elapsed = (await page.evaluate(() => performance.now())) - t0;
    expect(elapsed, "switch time (SC-003)").toBeLessThan(1000);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");

    // The choice is saved right after it applies; reload once it is stored.
    await expect.poll(() => storedLanguage(page)).toBe("es");
    await page.reload();
    await expect(page.getByRole("button", { name: "Nueva partida" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
  });

  test("Table, History and an open sheet fit in both languages (SC-005)", async ({ page }) => {
    await page.goto("/");
    await start1830(page, "New game", "Start");
    await fits(page, "Table (en)");
    await page.getByRole("button", { name: "Menu" }).click();
    await fits(page, "menu sheet (en)");
    await page.getByRole("dialog").getByRole("button", { name: "History" }).click();
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
    await fits(page, "History (en)");

    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Settings" }).click();
    await page.getByRole("radio", { name: "Español" }).click();
    await page.getByRole("button", { name: "Volver" }).click();
    await fits(page, "Table (es)");
    await page.getByRole("button", { name: "Menú" }).click();
    await fits(page, "menu sheet (es)");
    await page.getByRole("dialog").getByRole("button", { name: "Historial" }).click();
    await expect(page.getByRole("heading", { name: "Historial" })).toBeVisible();
    await fits(page, "History (es)");
  });
});

test.describe("Spanish device", () => {
  test.use({ locale: "es-UY" });

  test("a fresh install opens in Spanish (SC-008)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Nueva partida" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
  });
});
