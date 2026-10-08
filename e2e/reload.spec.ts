import { expect, test } from "@playwright/test";
import { newSession, payBank } from "./helpers";

test("quickstart 2: the session resumes identically after a reload (US1-3, SC-007)", async ({ page }) => {
  await newSession(page, { players: ["Ana", "Bruno", "Carla", "Dani"] });
  await payBank(page, "Ana", 100);
  await expect(page.getByTestId("cash-p1")).toHaveText("$500");

  await page.reload();
  await page.getByRole("button", { name: /^Continuar/ }).click();
  await expect(page.getByTestId("cash-p1")).toHaveText("$500");
  await expect(page.getByTestId("cash-p2")).toHaveText("$600");
  await expect(page.getByTestId("bank")).toHaveText("$9.700");
});
