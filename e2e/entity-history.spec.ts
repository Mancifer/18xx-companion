import { expect, test } from "@playwright/test";
import { newSession, openCompany, trade, typeAmount } from "./helpers";

/**
 * Feature 017 (T034): on a phone, a company's last run on its card, then its History (read-only)
 * and the hand-off to the full History, and back to the Table with its sheet open.
 */

test.use({ viewport: { width: 360, height: 740 } });

test("last run on the card, the company's History, the full History and back", async ({ page }) => {
  await newSession(page, { players: ["Ana", "Bruno", "Carla", "Dani"] });
  await page.getByRole("button", { name: "Empezar ronda de acciones" }).click();
  const parSheet = await openCompany(page, "PRR");
  await parSheet.getByRole("button", { name: "$100", exact: true }).click();
  await parSheet.getByRole("button", { name: "Ana", exact: true }).click();
  await trade(page, "PRR", "IPO Ana", 4);

  await page.getByRole("button", { name: "Empezar OR" }).click();
  await expect(page.getByTestId("last-run-PRR")).toHaveCount(0);
  const operate = await openCompany(page, "PRR");
  await typeAmount(page, 160);
  await operate.getByRole("button", { name: "Pagar", exact: true }).click();
  await expect(page.getByTestId("last-run-PRR")).toHaveText("$160");

  // Card → «Historial»: only the PRR's entries, and no undo anywhere.
  await operate.getByRole("button", { name: "Historial", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Historial · PRR/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Deshacer", exact: true })).toHaveCount(0);
  const runEntry = page.locator(".history-item", { hasText: "$160" });
  await runEntry.locator("summary").click();
  await expect(runEntry.locator("li.history-mine").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Deshacer hasta acá" })).toHaveCount(0);

  // The full History opens on that entry, expanded, with its usual undo.
  await runEntry.getByRole("button", { name: "Ver en el historial completo" }).click();
  await expect(page.getByRole("heading", { name: "Historial", exact: true })).toBeVisible();
  await expect(page.locator(".history-item", { hasText: "$160" }).locator("details")).toHaveAttribute("open", "");
  await expect(page.getByRole("button", { name: "Deshacer", exact: true })).toHaveCount(1);

  // Back, back: the PRR History, then the Table with the turn sheet open again.
  await page.getByRole("button", { name: "Volver" }).click();
  await expect(page.getByRole("heading", { name: /^Historial · PRR/ })).toBeVisible();
  await page.getByRole("button", { name: "Volver" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Historial", exact: true })).toBeVisible();

  // No sideways scroll on the phone in the filtered History.
  await page.getByRole("dialog").getByRole("button", { name: "Historial", exact: true }).click();
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
  await page.getByRole("button", { name: "Volver" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
