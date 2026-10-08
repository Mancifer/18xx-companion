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
