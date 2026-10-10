import type { GameDefinition } from "../../games/schema";
import { auctionLaunch } from "./auctionLaunch";
import { bankDebt } from "./bankDebt";
import { corporateBankruptcy } from "./corporateBankruptcy";
import { corporateRound } from "./corporateRound";
import { forcedWithhold } from "./forcedWithhold";
import { loans } from "./loans";
import { manualFloatCondition } from "./manualFloatCondition";
import { landmarks } from "./landmarks";
import { mergers } from "./mergers";
import { MECHANIC_IDS, type Mechanic, type MechanicHooks, type MechanicId } from "./mechanic";
import { nationalBank } from "./nationalBank";
import { nationalTakeover } from "./nationalTakeover";
import { privateGrants } from "./privateGrants";

export { MECHANIC_IDS, type HookResult, type Mechanic, type MechanicHooks, type MechanicId } from "./mechanic";

// The registry erases each mechanic's config type; callers re-read it with mechanicConfig().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMechanic = Mechanic<any>;

// Built on first use: a mechanic module imported first (a test, a sheet) must be defined by then.
let built: Readonly<Record<MechanicId, AnyMechanic>> | undefined;
const registry = (): Readonly<Record<MechanicId, AnyMechanic>> =>
  (built ??= {
    loans,
    nationalBank,
    nationalTakeover,
    bankDebt,
    forcedWithhold,
    corporateBankruptcy,
    manualFloatCondition,
    privateGrants,
    corporateRound,
    auctionLaunch,
    mergers,
    landmarks,
  });

export function isMechanicId(id: string): id is MechanicId {
  return (MECHANIC_IDS as readonly string[]).includes(id);
}

/** Throws on an unknown id (contracts/game-definition.md rule 1). */
export function getMechanic(id: string): AnyMechanic {
  if (!isMechanicId(id)) throw new Error(`Unknown mechanic "${id}"`);
  return registry()[id];
}

export function allMechanics(): readonly AnyMechanic[] {
  const all = registry();
  return MECHANIC_IDS.map((id) => all[id]);
}

export function isEnabled(game: GameDefinition, id: MechanicId): boolean {
  return game.customRules.some((r) => r.id === id);
}

export function enabledMechanics(game: GameDefinition): AnyMechanic[] {
  return game.customRules.filter((r) => isMechanicId(r.id)).map((r) => getMechanic(r.id));
}

/** The parsed config of an enabled mechanic, or undefined when the game does not enable it. */
export function mechanicConfig<C>(game: GameDefinition, mechanic: Mechanic<C>): C | undefined {
  const rule = game.customRules.find((r) => r.id === mechanic.id);
  if (!rule) return undefined;
  return mechanic.configSchema.parse(rule.config);
}

/** The hooks of this name from the enabled mechanics, in definition order. */
export function hooksOf<K extends keyof MechanicHooks>(game: GameDefinition, key: K): NonNullable<MechanicHooks[K]>[] {
  const result: NonNullable<MechanicHooks[K]>[] = [];
  for (const m of enabledMechanics(game)) {
    const hook = m.hooks?.[key];
    if (hook) result.push(hook);
  }
  return result;
}
