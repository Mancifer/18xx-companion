import type { MessageParamsRecord } from "../../src/i18n/contract/domain";

/** Feature 014: a plausible value for each param name the message contract uses (1830 ids). */
export const SAMPLES: Readonly<Record<string, string | number>> = {
  company: "PRR",
  current: "NYC",
  minor: "NYC",
  seller: "NYC",
  player: "p1",
  president: "p2",
  owner: "player:p2",
  private: "SV",
  type: "3",
  tradeIn: "2",
  variant: "4D",
  kind: "notAccepted",
  from: "bank",
  source: "ipo",
  side: "player",
  op: "add",
  landmark: "rock",
  option: "ruleset",
  value: "base",
  phase: "3",
  part: "revenue",
  payment: "tunneling",
  displayName: "3",
  rusts: "2",
  reason: "una razón",
  aliases: "\"pr\" (PRR / Ana)",
  path: "entries.0",
  issue: "Required",
};

/** Sample params for any code: the named samples, else 2 (4 for the issued loans). */
export const sample = (code: string): MessageParamsRecord =>
  new Proxy(
    {},
    {
      get: (_t, key: string) => SAMPLES[key] ?? (code === "end.loansIssued" && key === "issued" ? 4 : 2),
      has: () => true,
    },
  );
