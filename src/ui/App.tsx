import { Component, useMemo, useState, type ReactNode } from "react";
import { AppProvider } from "../app/AppProvider";
import { useText } from "../app/language";
import { useHasSession } from "../app/useSession";
import { defaultVoiceDeps, VoiceDepsContext, type VoiceDeps } from "../app/useVoice";
import { NavContext, type Nav, type Screen } from "./nav";
import { CustomGame } from "./screens/CustomGame";
import { History } from "./screens/History";
import { Market } from "./screens/Market";
import { Home } from "./screens/Home";
import { NewSession } from "./screens/NewSession";
import { Results } from "./screens/Results";
import { Settings } from "./screens/Settings";
import { Table } from "./screens/Table";

function Screens({ screen }: { screen: Screen }): ReactNode {
  const hasSession = useHasSession();
  const needsSession = screen.name === "table" || screen.name === "history" || screen.name === "market" || screen.name === "results";
  if (needsSession && !hasSession) return <Home />;
  switch (screen.name) {
    case "home":
      return <Home />;
    case "newSession":
      return <NewSession />;
    case "customGame":
      return <CustomGame />;
    case "table":
      return <Table {...(screen.reopen ? { reopen: screen.reopen } : {})} />;
    case "history":
      // Keyed so that moving between filtered and full History remounts (focus runs once).
      return (
        <History
          key={`${screen.subject?.kind ?? "all"}:${screen.subject?.id ?? ""}:${screen.focus ?? ""}`}
          {...(screen.subject ? { subject: screen.subject } : {})}
          {...(screen.focus ? { focus: screen.focus } : {})}
          {...(screen.back ? { back: screen.back } : {})}
        />
      );
    case "market":
      return <Market />;
    case "results":
      return <Results from={screen.from} />;
    case "settings":
      return <Settings />;
  }
}

interface BoundaryState {
  readonly error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, BoundaryState> {
  override state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return (
        <ErrorScreen
          message={this.state.error.message}
          onReset={() => {
            this.setState({ error: null });
            this.props.onReset();
          }}
        />
      );
    }
    return this.props.children;
  }
}

function ErrorScreen({ message, onReset }: { message: string; onReset: () => void }) {
  const t = useText().components.app;
  return (
    <main className="screen">
      <div className="screen-body">
        <h1>{t.error}</h1>
        <p className="muted">{message}</p>
        <button className="primary" onClick={onReset}>
          {t.home}
        </button>
      </div>
    </main>
  );
}

export function App({
  dbName,
  voiceDeps = defaultVoiceDeps,
  overlay,
}: {
  dbName?: string;
  voiceDeps?: VoiceDeps;
  /** Rendered inside every provider, next to the screen: tests use it to reach the app's hooks. */
  overlay?: ReactNode;
}) {
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const nav = useMemo<Nav>(() => ({ screen, go: setScreen }), [screen]);
  return (
    <AppProvider {...(dbName !== undefined ? { dbName } : {})}>
      <VoiceDepsContext.Provider value={voiceDeps}>
      <NavContext.Provider value={nav}>
        <ErrorBoundary
          onReset={() => {
            setScreen({ name: "home" });
          }}
        >
          <Screens screen={screen} />
          {overlay}
        </ErrorBoundary>
      </NavContext.Provider>
      </VoiceDepsContext.Provider>
    </AppProvider>
  );
}
