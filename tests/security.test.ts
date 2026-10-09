import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T166 (research R17): source checks that run with `npm test`, so CI enforces them. No raw HTML
 * injection (React escaping only), and the API key never reaches a log.
 */

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const files = sources("src").map((path) => ({ path, text: readFileSync(path, "utf8") }));

describe("security source checks (R17)", () => {
  it("scans the app sources", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("never uses dangerouslySetInnerHTML or innerHTML", () => {
    const offenders = files.filter((f) => /dangerouslySetInnerHTML|\.innerHTML\s*=/.test(f.text)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("never logs the API key", () => {
    const offenders = files.flatMap((f) =>
      f.text
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => /console\.\w+\(/.test(line) && /api_?key|x-api-key|settings\b/i.test(line))
        .map(({ n }) => `${f.path}:${n}`),
    );
    expect(offenders).toEqual([]);
  });

  it("loads no third-party scripts from index.html", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).not.toMatch(/<script[^>]+src=["']https?:/i);
  });
});
