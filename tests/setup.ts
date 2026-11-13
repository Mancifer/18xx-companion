import "fake-indexeddb/auto";
import { afterEach, beforeEach } from "vitest";

/**
 * Feature 014 T009: the existing suite was written against the Spanish UI. jsdom (and Node)
 * report an English device, so every test starts on a Spanish device; English tests switch with
 * `setNavigatorLanguages` from tests/helpers/session.ts.
 */
export const DEFAULT_TEST_LANGUAGES: readonly string[] = ["es-ES"];

export function pinNavigatorLanguages(list: readonly string[]): void {
  if (typeof navigator === "undefined") return;
  Object.defineProperty(navigator, "languages", { value: [...list], configurable: true });
  Object.defineProperty(navigator, "language", { value: list[0] ?? "", configurable: true });
}

beforeEach(() => {
  pinNavigatorLanguages(DEFAULT_TEST_LANGUAGES);
});

// Feature 017: jsdom has no layout, so no scrollIntoView; History calls it on a focused entry.
if (typeof Element !== "undefined" && !("scrollIntoView" in Element.prototype)) {
  Object.defineProperty(Element.prototype, "scrollIntoView", { value: function scrollIntoView() {}, configurable: true, writable: true });
}

// React Testing Library cleanup, only in the jsdom project (no jest-dom).
afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
