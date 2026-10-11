import { useContext, useSyncExternalStore } from "react";
import { useFeedback } from "./AppProvider";
import { cleanPins } from "../domain/mechanics/chipSetup";
import type { ChipSet } from "../domain/types";
import { SessionContext } from "./contexts";
import type {
  AmendStoreResult,
  ConfirmOptions,
  DispatchOptions,
  DispatchResult,
  RevertResult,
  SessionStore,
  StoreSnapshot,
} from "./SessionStore";

export type { AmendStoreResult, DispatchResult, RevertResult, StoreSnapshot } from "./SessionStore";

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
  /**
   * Undo (FR-012). Defaults to the last active group. Without `confirmed`, a group that later
   * entries depend on comes back as a "dependents" error instead (FR-014).
   */
  readonly revert: (groupId?: string, options?: ConfirmOptions) => Promise<RevertResult>;
  /** Correct a past group (FR-013), with the same dependents check as revert. */
  readonly amend: (groupId: string, action: unknown, options?: ConfirmOptions) => Promise<AmendStoreResult>;
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
    async revert(groupId, options) {
      const before = store.getSnapshot().log;
      const result = await store.revert(groupId, options);
      if (result.ok) {
        const group = before.find((e) => e.kind === "group" && e.id === result.entry.groupId);
        if (group?.kind === "group") push({ kind: "reverted", group });
      } else if (result.error !== "dependents") {
        push({ kind: "error", messageEs: result.messageEs });
      }
      return result;
    },
    async updateChips(chipSet, bankPins) {
      const result = await store.updateMeta({ chipSet, bankPins: cleanPins(bankPins, chipSet) });
      if (!result.ok) push({ kind: "error", messageEs: result.messageEs });
      return result.ok;
    },
    async amend(groupId, action, options) {
      const result = await store.amend(groupId, action, options);
      if (result.ok) {
        const group = store.getSnapshot().log.find((e) => e.kind === "group" && e.id === groupId);
        if (group?.kind === "group") push({ kind: "amended", group, action: result.entry.action });
      } else if (result.error !== "dependents") {
        push({ kind: "error", messageEs: result.messageEs });
      }
      return result;
    },
  };
}
