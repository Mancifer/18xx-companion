import { useServices } from "../app/AppProvider";
import { useSession } from "../app/useSession";
import { APP_VERSION } from "../app/version";
import { buildExport, exportFileName } from "../persistence/exportImport";

/** Saves a file through the browser's download (no server involved). */
export function downloadJson(fileName: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Export of the open session (FR-091). Settings, and so the AI key, are never read (FR-092). */
export function useExportSession(): () => Promise<void> {
  const { sessions } = useServices();
  const { meta } = useSession();
  return async () => {
    const file = await buildExport(sessions, meta.id, { appVersion: APP_VERSION });
    downloadJson(exportFileName(file), file);
  };
}
