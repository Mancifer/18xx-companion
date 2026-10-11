import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { launch, newRotla, newSession, openCompany, payBank, showCompanies, toast, trade } from "./helpers";

/**
 * T167 (FR-101): on every main screen, in phone portrait and tablet landscape, each visible
 * interactive element is at least --tap (48 px) both ways, and every company color comes with
 * its short name. Screenshots are attached to the report for a visual check.
 */

const TAP = 48;
const SHORT_NAMES = ["PRR", "NYC", "CPR", "B&O", "C&O", "Erie", "NNH", "B&M"];

/** `minTargets`: a floor that proves the screen rendered; small screens (the results) have fewer controls. */
async function audit(page: Page, info: TestInfo, screen: string, shortNames: readonly string[] = SHORT_NAMES, minTargets = 4) {
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
  expect(total, `interactive elements on ${screen}`).toBeGreaterThanOrEqual(minTargets);
  const badges = await page.locator(".company-badge").allTextContents();
  for (const text of badges) expect(shortNames, `badge «${text}» on ${screen}`).toContain(text.trim());
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

const ROTLA_NAMES = ["ADP", "AGR", "BRG", "EMN", "EXV", "EXP", "NPT", "OVN", "RES", "SPC", "SUB", "TUN", "CON", "UNI", "SYS", "INT", "FED", "EXM"];

test("RotLA sheets: Launch, Merger, End game and Results (features 004, 007)", async ({ page }, info) => {
  await newRotla(page, ["Ana", "Bruno", "Carla"]);
  await page.getByRole("button", { name: "Abrir minor" }).click();
  await audit(page, info, "rotla-launch", ROTLA_NAMES);
  await page.getByRole("button", { name: "Cerrar" }).click();
  await launch(page, "Ana", "TUN", 140);
  await launch(page, "Bruno", "EXP", 200);

  // To the Merger Round: a 3 starts green, then both ORs of the cycle.
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
  await audit(page, info, "rotla-merger", ROTLA_NAMES);
  await page.getByRole("button", { name: "Cerrar" }).click();

  await page.getByRole("button", { name: "Menú" }).click();
  // Feature 007 replaced the "Puntuación" sheet with "Terminar partida" and the results screen.
  await page.getByRole("dialog").getByRole("button", { name: "Terminar partida" }).click();
  await expect(page.getByRole("dialog", { name: "¿Terminar la partida?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Terminar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resultados" })).toBeVisible();
  await audit(page, info, "rotla-results", ROTLA_NAMES, 3);
});

test("the undo toast never covers the mic (bug toast-obscures-voice-button)", async ({ page }) => {
  await newSession(page, { players: ["Ana", "Bruno", "Carla", "Dani"] });
  await payBank(page, "Ana", 100);
  await expect(toast(page).getByRole("button", { name: "Deshacer" })).toBeVisible();
  await page.waitForTimeout(300);

  const mic = page.locator(".mic-button");
  const [m, t] = [await mic.boundingBox(), await toast(page).boundingBox()];
  if (!m || !t) throw new Error("mic or toast not laid out");
  const overlap = m.x < t.x + t.width && t.x < m.x + m.width && m.y < t.y + t.height && t.y < m.y + m.height;
  expect(overlap, `mic ${JSON.stringify(m)} vs toast ${JSON.stringify(t)}`).toBe(false);

  const onTop = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest(".mic-button") !== null, {
    x: m.x + m.width / 2,
    y: m.y + m.height / 2,
  });
  expect(onTop, "the mic's centre hits the mic").toBe(true);
});

test("new session: the chip setup plan with bank steppers, and the start notice (feature 008)", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Nueva partida" }).click();
  await page.getByRole("button", { name: "1830", exact: true }).click();
  await page.getByRole("button", { name: "Más fichas de 500 en el banco" }).click();
  await expect(page.getByText("fijada")).toBeVisible();
  await expect(page.getByRole("button", { name: "Restablecer" })).toBeVisible();
  await page.getByRole("button", { name: /Editar/ }).click();
  await expect(page.getByText("Cantidad").first()).toBeVisible();
  await audit(page, info, "new-session-chips");

  for (const [i, name] of ["Ana", "Bruno", "Carla", "Dani"].entries()) await page.getByLabel(`Nombre del jugador ${i + 1}`).fill(name);
  await page.getByRole("button", { name: "Empezar" }).click();
  const notice = page.getByRole("status", { name: "Fichas iniciales" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Cada jugador $600");
  await audit(page, info, "start-notice");
  await notice.getByRole("button", { name: "Entendido" }).click();
  await expect(notice).toBeHidden();
});
