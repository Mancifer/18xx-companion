import { common, customGame, home, newSession } from "./screens";
import { history } from "./history";
import { market, results } from "./market";
import { components } from "./components";
import { operate } from "./operate";
import { settings } from "./settings";
import { turn, status, launch, merger, privates, trainCorrection, company, income } from "./sheets";
import { batch, exchange, holder, player, stock } from "./stock";
import { table } from "./table";

/**
 * Feature 014: all Spanish UI text. Its shape is the UI contract (`UiText`), so every other
 * language must provide exactly these keys.
 */
export const ui = { settings, components, sheets: { operate, stock, player, holder, batch, exchange, turn, status, launch, merger, privates, trainCorrection, company, income }, common, home, newSession, customGame, table, market, results, history };
