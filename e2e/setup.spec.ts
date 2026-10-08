import { expect, test } from "@playwright/test";
import { newSession, payBank } from "./helpers";

test("quickstart 1: 1830 with four players, then a payment to the bank (US1-1, US1-2, US1-6)", async ({ page }) => {
  await newSession(page, { players: ["Ana", "Bruno", "Carla", "Dani"] });
  for (const id of ["p1", "p2", "p3", "p4"]) await expect(page.getByTestId(`cash-${id}`)).toHaveText("$600");
  await expect(page.getByTestId("bank")).toHaveText("$9.600");

  await payBank(page, "Ana", 100);
  await expect(page.getByTestId("cash-p1")).toHaveText("$500");
  await expect(page.getByTestId("bank")).toHaveText("$9.700");
  const toast = page.getByRole("status");
  await expect(toast).toContainText("Ana paga $100 al banco");
  await expect(toast.getByRole("button", { name: "Deshacer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Avisos de cuadre" })).toHaveCount(0);
});

test("undo from the toast reverts the payment (US1-6)", async ({ page }) => {
  await newSession(page, { players: ["Ana", "Bruno", "Carla", "Dani"] });
  await payBank(page, "Ana", 100);
  await page.getByRole("status").getByRole("button", { name: "Deshacer" }).click();
  await expect(page.getByTestId("cash-p1")).toHaveText("$600");
  await expect(page.getByTestId("bank")).toHaveText("$9.600");
});

test("bank-only mode hides player cash (US1-4)", async ({ page }) => {
  await newSession(page, { players: ["Ana", "Bruno", "Carla"], bankOnly: true });
  await expect(page.getByTestId("cash-p1")).toHaveText("—");
  await expect(page.getByTestId("bank")).toHaveText("$9.600");
});
