import { Component, useMemo, useState, type ReactNode } from "react";
import { AppProvider } from "../app/AppProvider";
import { useHasSession } from "../app/useSession";
import { defaultVoiceDeps, VoiceDepsContext, type VoiceDeps } from "../app/useVoice";
import { NavContext, type Nav, type Screen } from "./nav";
import { CustomGame } from "./screens/CustomGame";
import { History } from "./screens/History";
import { Market } from "./screens/Market";
import { Home } from "./screens/Home";
import { NewSession } from "./screens/NewSession";
import { Settings } from "./screens/Settings";
import { Table } from "./screens/Table";

function Screens({ screen }: { screen: Screen }): ReactNode {
  const hasSession = useHasSession();
  const needsSession = screen.name === "table" || screen.name === "history" || screen.name === "market";
  if (needsSession && !hasSession) return <Home />;
  switch (screen.name) {
    case "home":
      return <Home />;
    case "newSession":
      return <NewSession />;
    case "customGame":
      return <CustomGame />;
    case "table":
      return <Table />;
    case "history":
      return <History />;
    case "market":
      return <Market />;
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
        <main className="screen">
          <div className="screen-body">
            <h1>Algo salió mal</h1>
            <p className="muted">{this.state.error.message}</p>
            <button
              className="primary"
              onClick={() => {
                this.setState({ error: null });
                this.props.onReset();
              }}
            >
              Volver al inicio
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

export function App({ dbName, voiceDeps = defaultVoiceDeps }: { dbName?: string; voiceDeps?: VoiceDeps }) {
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
        </ErrorBoundary>
      </NavContext.Provider>
      </VoiceDepsContext.Provider>
    </AppProvider>
  );
}
