import { advanceTurn } from "../events/reduce";
import { initialState, type TurnState } from "../events/state";
import type { Round } from "../events/types";
import type { GameDefinition } from "../games/schema";
import { ROUND_ICON, roundTitleEs } from "../i18n/es";
import type { GroupHistory } from "./effectiveLog";
import type { GroupId } from "./entries";
import { isSetup } from "./undo";

/** A run of History entries in one round (feature 011, data-model §2). Derived, never stored. */
export interface RoundSection {
  /** "SR:3", "OR:2.1", "MR:4", "CR:2", "PRIVATES" or "SETUP". */
  readonly key: string;
  readonly round: Round | "SETUP";
  readonly title: string;
  readonly icon: string;
  /** The active group that opened the round; undefined for SETUP (and an undone first entry after it). */
  readonly startGroupId: GroupId | undefined;
  /** Every group in the section, active or reverted, oldest first. */
  readonly groupIds: GroupId[];
  /** A later section exists. */
  readonly finished: boolean;
}

function keyOf(turn: TurnState): string {
  switch (turn.round) {
    case "PRIVATES":
      return "PRIVATES";
    case "OR":
      return `OR:${turn.orSet}.${turn.orIndex}`;
    default:
      return `${turn.round}:${turn.srNumber}`;
  }
}

/**
 * Splits History into contiguous round sections, oldest first (research R7). Only active groups'
 * `turnAdvance` events move the round, folded with the reducer's own `advanceTurn`; a reverted
 * group stays in the section of its position and opens nothing (FR-021). Setup before any round
 * forms "Preparación". Equal keys that are not adjacent are separate sections.
 */
export function roundSections(game: GameDefinition, history: readonly GroupHistory[]): RoundSection[] {
  let state = initialState(game, []);
  const sections: { key: string; round: Round | "SETUP"; title: string; startGroupId: GroupId | undefined; groupIds: GroupId[] }[] = [];
  for (const h of [...history].sort((a, b) => a.group.seq - b.group.seq)) {
    const last = sections.at(-1);
    const active = h.status !== "reverted";
    if (active) {
      const events = h.versions.at(-1)?.events ?? h.group.events;
      for (const e of events) if (e.t === "turnAdvance") state = advanceTurn(state, e);
    }
    const setup = isSetup(h.group) && (!last || last.key === "SETUP");
    // The setup puts the game in its first round, so the first entry after it lands there even
    // when undone. Otherwise an undone entry joins the current section.
    const key = setup ? "SETUP" : !active && last && last.key !== "SETUP" ? last.key : keyOf(state.turn);
    if (last?.key === key) {
      last.groupIds.push(h.group.id);
      continue;
    }
    sections.push(
      setup
        ? { key, round: "SETUP", title: "Preparación", startGroupId: undefined, groupIds: [h.group.id] }
        : {
            key,
            round: state.turn.round,
            title: roundTitleEs(game, state.turn),
            startGroupId: active ? h.group.id : undefined,
            groupIds: [h.group.id],
          },
    );
  }
  return sections.map((s, i) => ({ ...s, icon: ROUND_ICON[s.round], finished: i < sections.length - 1 }));
}
