import "fake-indexeddb/auto";
import { afterEach } from "vitest";

// React Testing Library cleanup, only in the jsdom project (no jest-dom).
afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
