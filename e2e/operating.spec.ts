import { expect, test } from "@playwright/test";
import { newSession, openCompany, showCompanies, showPlayers, toast, trade, typeAmount } from "./helpers";

test("quickstart 3: PRR pays 240 with Ana 60%, Bruno 20%, pool 20% (US3-1)", async ({ page }) => {
  await newSession(page, { players: ["Ana", "Bruno", "Carla", "Dani"] });
  await page.getByRole("button", { name: "Empezar ronda de acciones" }).click();

  const parSheet = await openCompany(page, "PRR");
  await parSheet.getByRole("button", { name: "$100", exact: true }).click();
  await parSheet.getByRole("button", { name: "Ana", exact: true }).click();
  await trade(page, "PRR", "IPO Ana", 4);
  await trade(page, "PRR", "IPO Bruno", 2);
  await trade(page, "PRR", "IPO Dani", 2);
  await trade(page, "PRR", "Vender Dani", 2);
  await expect(page.getByTestId("price-PRR")).toHaveText("$82");

  await page.getByRole("button", { name: "Fin de ronda de acciones" }).click();
  await expect(page.getByTestId("treasury-PRR")).toHaveText("$1.000");
  await page.getByRole("button", { name: "Empezar OR" }).click();

  const operate = await openCompany(page, "PRR");
  await typeAmount(page, 240);
  await operate.getByRole("button", { name: "Pagar", exact: true }).click(); // one tap after the revenue
  await expect(toast(page)).toContainText("PRR paga $240 ($24/acción)");
  await expect(page.getByTestId("treasury-PRR")).toHaveText("$1.048");
  await expect(page.getByTestId("price-PRR")).toHaveText("$90");
  // The turn stays open after the payout; finishing it ends the set (PRR is the only company).
  await operate.getByRole("button", { name: /^Terminar turno/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await showPlayers(page);
  await expect(page.getByTestId("cash-p1")).toHaveText("$144");
  await expect(page.getByTestId("cash-p2")).toHaveText("$448");
  await expect(page.getByRole("button", { name: "Avisos de cuadre" })).toHaveCount(0);
});

test("quickstart 5: 1848 loan, then receivership from the company sheet (US3-6)", async ({ page }) => {
  await newSession(page, { game: "1848 Australia", players: ["Ana", "Bruno", "Carla", "Dani"] });
  await expect(page.getByTestId("bank")).toHaveText("£7.480");
  await page.getByRole("button", { name: "Empezar ronda de acciones" }).click();

  const parSheet = await openCompany(page, "QR");
  await parSheet.getByRole("button", { name: "£100", exact: true }).click();
  await parSheet.getByRole("button", { name: "Ana", exact: true }).click();
  await trade(page, "QR", "IPO Ana", 4);
  await expect(page.getByTestId("treasury-QR")).toHaveText("£1.000");

  await page.getByRole("button", { name: "Empezar OR" }).click();
  // The BoE operates first (§5.4): its dividend, then its turn ends and QR's begins.
  await page.getByRole("button", { name: "Operar BoE" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Pagar dividendo/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Terminar turno/ }).click();
  const turn = await openCompany(page, "QR");
  await turn.getByRole("button", { name: "Comprar tren" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^3 \(5\)/ }).click();
  await expect(toast(page)).toContainText("fase 3");

  // Still QR's turn: the loan is one more action in it.
  await page.getByRole("dialog").getByRole("button", { name: /^Préstamo/ }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: /Devolver/ })).toHaveCount(0);
  await page.getByRole("dialog").getByRole("button", { name: /^Pedir 1/ }).click();
  await expect(page.getByTestId("treasury-QR")).toHaveText("£900");
  await expect(page.getByTestId("treasury-BOE")).toHaveText("£1.900");
  await expect(page.getByTestId("price-QR")).toHaveText("£80");
  await expect(page.getByTestId("price-BOE")).toHaveText("£80");
  await page.getByRole("dialog").getByRole("button", { name: "Cerrar" }).click();
  await showCompanies(page);
  await expect(page.locator(".company-card", { has: page.getByTestId("treasury-QR") })).toContainText("Préstamos: 1");

  const details = await openCompany(page, "QR");
  await details.getByRole("button", { name: "Detalles y ajustes…" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Entrar en administración" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Entrar en administración" }).click();
  await expect(toast(page)).toContainText("QR en administración");
  await expect(page.getByTestId("treasury-QR")).toHaveText("£0");
  await expect(page.locator(".company-card", { has: page.getByTestId("treasury-QR") })).toContainText("administrada");
  await expect(page.getByRole("button", { name: "Avisos de cuadre" })).toHaveCount(0);
});

test("the operating turn: no Siguiente, a no-run company, an out-of-turn action in History (002)", async ({ page }) => {
  await newSession(page, { players: ["Ana", "Bruno", "Carla", "Dani"] });
  await page.getByRole("button", { name: "Empezar ronda de acciones" }).click();
  for (const [company, par, president, other] of [
    ["PRR", "$100", "Ana", "IPO Bruno"],
    ["NYC", "$90", "Carla", "IPO Dani"],
  ] as const) {
    const parSheet = await openCompany(page, company);
    await parSheet.getByRole("button", { name: par, exact: true }).click();
    await parSheet.getByRole("button", { name: president, exact: true }).click();
    await trade(page, company, `IPO ${president}`, 2);
    await trade(page, company, other, 2);
  }
  await page.getByRole("button", { name: "Fin de ronda de acciones" }).click();
  await page.getByRole("button", { name: "Empezar OR" }).click();

  await expect(page.getByRole("button", { name: "Siguiente" })).toHaveCount(0);
  await expect(page.getByText("Después: NYC")).toBeVisible();

  // PRR: revenue typed, a train bought, the revenue still there, then paid and finished.
  await page.getByRole("button", { name: "Operar PRR" }).click();
  await typeAmount(page, 80);
  await page.getByRole("dialog").getByRole("button", { name: "Comprar tren" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^2 \(/ }).click();
  await expect(page.getByRole("dialog").getByTestId("keypad-value")).toHaveText("$80");
  await expect(page.getByRole("dialog").getByRole("button", { name: /^Terminar turno/ })).toBeDisabled();
  await page.getByRole("dialog").getByRole("button", { name: "Pagar", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Terminar turno/ }).click();

  // An out-of-turn cost for PRR while NYC is current.
  const details = await openCompany(page, "PRR");
  await details.getByRole("button", { name: "Operar fuera de turno…" }).click();
  await expect(page.getByRole("dialog")).toContainText("Fuera de turno: le toca a NYC.");
  await page.getByRole("dialog").getByRole("button", { name: "Pagar costo" }).click();
  await typeAmount(page, 20);
  await page.getByRole("dialog").getByRole("button", { name: /^Pagar \$20/ }).click();
  await expect(toast(page)).toContainText("PRR paga $20");

  // NYC did not run: its price drops one step.
  await expect(page.getByTestId("price-NYC")).toHaveText("$90");
  await page.getByRole("button", { name: "Operar NYC" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "No corrió" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Terminar turno/ }).click();
  await expect(page.getByTestId("price-NYC")).toHaveText("$82");

  await page.getByRole("button", { name: "Menú" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Historial" }).click();
  await expect(page.locator(".history-item", { hasText: "PRR paga $20" })).toContainText("PRR opera fuera de turno (le toca a NYC).");
});
