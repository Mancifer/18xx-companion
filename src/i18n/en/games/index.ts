import type { GameTextPacks } from "../../contract/games";
import { g1830 } from "./g1830";
import { g1848 } from "./g1848";
import { g21moon } from "./g21moon";
import { grotla } from "./grotla";

/** Feature 014: every built-in game's English text, by game id. */
export const games: GameTextPacks = { "1830": g1830, "1848": g1848, "21moon": g21moon, rotla: grotla };
