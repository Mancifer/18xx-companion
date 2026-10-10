import { SessionStore } from "../../src/app/SessionStore";
import { startSession } from "../../src/app/sessions";
import { APP_VERSION } from "../../src/app/version";
import { getBuiltInGame } from "../../src/domain/games";
import type { Player } from "../../src/domain/types";
import { openCompanionDb } from "../../src/persistence/db";
import { buildExport, type SessionExport } from "../../src/persistence/exportImport";
import { SessionRepo } from "../../src/persistence/sessionRepo";
import { SettingsRepo } from "../../src/persistence/settingsRepo";

/**
 * The six voice-eval fixtures (research R18, T135). Each is played through the real domain with
 * high-level actions, the way a table would, and serialized in the session export format, so a
 * fixture can also be imported into the app to look at it.
 */

export interface FixtureSpec {
  readonly id: string;
  readonly game: string;
  readonly options?: Readonly<Record<string, string>>;
  readonly players: readonly Player[];
  readonly actions: readonly unknown[];
}

const COLORS = ["#e53935", "#1e88e5", "#43a047", "#fdd835", "#8e24aa", "#fb8c00"];

function players(...list: readonly (string | readonly [string, readonly string[]])[]): Player[] {
  return list.map((entry, i) => {
    const [name, aliases] = typeof entry === "string" ? [entry, []] : entry;
    return { id: `p${i + 1}`, name, aliases: [...aliases], color: COLORS[i] ?? "#888888", seat: i + 1 };
  });
}

const train = (company: string, trainType: string) => ({
  type: "buyTrain",
  company,
  trainType,
  variant: null,
  from: "bank",
  seller: null,
  price: null,
  tradeIn: null,
});
const pay = (company: string, amount: number, mode: "full" | "withhold" = "full") => ({
  type: "runAndPayout",
  company,
  parts: [{ part: "revenue", amount }],
  mode,
});
const moonRun = (company: string, local: number, spacePort: number) => ({
  type: "runAndPayout",
  company,
  parts: [
    { part: "local", amount: local },
    { part: "spacePort", amount: spacePort },
  ],
  mode: null,
});
const par = (player: string, company: string, price: number) => ({ type: "parCompany", player, company, price });
const buy = (player: string, company: string, count = 1, source: "ipo" | "pool" = "ipo") => ({
  type: "buyShare",
  buyer: `player:${player}`,
  company,
  source,
  count,
});
const sell = (player: string, company: string, count: number) => ({
  type: "sellShares",
  seller: `player:${player}`,
  company,
  count,
});
const privateBuy = (buyer: string, id: string, price: number) => ({ type: "buyPrivate", buyer, private: id, price, par: null });

// 1830: Ana and Anabel are confusable; Carla's nickname "canadiense" is also a CPR alias.
const P1830 = players("Ana", "Anabel", "Bruno", ["Carla", ["canadiense"]]);

/** 1830 up to the end of OR 1.1: PRR and NYC floated, each with a 2. */
const G1830_OR1 = [
  privateBuy("p1", "SV", 20),
  privateBuy("p2", "CS", 40),
  privateBuy("p3", "DH", 70),
  privateBuy("p4", "MH", 110),
  { type: "startSR" },
  par("p1", "PRR", 100),
  buy("p2", "PRR", 2),
  buy("p1", "PRR", 2),
  par("p3", "NYC", 90),
  buy("p4", "NYC", 2),
  buy("p3", "NYC", 1),
  buy("p2", "NYC", 1),
  buy("p4", "PRR", 1),
  { type: "endSR" },
  { type: "startOR" },
  { type: "privateIncome" },
  train("PRR", "2"),
  pay("PRR", 80),
  { type: "nextCompany" },
  train("NYC", "2"),
  pay("NYC", 70, "withhold"),
  { type: "nextCompany" },
];

const P1848 = players("Ana", "Anabel", "Bruno", "Carla");

/** 1848 up to the first OR: QR and VR floated (60% sold from the IPO). */
const G1848_OR1 = [
  privateBuy("p1", "P1", 30),
  privateBuy("p2", "P2", 70),
  privateBuy("p3", "P3", 110),
  { type: "startSR" },
  par("p1", "QR", 80),
  buy("p2", "QR", 2),
  buy("p1", "QR", 2),
  buy("p3", "QR", 1),
  par("p4", "VR", 70),
  buy("p3", "VR", 2),
  buy("p4", "VR", 2),
  buy("p2", "VR", 1),
  { type: "endSR" },
  { type: "startOR" },
];

const P21 = players("Ana", "Bruno", "Carla", "Dani");

/** 21Moon up to the first OR: VH and SSF parred and partly sold (incremental). */
const G21_OR1 = [
  privateBuy("p1", "P2", 30),
  privateBuy("p2", "P4", 60),
  { type: "startSR" },
  par("p1", "VH", 70),
  buy("p2", "VH", 1),
  buy("p3", "VH", 1),
  par("p3", "SSF", 80),
  buy("p4", "SSF", 1),
  buy("p1", "VH", 1),
  { type: "endSR" },
  { type: "startOR" },
];

const PROTLA = players("Ana", "Bruno", "Carla");
const launch = (player: string, company: string, bid: number) => ({ type: "launchCompany", player, company, bid, price: null });
const fromTreasury = (player: string, company: string) => ({ type: "buyShare", buyer: `player:${player}`, company, source: "treasury", count: 1 });

/**
 * RotLA cycle 1, OR 1.1 (feature 004): EXP (80) has operated (a 2, paid 90, issued a share to the
 * pool); Tunneling (70) operates now; Expansive (70) is next. Ana presides TUN and holds 2 EXP.
 */
const ROTLA_OR1 = [
  launch("p1", "TUN", 140),
  launch("p2", "EXP", 165),
  launch("p3", "EXV", 150),
  fromTreasury("p1", "EXP"),
  fromTreasury("p1", "EXP"),
  { type: "startOR" },
  train("EXP", "2"),
  pay("EXP", 90),
  { type: "issueShares", company: "EXP", count: 1 },
  { type: "nextCompany" },
];

export const FIXTURE_SPECS: readonly FixtureSpec[] = [
  {
    // OR 2.1, PRR operating, 4 players.
    id: "1830-or",
    game: "1830",
    players: P1830,
    actions: [...G1830_OR1, { type: "startSR" }, sell("p4", "PRR", 1), buy("p3", "PRR", 1), { type: "endSR" }, { type: "startOR" }],
  },
  {
    // SR 2, with a PRR share in the pool and B&O unstarted.
    id: "1830-sr",
    game: "1830",
    players: P1830,
    actions: [...G1830_OR1, { type: "startSR" }, sell("p4", "PRR", 1)],
  },
  {
    // OR 2.1, phase 3 (a 3 bought), loans available; VR operating, withheld once, near the RCV column.
    id: "1848-or",
    game: "1848",
    players: P1848,
    actions: [
      ...G1848_OR1,
      { type: "nextCompany" },
      train("QR", "2"),
      pay("QR", 60),
      { type: "nextCompany" },
      train("VR", "2"),
      pay("VR", 0, "withhold"),
      { type: "nextCompany" },
      { type: "startSR" },
      { type: "endSR" },
      { type: "startOR" },
      { type: "nextCompany" },
      train("QR", "3"),
      pay("QR", 90),
      { type: "nextCompany" },
    ],
  },
  {
    // SR 2 with Bank of England shares for sale.
    id: "1848-sr",
    game: "1848",
    players: P1848,
    actions: [
      ...G1848_OR1,
      { type: "nextCompany" },
      train("QR", "2"),
      pay("QR", 60),
      { type: "nextCompany" },
      train("VR", "2"),
      pay("VR", 40),
      { type: "nextCompany" },
      { type: "startSR" },
    ],
  },
  {
    // OR 1.1, VH operating, two revenue parts.
    id: "21moon-or",
    game: "21moon",
    options: { lateCompany: "KR" },
    players: P21,
    actions: [...G21_OR1],
  },
  {
    // The corporate round after SR 2.
    id: "21moon-cr",
    game: "21moon",
    options: { lateCompany: "KR" },
    players: P21,
    actions: [
      ...G21_OR1,
      train("VH", "2"),
      moonRun("VH", 40, 20),
      { type: "nextCompany" },
      train("SSF", "2"),
      moonRun("SSF", 30, 20),
      { type: "nextCompany" },
      { type: "startSR" },
      { type: "startCR" },
    ],
  },
  {
    // RotLA SR 1: Agricultural launched (Carla), Tunneling and Express still to launch.
    id: "rotla-sr",
    game: "rotla",
    players: PROTLA,
    actions: [launch("p3", "AGR", 130)],
  },
  {
    // RotLA OR 1.1, Tunneling operating; an EXP share in the pool; 7/∞ always on sale.
    id: "rotla-or",
    game: "rotla",
    players: PROTLA,
    actions: ROTLA_OR1,
  },
  {
    // RotLA with Landmarks, OR 1.1: EXP (90) bought a 4 (every 2 rusted) and a 5; Tunneling
    // operates now; Manufacturing has its own 2.
    id: "rotla-lm",
    game: "rotla",
    options: { expansion: "landmarks" },
    players: PROTLA,
    actions: [
      launch("p1", "TUN", 140),
      launch("p2", "EXP", 200),
      launch("p3", "MFG", 140),
      { type: "startOR" },
      { type: "transferMoney", from: "bank", to: "company:EXP", amount: 600 },
      train("EXP", "4"),
      train("EXP", "5"),
      pay("EXP", 100),
      { type: "nextCompany" },
    ],
  },
  {
    // RotLA end of OR 1.2 in green (EXP bought the first 3): the Merger Round is due.
    id: "rotla-mr",
    game: "rotla",
    players: PROTLA,
    actions: [
      launch("p1", "TUN", 140),
      launch("p2", "EXP", 200),
      launch("p3", "SPC", 120),
      { type: "startOR" },
      train("EXP", "3"),
      pay("EXP", 60),
      { type: "nextCompany" },
      { type: "nextCompany" },
      { type: "nextCompany" },
      { type: "nextCompany" },
      { type: "nextCompany" },
      { type: "nextCompany" },
    ],
  },
];

const FIXED_NOW = new Date("2026-10-09T20:00:00.000Z");

/**
 * Plays a spec into a fresh IndexedDB (fake-indexeddb in Node) and returns its export. Throws
 * naming the action that the domain rejected, so a broken spec fails loudly.
 */
export async function buildFixture(spec: FixtureSpec, dbName = `eval-fixture-${spec.id}-${Date.now()}`): Promise<SessionExport> {
  const db = await openCompanionDb(dbName);
  try {
    const sessions = new SessionRepo(db);
    const store: SessionStore = await startSession(
      sessions,
      new SettingsRepo(db),
      { game: getBuiltInGame(spec.game), options: spec.options ?? {}, players: spec.players, walletMode: "appTruth", name: `eval ${spec.id}` },
      FIXED_NOW,
    );
    for (const [i, action] of spec.actions.entries()) {
      const result = await store.dispatch(action, { source: "system" });
      if (!result.ok) throw new Error(`${spec.id} action #${i} ${JSON.stringify(action)}: ${result.messageEs}`);
    }
    const id = store.getSnapshot().meta.id;
    const exported = await buildExport(sessions, id, { appVersion: APP_VERSION, now: FIXED_NOW });
    return stabilize(exported, spec.id);
  } finally {
    db.close();
  }
}

/** Fixed ids and timestamps so regenerating a fixture gives the same file. */
function stabilize(exp: SessionExport, id: string): SessionExport {
  const at = FIXED_NOW.toISOString();
  const ids = new Map<string, string>();
  for (const e of exp.entries) if (e.kind === "group") ids.set(e.id, `g${e.seq}`);
  const json = JSON.stringify({
    ...exp,
    session: { ...exp.session, id: `fixture-${id}`, createdAt: at, updatedAt: at },
    entries: exp.entries.map((e) => ({ ...e, at })),
  });
  let out = json;
  for (const [from, to] of ids) out = out.split(`"${from}"`).join(`"${to}"`);
  return JSON.parse(out) as SessionExport;
}
