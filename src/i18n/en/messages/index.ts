import type { MessageText } from "../../contract/domain";
import { flow } from "./flow";
import { game } from "./game";
import { mechanics } from "./mechanics";
import { operating } from "./operating";
import { stock } from "./stock";
import { importing, store } from "./store";
import { voice } from "./voice";

/** Feature 014: every English message, one module per area. */
export const messages: MessageText = { ...flow, ...stock, ...operating, ...mechanics, ...game, ...store, ...importing, ...voice };
