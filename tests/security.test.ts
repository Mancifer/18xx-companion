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
        .filter(({ line }) => /console\.\w+\(/.test(line) && /api_?keys?|x-api-key|x-goog-api-key|settings\b/i.test(line))
        .map(({ n }) => `${f.path}:${n}`),
    );
    expect(offenders).toEqual([]);
  });

  it("005: no log call in a file that handles provider keys or their header", () => {
    const offenders = files.filter((f) => /x-goog-api-key|apiKeys/.test(f.text) && /console\.\w+\(/.test(f.text)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("005: the Gemini adapter sends the key in a header, never as a ?key= URL parameter", () => {
    const gemini = readFileSync(join("src", "voice", "providers", "gemini.ts"), "utf8");
    expect(gemini).toContain('"x-goog-api-key": apiKey');
    expect(gemini).not.toMatch(/[?&]key=/);
  });

  it("005: the production CSP lets the app reach every provider's endpoint, and only those", () => {
    const config = readFileSync("vite.config.ts", "utf8");
    const connect = /"connect-src ([^"]+)"/.exec(config)?.[1]?.split(/\s+/);
    expect(connect).toEqual(["'self'", "https://api.anthropic.com", "https://generativelanguage.googleapis.com"]);
    const gemini = readFileSync(join("src", "voice", "providers", "gemini.ts"), "utf8");
    expect(gemini).toContain("https://generativelanguage.googleapis.com/");
  });

  it("loads no third-party scripts from index.html", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).not.toMatch(/<script[^>]+src=["']https?:/i);
  });
});
