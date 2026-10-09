import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Action } from "../domain/actions/schemas";
import type { GroupEntry } from "../domain/ledger/entries";
import { openCompanionDb, type CompanionDb } from "../persistence/db";
import { GamesRepo } from "../persistence/gamesRepo";
import { SessionRepo } from "../persistence/sessionRepo";
import { SettingsRepo } from "../persistence/settingsRepo";
import { SessionStore } from "./SessionStore";
import { startSession, type NewSessionInput } from "./sessions";
import { SessionContext } from "./contexts";

export interface Services {
  readonly db: CompanionDb;
  readonly sessions: SessionRepo;
  readonly settings: SettingsRepo;
  readonly games: GamesRepo;
}

/** What the last write did, for the toast (FR-061). */
export type FeedbackInput =
  | { readonly kind: "applied"; readonly group: GroupEntry }
  | { readonly kind: "reverted"; readonly group: GroupEntry }
  | { readonly kind: "amended"; readonly group: GroupEntry; readonly action: Action }
  | { readonly kind: "error"; readonly messageEs: string };
export type Feedback = FeedbackInput & { readonly id: number };

export interface AppActions {
  readonly openSession: (id: string) => Promise<boolean>;
  readonly newSession: (input: NewSessionInput) => Promise<void>;
  readonly closeSession: () => void;
  /** Whether a session is open. */
  readonly hasSession: boolean;
}

const ServicesContext = createContext<Services | null>(null);
const AppActionsContext = createContext<AppActions | null>(null);
interface FeedbackValue {
  readonly feedback: Feedback | null;
  readonly push: (f: FeedbackInput) => void;
  readonly clear: () => void;
}
const FeedbackContext = createContext<FeedbackValue | null>(null);

export function useServices(): Services {
  const s = useContext(ServicesContext);
  if (!s) throw new Error("useServices outside AppProvider");
  return s;
}

export function useAppActions(): AppActions {
  const a = useContext(AppActionsContext);
  if (!a) throw new Error("useAppActions outside AppProvider");
  return a;
}

export function useFeedback() {
  const f = useContext(FeedbackContext);
  if (!f) throw new Error("useFeedback outside AppProvider");
  return f;
}

let feedbackId = 0;

export function AppProvider({ children, dbName }: { children: ReactNode; dbName?: string }) {
  const [services, setServices] = useState<Services | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState<SessionStore | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    let cancelled = false;
    openCompanionDb(dbName)
      .then((db) => {
        if (!cancelled) {
          setServices({
            db,
            sessions: new SessionRepo(db),
            settings: new SettingsRepo(db),
            games: new GamesRepo(db),
          });
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [dbName]);

  const push = useCallback((f: FeedbackInput) => {
    feedbackId += 1;
    setFeedback({ ...f, id: feedbackId });
  }, []);
  const clear = useCallback(() => {
    setFeedback(null);
  }, []);

  const actions = useMemo<AppActions | null>(() => {
    if (!services) return null;
    return {
      hasSession: store !== null,
      async openSession(id) {
        const opened = await SessionStore.open(services.sessions, id);
        if (!opened) return false;
        await services.settings.set({ lastSessionId: id });
        setFeedback(null);
        setStore(opened);
        return true;
      },
      async newSession(input) {
        const created = await startSession(services.sessions, services.settings, input);
        setFeedback(null);
        setStore(created);
      },
      closeSession() {
        setFeedback(null);
        setStore(null);
      },
    };
  }, [services, store]);

  const feedbackValue = useMemo(() => ({ feedback, push, clear }), [feedback, push, clear]);

  if (error) {
    return (
      <main className="screen">
        <div className="screen-body">
          <h1>No se pudo abrir el almacenamiento</h1>
          <p className="muted">{error}</p>
        </div>
      </main>
    );
  }
  if (!services || !actions) return null;

  return (
    <ServicesContext.Provider value={services}>
      <AppActionsContext.Provider value={actions}>
        <FeedbackContext.Provider value={feedbackValue}>
          <SessionContext.Provider value={store}>{children}</SessionContext.Provider>
        </FeedbackContext.Provider>
      </AppActionsContext.Provider>
    </ServicesContext.Provider>
  );
}
