import type { UiText } from "../../contract/ui";
import { common, customGame, home, newSession } from "./screens";
import { history } from "./history";
import { market, results } from "./market";
import { components } from "./components";
import { operate } from "./operate";
import { settings } from "./settings";
import { turn, status, launch, merger, privates, trainCorrection, company, income } from "./sheets";
import { batch, exchange, holder, player, stock } from "./stock";
import { table } from "./table";

/** Feature 014: all English UI text. */
export const ui: UiText = { settings, components, sheets: { operate, stock, player, holder, batch, exchange, turn, status, launch, merger, privates, trainCorrection, company, income }, common, home, newSession, customGame, table, market, results, history };
