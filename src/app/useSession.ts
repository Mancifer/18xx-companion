import { useContext, useSyncExternalStore } from "react";
import { useFeedback } from "./AppProvider";
import { cleanPins } from "../domain/mechanics/chipSetup";
import type { ChipSet } from "../domain/types";
import { SessionContext } from "./contexts";
import type { DispatchOptions, DispatchResult, SessionStore, StoreSnapshot, UndoOptions, UndoResult } from "./SessionStore";

export type { DispatchResult, StoreSnapshot, UndoResult } from "./SessionStore";

function useStore(): SessionStore {
  const store = useContext(SessionContext);
  if (!store) throw new Error("useSession must be used inside an open session");
  return store;
}

export function useHasSession(): boolean {
  return useContext(SessionContext) !== null;
}

export function useSession(): StoreSnapshot {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export interface SessionActions {
  /** Applies an action and shows the toast with Undo (FR-061). */
  readonly dispatch: (action: unknown, options?: DispatchOptions) => Promise<DispatchResult>;
  /** Undoes the newest action, with no confirmation (feature 010, FR-004). */
  readonly undoLast: () => Promise<UndoResult>;
  /**
   * Undoes back to an entry (feature 010). A range of more than one entry comes back as
   * "confirmRange" with nothing pushed: the caller shows UndoRangeSheet, then calls again with
   * `confirmed: true`.
   */
  readonly undoTo: (groupId: string, options?: UndoOptions) => Promise<UndoResult>;
  /**
   * The table's chip set (FR-080) and bank pins (feature 008): configuration, not game state, so
   * one meta write and nothing logged. Pins for values no longer in the set are dropped.
   */
  readonly updateChips: (chipSet: ChipSet, bankPins: Readonly<Record<string, number>>) => Promise<boolean>;
}

export function useDispatch(): SessionActions {
  const store = useStore();
  const { push } = useFeedback();
  return {
    async dispatch(action, options) {
      const result = await store.dispatch(action, options);
      push(result.ok ? { kind: "applied", group: result.group } : { kind: "error", messageEs: result.messageEs });
      return result;
    },
    async undoLast() {
      const result = await store.undoLast();
      push(result.ok ? { kind: "reverted", groups: result.undone } : { kind: "error", messageEs: result.messageEs });
      return result;
    },
    async undoTo(groupId, options) {
      const result = await store.undoTo(groupId, options);
      if (result.ok) push({ kind: "reverted", groups: result.undone });
      else if (result.error !== "confirmRange") push({ kind: "error", messageEs: result.messageEs });
      return result;
    },
    async updateChips(chipSet, bankPins) {
      const result = await store.updateMeta({ chipSet, bankPins: cleanPins(bankPins, chipSet) });
      if (!result.ok) push({ kind: "error", messageEs: result.messageEs });
      return result.ok;
    },
  };
}
