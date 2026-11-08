import { expect, test } from "@playwright/test";
import { newSession, openCompany, showPlayers, trade } from "./helpers";

/**
 * Feature 016 (US2, FR-011, SC-002): on a 360 px phone the holdings table fits, with eight
 * companies and a sell button on every row. US7 (FR-035): the tile with its certificate donut
 * fits too, and the sheet header carries the certificate summary.
 */

test.use({ viewport: { width: 360, height: 740 } });

const COMPANIES = ["PRR", "NYC", "CPR", "B&O", "C&O", "Erie", "NNH", "B&M"];

test("eight holdings fit a 360 px phone: no sideways scroll, every sell button on screen", async ({ page }) => {
  // Opening eight companies through the sheets takes a while.
  test.setTimeout(120_000);
  await newSession(page, { players: ["Ana", "Bruno", "Carla", "Dani"] });
  await page.getByRole("button", { name: "Empezar ronda de acciones" }).click();
  // Bruno and Carla open four companies each at $67; Ana buys one IPO share of each.
  for (const [i, company] of COMPANIES.entries()) {
    const parSheet = await openCompany(page, company);
    await parSheet.getByRole("button", { name: "$67", exact: true }).click();
    await parSheet.getByRole("button", { name: i < 4 ? "Bruno" : "Carla", exact: true }).click();
    await expect(parSheet).toBeHidden();
    await trade(page, company, "IPO Ana");
  }

  await showPlayers(page);
  for (const tile of await page.locator(".player-tile").all()) {
    const fit = await tile.evaluate((el) => {
      const donut = el.querySelector(".cert-donut")!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return {
        scroll: el.scrollWidth,
        client: el.clientWidth,
        inside: donut.left >= box.left && donut.right <= box.right && donut.top >= box.top && donut.bottom <= box.bottom,
      };
    });
    expect(fit.scroll, "the tile overflows sideways").toBeLessThanOrEqual(fit.client);
    expect(fit.inside, "the donut lies inside its tile").toBe(true);
  }
  const anaTile = page.locator(".player-tile", { hasText: "Ana" });
  await expect(anaTile.getByRole("img", { name: "8 de 16 certificados" })).toBeVisible();
  await anaTile.click();
  const dialog = page.getByRole("dialog");
  const table = dialog.getByRole("table", { name: "Acciones" });
  await expect(table.getByRole("row")).toHaveCount(8);
  await expect(dialog.locator(".sheet-figures").getByText("8 / 16 cert.")).toBeVisible();

  const overflow = await dialog.evaluate((el) => {
    const scroller = el.querySelector(".sheet-body") ?? el;
    return { scroll: scroller.scrollWidth, client: scroller.clientWidth };
  });
  expect(overflow.scroll, "the sheet scrolls sideways").toBeLessThanOrEqual(overflow.client);

  const width = page.viewportSize()?.width ?? 360;
  for (const button of await table.getByRole("button", { name: /^Vender 1 / }).all()) {
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    if (!box) throw new Error("sell button not laid out");
    expect(box.x, "button starts on screen").toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, "button ends on screen").toBeLessThanOrEqual(width);
    expect(box.height, "48 px target").toBeGreaterThanOrEqual(48);
  }
});
