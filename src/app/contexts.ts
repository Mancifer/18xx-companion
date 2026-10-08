import { createContext } from "react";
import type { SessionStore } from "./SessionStore";

/** The open session's store, or null on screens without a session. */
export const SessionContext = createContext<SessionStore | null>(null);
