import { useEffect } from "react";

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

interface NavigatorWithWakeLock {
  wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
}

/**
 * Keeps the screen awake while a session is open (FR-102, research R12). Re-acquired when the
 * page becomes visible again; a silent no-op where unsupported.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const api = (navigator as NavigatorWithWakeLock).wakeLock;
    if (!api) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let disposed = false;

    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      api
        .request("screen")
        .then((s) => {
          if (disposed) void s.release();
          else sentinel = s;
        })
        .catch(() => undefined);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (sentinel) void sentinel.release().catch(() => undefined);
    };
  }, [active]);
}
