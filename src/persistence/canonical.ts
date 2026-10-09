import type { SessionState } from "../domain/events/state";

/** Canonical JSON: object keys sorted, undefined dropped, so equal values serialize equally. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : normalize(v)));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = normalize(v);
    }
    return out;
  }
  return value;
}

/** SHA-256 (hex) of the canonical JSON of a replayed state (contracts/export-format.md). */
export async function stateHash(state: SessionState): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(state));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
