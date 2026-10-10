import { expect, type Page } from "@playwright/test";

/** Starts a session from Home: game by visible name, players in seat order. */
export async function newSession(
  page: Page,
  { game = "1830", players, bankOnly = false }: { game?: string; players: string[]; bankOnly?: boolean },
) {
  await page.goto("/");
  await page.getByRole("button", { name: "Nueva partida" }).click();
  await page.getByRole("button", { name: game, exact: true }).click();
  const rows = page.locator(".player-row");
  while ((await rows.count()) < players.length) await page.getByRole("button", { name: "Añadir jugador" }).click();
  while ((await rows.count()) > players.length) await rows.last().getByRole("button", { name: "Quitar" }).click();
  for (const [i, name] of players.entries()) {
    await page.getByLabel(`Nombre del jugador ${i + 1}`).fill(name);
  }
  if (bankOnly) await page.getByRole("button", { name: "Solo banco" }).click();
  await page.getByRole("button", { name: "Empezar" }).click();
  await expect(page.getByTestId("bank").or(page.getByText("ilimitado"))).toBeVisible();
}

/** Types an amount on the on-screen keypad. */
export async function typeAmount(page: Page, amount: number) {
  for (const digit of String(amount)) {
    await page.locator(".keypad-grid").getByRole("button", { name: digit, exact: true }).click();
  }
}

/** Pays from a player to the bank through the player sheet. */
export async function payBank(page: Page, player: string, amount: number) {
  await page.locator(".player-tile", { hasText: player }).click();
  await page.getByRole("button", { name: "Pagar…" }).click();
  await page.getByRole("button", { name: "el banco", exact: true }).click();
  await typeAmount(page, amount);
  await page.getByRole("button", { name: /^Pagar .* al banco$/ }).click();
}

/** On phones the company grid is a tab; on tablets both panes are visible. */
export async function showCompanies(page: Page) {
  const tab = page.getByRole("tab", { name: "Compañías" });
  if (await tab.isVisible()) await tab.click();
}

export async function showPlayers(page: Page) {
  const tab = page.getByRole("tab", { name: "Jugadores" });
  if (await tab.isVisible()) await tab.click();
}

/** Opens a company's sheet from its card and returns the dialog. */
export async function openCompany(page: Page, company: string) {
  await showCompanies(page);
  await page.locator(".company-card", { has: page.getByTestId(`treasury-${company}`) }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Sets the share-count stepper in the stock sheet, then taps a row button. */
export async function trade(page: Page, company: string, button: string, count = 1) {
  const dialog = await openCompany(page, company);
  for (let i = 1; i < count; i++) await dialog.getByRole("button", { name: "Más", exact: true }).click();
  await dialog.getByRole("button", { name: button, exact: true }).click();
  await expect(dialog).toBeHidden();
}

/** The feedback toast (the keypad display also has the status role). */
export function toast(page: Page) {
  return page.locator(".toast");
}

/** Starts a RotLA Short game from Home (feature 004). */
export async function newRotla(page: Page, players: string[]) {
  await page.goto("/");
  await page.getByRole("button", { name: "Nueva partida" }).click();
  await page.getByRole("button", { name: /Railways of the Lost Atlas/ }).click();
  await page.getByLabel("Modo").selectOption("short");
  const rows = page.locator(".player-row");
  while ((await rows.count()) > players.length) await rows.last().getByRole("button", { name: "Quitar" }).click();
  for (const [i, name] of players.entries()) await page.getByLabel(`Nombre del jugador ${i + 1}`).fill(name);
  await page.getByRole("button", { name: "Empezar" }).click();
  await expect(page.getByTestId("round")).toHaveText("Ciclo 1 de 4 · RA");
}

/** An auction win through the Launch sheet. */
export async function launch(page: Page, player: string, minor: string, bid: number) {
  await page.getByRole("button", { name: "Abrir minor" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: player, exact: true }).click();
  await dialog.getByRole("group", { name: "Minor" }).getByRole("button", { name: new RegExp(`^${minor} `) }).click();
  await dialog.getByRole("button", { name: "Vaciar" }).click();
  await typeAmount(page, bid);
  await dialog.getByRole("button", { name: "Abrir", exact: true }).click();
  await expect(dialog).toBeHidden();
}
