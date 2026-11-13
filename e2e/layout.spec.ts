import { expect, test, type Page } from "@playwright/test";
import { newRotla, newSession, openCompany, showCompanies, trade } from "./helpers";

/**
 * Feature 016 (US4, US6; contracts/ui.md §4): side by side on a large screen, the first player
 * card and the first company card line up and cards name their trains; on a phone the tabs stay
 * and neither the players' title nor the train label shows. US8 (FR-036): company choices show the
 * badge above the name at every width.
 */

const LARGE = { width: 1280, height: 800 };
const PHONE = { width: 360, height: 740 };

/** PRR opened by Ana at $100 with 4 more shares: floated, so "En juego" comes first. */
async function floatPrr(page: Page) {
  await page.getByRole("button", { name: "Empezar ronda de acciones" }).click();
  const parSheet = await openCompany(page, "PRR");
  await parSheet.getByRole("button", { name: "$100", exact: true }).click();
  await parSheet.getByRole("button", { name: "Ana", exact: true }).click();
  await trade(page, "PRR", "IPO Ana", 4);
}

/** PRR buys a 2 in its first OR turn, then the turn ends. */
async function prrBuysATrain(page: Page) {
  await floatPrr(page);
  await page.getByRole("button", { name: "Empezar OR" }).click();
  await page.getByRole("button", { name: "Operar PRR" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Comprar tren" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^2 \(/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "No corrió" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Terminar turno/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function expectAligned(page: Page) {
  await expect(page.getByRole("tablist")).toBeHidden();
  const player = await page.locator(".player-tile").first().boundingBox();
  const company = await page.locator(".company-card").first().boundingBox();
  if (!player || !company) throw new Error("cards not laid out");
  expect(Math.abs(player.y - company.y), `player card at ${player.y}, company card at ${company.y}`).toBeLessThanOrEqual(2);
}

test.describe("large screen", () => {
  test.use({ viewport: LARGE });

  test("a new game (only «Disponibles»): no tabs, first cards aligned", async ({ page }) => {
    await newSession(page, { players: ["Ana", "Bruno", "Carla", "Dani"] });
    await expect(page.getByRole("heading", { name: "Jugadores" })).toBeVisible();
    await expectAligned(page);
  });

  test("with a floated company («En juego» first): still aligned", async ({ page }) => {
    await newSession(page, { players: ["Ana", "Bruno", "Carla", "Dani"] });
    await floatPrr(page);
    await expect(page.getByRole("group", { name: "En juego" })).toBeVisible();
    await expectAligned(page);
  });

  test("a company with trains shows «Trenes»", async ({ page }) => {
    await newSession(page, { players: ["Ana", "Bruno", "Carla", "Dani"] });
    await prrBuysATrain(page);
    const card = page.locator(".company-card", { has: page.getByTestId("treasury-PRR") });
    await expect(card.locator(".company-trains-label")).toBeVisible();
    await expect(card.locator(".company-trains-label")).toHaveText("Trenes");
  });
});

test.describe("phone", () => {
  test.use({ viewport: PHONE });

  test("tabs stay; no players' title, but the train label shows", async ({ page }) => {
    await newSession(page, { players: ["Ana", "Bruno", "Carla", "Dani"] });
    await prrBuysATrain(page);
    await expect(page.getByRole("tablist")).toBeVisible();
    await expect(page.locator(".players-pane-title")).toBeHidden();
    await showCompanies(page);
    const card = page.locator(".company-card", { has: page.getByTestId("treasury-PRR") });
    await expect(card.locator(".train-cards")).toBeVisible();
    await expect(card.locator(".company-trains-label")).toHaveText("Trenes");
    await expect(card.locator(".company-trains-label")).toBeVisible();
  });
});

for (const [label, viewport] of [["large screen", LARGE], ["phone", PHONE]] as const) {
  test.describe(`Abrir minor on a ${label} (US8)`, () => {
    test.use({ viewport });

    test("every minor shows its badge above its name", async ({ page }) => {
      await newRotla(page, ["Ana", "Bruno", "Carla"]);
      await page.getByRole("button", { name: "Abrir minor" }).click();
      const choices = page.getByRole("dialog").getByRole("group", { name: "Minor" }).locator(".choice-company");
      expect(await choices.count()).toBeGreaterThan(0);
      for (const choice of await choices.all()) {
        const badge = await choice.locator(".company-badge").boundingBox();
        const name = await choice.locator(".choice-company-name").boundingBox();
        if (!badge || !name) throw new Error("choice not laid out");
        expect(badge.y + badge.height, "badge above the name").toBeLessThanOrEqual(name.y + 0.5);
      }
    });
  });
}
