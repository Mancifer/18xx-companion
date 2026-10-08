import { useContext, useSyncExternalStore } from "react";
import { useFeedback } from "./AppProvider";
import { SessionContext } from "./contexts";
import type { DispatchOptions, DispatchResult, RevertResult, SessionStore, StoreSnapshot } from "./SessionStore";

export type { DispatchResult, RevertResult, StoreSnapshot } from "./SessionStore";

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
  /** Undo (FR-012). Defaults to the last active group. */
  readonly revert: (groupId?: string) => Promise<RevertResult>;
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
    async revert(groupId) {
      const before = store.getSnapshot().log;
      const result = await store.revert(groupId);
      if (result.ok) {
        const group = before.find((e) => e.kind === "group" && e.id === result.entry.groupId);
        if (group?.kind === "group") push({ kind: "reverted", group });
      } else {
        push({ kind: "error", messageEs: result.messageEs });
      }
      return result;
    },
  };
}
