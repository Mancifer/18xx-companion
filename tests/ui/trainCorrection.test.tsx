import { screen, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { openSeededTable } from "./helpers";

/** Feature 011, US3: the train correction view (contracts/ui.md §3). */

type User = ReturnType<typeof userEvent.setup>;

const buy = (player: string, company: string) => ({ type: "buyShare", buyer: `player:${player}`, company, source: "ipo", count: 2 });
const buyTrain = (company: string, trainType: string) => ({
  type: "buyTrain",
  company,
  trainType,
  variant: null,
  from: "bank",
  seller: null,
  price: null,
  tradeIn: null,
});
/** PRR floated through a real SR, in OR 1.1, with the given trains bought. */
const inOR = (company: string, trains: readonly string[] = ["2", "2"]) => [
  { type: "startSR" },
  { type: "parCompany", player: "p1", company, price: 100 },
  buy("p1", company),
  buy("p2", company),
  { type: "endSR" },
  { type: "startOR" },
  ...trains.map((t) => buyTrain(company, t)),
];

const card = (company: string) => screen.getByTestId(`treasury-${company}`).closest("button")!;
const summary = (text: RegExp) => screen.findByText(text, { selector: ".toast-summary" });

async function openFromDetails(user: User, company = "PRR"): Promise<HTMLElement> {
  await user.click(card(company));
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Detalles y ajustes…" }));
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Corregir trenes…" }));
  return screen.findByRole("dialog", { name: /Corregir trenes · PRR/ });
}

describe("train correction view (US3)", () => {
  it("is reachable from the trains line in the operating sheet", async () => {
    const { user } = await openSeededTable({ actions: inOR("PRR") });
    await user.click(card("PRR"));
    const operate = await screen.findByRole("dialog");
    await user.click(within(within(operate).getByTestId("trains-line")).getByRole("button", { name: "Corregir…" }));
    expect(await screen.findByRole("dialog", { name: /Corregir trenes · PRR/ })).toBeTruthy();
  });

  it("remove → bank with the default refund, in ≤ 5 taps from the Table (SC-004)", async () => {
    const { user } = await openSeededTable({ actions: inOR("PRR") });
    let taps = 0;
    const tap = async (el: Element) => {
      taps += 1;
      await user.click(el);
    };
    await tap(card("PRR"));
    await tap(within(await screen.findByRole("dialog")).getByRole("button", { name: "Detalles y ajustes…" }));
    await tap(within(await screen.findByRole("dialog")).getByRole("button", { name: "Corregir trenes…" }));
    const view = await screen.findByRole("dialog", { name: /Corregir trenes · PRR/ });
    await tap(within(view).getAllByRole("button", { name: "Quitar el 2" })[0]!);
    await tap(within(view).getByRole("button", { name: "Al banco (oferta) · devolver $80" }));
    expect(await summary(/Corrección: la PRR devuelve un 2 a la oferta y recibe \$80/)).toBeTruthy();
    expect(screen.getByTestId("treasury-PRR").textContent).toContain("$920");
    expect(taps).toBeLessThanOrEqual(5);
  });

  it("turning the refund off sends no money; an edited amount is sent as typed", async () => {
    const off = await openSeededTable({ actions: inOR("PRR") });
    let view = await openFromDetails(off.user);
    await off.user.click(within(view).getAllByRole("button", { name: "Quitar el 2" })[0]!);
    await off.user.click(within(view).getByRole("checkbox", { name: "devolver" }));
    await off.user.click(within(view).getByRole("button", { name: /^Al banco \(oferta\)/ }));
    expect(await summary(/^Corrección: la PRR devuelve un 2 a la oferta$/)).toBeTruthy();
    off.view.unmount();

    const edited = await openSeededTable({ actions: inOR("PRR") });
    view = await openFromDetails(edited.user);
    await edited.user.click(within(view).getAllByRole("button", { name: "Quitar el 2" })[0]!);
    await edited.user.click(within(view).getByRole("button", { name: "editar…" }));
    for (const d of "50") await edited.user.click(within(view).getAllByRole("button", { name: new RegExp(`^${d}$`) })[0]!);
    await edited.user.click(within(view).getByRole("button", { name: "Al banco (oferta) · devolver $50" }));
    expect(await summary(/Corrección: la PRR devuelve un 2 a la oferta y recibe \$50/)).toBeTruthy();
  });

  it("Al pool in 1830, not in 1848 (US3-3)", async () => {
    const g1830 = await openSeededTable({ actions: inOR("PRR") });
    let view = await openFromDetails(g1830.user);
    await g1830.user.click(within(view).getAllByRole("button", { name: "Quitar el 2" })[0]!);
    await g1830.user.click(within(view).getByRole("button", { name: "Al pool" }));
    expect(await summary(/Corrección: el 2 de la PRR va al pool/)).toBeTruthy();
    g1830.view.unmount();

    const g1848 = await openSeededTable({
      game: "1848",
      actions: [
        { type: "transferShares", company: "QR", from: "ipo:QR", to: "player:p1", units: 6, presidency: true },
        { type: "adjustMoney", holder: "company:QR", delta: 500, setTo: null },
        { type: "correctTrain", company: "QR", train: "2", op: "add", to: null, amount: null },
      ],
    });
    await g1848.user.click(screen.getByRole("tab", { name: "Compañías" }));
    await g1848.user.click(card("QR"));
    const first = await screen.findByRole("dialog");
    const details = within(first).queryByRole("button", { name: "Detalles y ajustes…" });
    if (details) await g1848.user.click(details);
    await g1848.user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Corregir trenes…" }));
    view = await screen.findByRole("dialog", { name: /Corregir trenes · QR/ });
    await g1848.user.click(within(view).getByRole("button", { name: "Quitar el 2" }));
    expect(within(view).queryByRole("button", { name: "Al pool" })).toBeNull();
    expect(within(view).getByRole("button", { name: "Fuera de juego" })).toBeTruthy();
  });

  it("Dar un tren with an empty keypad gives it with no payment (US3-5)", async () => {
    const { user } = await openSeededTable({ actions: inOR("PRR", []) });
    const view = await openFromDetails(user);
    await user.click(within(view).getByRole("button", { name: /^2 · \$80/ }));
    expect(await summary(/^Corrección: la PRR recibe un 2 de la oferta$/)).toBeTruthy();
    expect(screen.getByTestId("treasury-PRR").textContent).toContain("$1.000");
  });

  it("Descartar tren still sends the train to the game's discard destination (FR-017)", async () => {
    const { user } = await openSeededTable({ actions: inOR("PRR") });
    await user.click(card("PRR"));
    const operate = await screen.findByRole("dialog");
    await user.click(within(operate).getByRole("button", { name: "Descartar tren" }));
    await user.click(within(await screen.findByRole("dialog")).getAllByRole("button", { name: "Descartar un 2" })[0]!);
    expect(await summary(/PRR descarta un 2/)).toBeTruthy();
  });
});
