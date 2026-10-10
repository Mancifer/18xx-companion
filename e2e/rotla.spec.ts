import { expect, test } from "@playwright/test";
import { launch, newRotla, openCompany, showCompanies, typeAmount } from "./helpers";

/** T101: a RotLA Short game by touch: two launches, OR 1, a payout, the Market strip. */

test("RotLA Short: launch, operate, pay out, see the track", async ({ page }) => {
  await newRotla(page, ["Ana", "Bruno", "Carla"]);
  await launch(page, "Ana", "TUN", 140);
  await launch(page, "Bruno", "EXP", 165);
  await showCompanies(page);
  await expect(page.getByTestId("treasury-TUN")).toHaveText("$140");
  await expect(page.getByTestId("price-EXP")).toHaveText("$80");

  await page.getByRole("button", { name: "Empezar RO 1" }).click();
  await expect(page.getByTestId("round")).toHaveText("Ciclo 1 de 4 · RO 1/2");
  const sheet = await openCompany(page, "EXP");
  await typeAmount(page, 100);
  await sheet.getByRole("button", { name: "Pagar", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("EXP paga $100");
  await page.getByRole("button", { name: "Cerrar" }).click();

  await page.getByRole("button", { name: "Menú" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mercado" }).click();
  const strip = page.getByTestId("market-strip");
  await expect(strip.getByRole("button", { name: /^Casilla/ })).toHaveCount(27);
  await expect(strip.getByRole("button", { name: /^Casilla \$90/ }).getByRole("button", { name: "Ficha EXP" })).toBeVisible();
});

/** Bug companies-tab-status-order: closed minors move to "Cerradas", after every open and available company. */
test("RotLA: after a merger the minors are listed as closed, the major as in play", async ({ page }) => {
  await newRotla(page, ["Ana", "Bruno", "Carla"]);
  await launch(page, "Ana", "TUN", 140);
  await launch(page, "Bruno", "EXP", 200);
  await page.getByRole("button", { name: "Empezar RO 1" }).click();
  const exp = await openCompany(page, "EXP");
  await exp.getByRole("button", { name: "Comprar tren" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^3 \(/ }).click();
  await page.getByRole("button", { name: "Cerrar" }).click();
  await page.getByRole("button", { name: "Empezar RO 2" }).click();
  await page.getByRole("button", { name: "Ronda de fusiones" }).click();
  await page.getByRole("button", { name: "Fusionar…" }).click();
  const merger = page.getByRole("dialog");
  await merger.getByRole("group", { name: "Minors" }).getByRole("button", { name: "EXP", exact: true }).click();
  await merger.getByRole("group", { name: "Minors" }).getByRole("button", { name: "TUN", exact: true }).click();
  await merger.getByRole("group", { name: "Corporación" }).getByRole("button", { name: /^UNI/ }).click();
  await merger.getByRole("button", { name: "Fusionar", exact: true }).click();
  await expect(merger).toBeHidden();

  await showCompanies(page);
  const pane = page.locator('[data-pane="companies"]');
  await expect(pane.getByRole("group")).toHaveCount(3);
  await expect(pane.getByRole("group").last()).toHaveAccessibleName("Cerradas");
  const closed = page.getByTestId("company-group-closed");
  await expect(closed.getByTestId("treasury-EXP")).toBeVisible();
  await expect(closed.getByTestId("treasury-TUN")).toBeVisible();
  await expect(page.getByTestId("company-group-inPlay").getByTestId("treasury-UNI")).toBeVisible();
  await expect(page.getByTestId("company-group-available").getByTestId("treasury-EXP")).toHaveCount(0);
});
