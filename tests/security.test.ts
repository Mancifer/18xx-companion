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
        .filter(({ line }) => /console\.\w+\(/.test(line) && /api_?keys?|groq_?key|x-api-key|x-goog-api-key|bearer|settings\b/i.test(line))
        .map(({ n }) => `${f.path}:${n}`),
    );
    expect(offenders).toEqual([]);
  });

  it("005: no log call in a file that handles provider keys or their header", () => {
    const offenders = files.filter((f) => /x-goog-api-key|apiKeys/.test(f.text) && /console\.\w+\(/.test(f.text)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("015: no log call in the files that send the Groq key or keep the recording", () => {
    const offenders = files
      .filter((f) => /Bearer \$\{|memoryGroqKey|new AudioRecorder|ondataavailable/.test(f.text) && /console\.\w+\(/.test(f.text))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("015 FR-012: audio is never written to IndexedDB or the export", () => {
    // Only these repositories write to IndexedDB (and build exports); none may handle a Blob.
    for (const repo of ["sessionRepo.ts", "settingsRepo.ts", "gamesRepo.ts", "exportImport.ts"]) {
      const text = readFileSync(join("src", "persistence", repo), "utf8");
      expect(text, repo).not.toMatch(/\bBlob\b|MediaRecorder|Recording\b/);
    }
  });

  it("005: the Gemini adapter sends the key in a header, never as a ?key= URL parameter", () => {
    const gemini = readFileSync(join("src", "voice", "providers", "gemini.ts"), "utf8");
    expect(gemini).toContain('"x-goog-api-key": apiKey');
    expect(gemini).not.toMatch(/[?&]key=/);
  });

  it("005/015: the production CSP lets the app reach every provider's and Groq's endpoint, and only those", () => {
    const config = readFileSync("vite.config.ts", "utf8");
    const connect = /"connect-src ([^"]+)"/.exec(config)?.[1]?.split(/\s+/);
    expect(connect).toEqual(["'self'", "https://api.anthropic.com", "https://generativelanguage.googleapis.com", "https://api.groq.com"]);
    const gemini = readFileSync(join("src", "voice", "providers", "gemini.ts"), "utf8");
    expect(gemini).toContain("https://generativelanguage.googleapis.com/");
    // Feature 015: the CSP host and the client's endpoint can't drift apart.
    const groq = readFileSync(join("src", "voice", "transcription", "groq.ts"), "utf8");
    expect(groq).toContain('"https://api.groq.com/openai/v1/audio/transcriptions"');
  });

  it("015 (constitution VII's dev exception): only dev-guarded files touch the saved check clips", () => {
    // The string catalogs only hold the checkbox's label.
    const offenders = files
      .filter((f) => !f.path.includes(join("src", "i18n")))
      .filter((f) => /\bcheckClips\b|\blastClip\b|clipRecorder|clipSink/.test(f.text) && !f.text.includes("import.meta.env.DEV"))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("loads no third-party scripts from index.html", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).not.toMatch(/<script[^>]+src=["']https?:/i);
  });
});
