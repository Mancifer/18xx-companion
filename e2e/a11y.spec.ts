import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { newSession, openCompany, showCompanies, trade } from "./helpers";

/**
 * T167 (FR-101): on every main screen, in phone portrait and tablet landscape, each visible
 * interactive element is at least --tap (48 px) both ways, and every company color comes with
 * its short name. Screenshots are attached to the report for a visual check.
 */

const TAP = 48;
const SHORT_NAMES = ["PRR", "NYC", "CPR", "B&O", "C&O", "Erie", "NNH", "B&M"];

async function audit(page: Page, info: TestInfo, screen: string) {
  // Let sheet and toast transitions settle before measuring.
  await page.waitForTimeout(300);
  const { small, total } = await page.evaluate((tap) => {
    const selector = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="tab"], [role="button"]';
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const measured = [...document.querySelectorAll(selector)]
      .filter(visible)
      .map((el) => {
        // A checkbox or radio is tapped through its label.
        const target = el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") ? (el.closest("label") ?? el) : el;
        const r = target.getBoundingClientRect();
        const name = (el.getAttribute("aria-label") ?? el.textContent).trim().slice(0, 30);
        return { name: `${el.tagName.toLowerCase()} «${name}»`, w: Math.round(r.width), h: Math.round(r.height) };
      });
    return { total: measured.length, small: measured.filter((x) => x.w < tap - 0.5 || x.h < tap - 0.5) };
  }, TAP);
  expect(total, `interactive elements on ${screen}`).toBeGreaterThan(3);
  const badges = await page.locator(".company-badge").allTextContents();
  for (const text of badges) expect(SHORT_NAMES, `badge «${text}» on ${screen}`).toContain(text.trim());
  await info.attach(`${info.project.name}-${screen}.png`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  expect(small, `targets under ${TAP}px on ${screen}`).toEqual([]);
}

test("FR-101 tap targets and company names on the main screens", async ({ page }, info) => {
  await newSession(page, { players: ["Ana", "Bruno", "Carla", "Dani"] });
  await page.getByRole("button", { name: "Empezar ronda de acciones" }).click();
  await audit(page, info, "table-sr");

  const parSheet = await openCompany(page, "PRR");
  await audit(page, info, "par-sheet");
  await parSheet.getByRole("button", { name: "$100", exact: true }).click();
  await parSheet.getByRole("button", { name: "Ana", exact: true }).click();
  await trade(page, "PRR", "IPO Ana", 4);
  await trade(page, "PRR", "IPO Bruno", 1);

  await openCompany(page, "PRR");
  await audit(page, info, "stock-sheet");
  await page.getByRole("button", { name: "Cerrar" }).click();

  // A second company, so the OR has a turn to be out of (002).
  const nycPar = await openCompany(page, "NYC");
  await nycPar.getByRole("button", { name: "$90", exact: true }).click();
  await nycPar.getByRole("button", { name: "Bruno", exact: true }).click();
  await trade(page, "NYC", "IPO Bruno", 3);
  await trade(page, "NYC", "IPO Carla", 1);

  await page.getByRole("button", { name: "Empezar OR" }).click();
  await showCompanies(page);
  await audit(page, info, "table-or");

  await openCompany(page, "PRR");
  await audit(page, info, "operate-sheet");
  await page.getByRole("dialog").getByRole("button", { name: "No corrió" }).click();
  await expect(page.getByRole("dialog")).toContainText("✓ Operación registrada");
  await audit(page, info, "operate-turn-recorded");
  await page.getByRole("button", { name: "Cerrar" }).click();

  const details = await openCompany(page, "NYC");
  await audit(page, info, "company-details-or");
  await details.getByRole("button", { name: "Operar fuera de turno…" }).click();
  await expect(page.getByRole("dialog")).toContainText("Fuera de turno");
  await audit(page, info, "operate-out-of-turn");
  await page.getByRole("button", { name: "Cerrar" }).click();

  await page.getByRole("button", { name: "Menú" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Historial" }).click();
  await expect(page.getByRole("heading", { name: "Historial" })).toBeVisible();
  await audit(page, info, "history");

  await page.getByRole("button", { name: "Volver" }).click();
  await page.getByRole("button", { name: "Menú" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mercado" }).click();
  await expect(page.getByRole("heading", { name: "Mercado" })).toBeVisible();
  await audit(page, info, "market");
});
