import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { systemPromptEs } from "../../src/voice/prompt";
import { snapshotAndTranscript } from "../../src/voice/snapshot";
import { buildToolSpecs, toGeminiTools } from "../../src/voice/tools";
import { loadFixture } from "./load";

/**
 * Probe of Gemini explicit caching (feature 009; results in research R12, how to run in
 * quickstart §2): `npx tsx eval/voice/probeCache.ts [--model gemini-3.6-flash] [--fixture 1830-or]`.
 * Kept as the re-check tool when the default model changes: it creates, uses, extends and deletes
 * a cache the way the adapter does. Needs GEMINI_API_KEY; costs a few cents. The key goes only in
 * the x-goog-api-key header; it prints statuses and token counts only, and cache names are masked.
 */

const here = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({
  options: { model: { type: "string", default: "gemini-3.6-flash" }, fixture: { type: "string", default: "1830-or" } },
});
const model = values.model;
const apiKey = process.env["GEMINI_API_KEY"];
if (!apiKey) {
  console.error("Set GEMINI_API_KEY.");
  process.exit(1);
}

const BASE = "https://generativelanguage.googleapis.com/v1beta/";
const f = loadFixture(join(here, "fixtures"), values.fixture);
const transcript = readFileSync(join(here, "cases.jsonl"), "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => JSON.parse(l) as { fixture: string; transcript: string })
  .find((c) => c.fixture === values.fixture)?.transcript ?? "240, paga";

// The same fragments the adapter sends today (src/voice/providers/gemini.ts).
const systemInstruction = { parts: [{ text: systemPromptEs(f.session) }] };
const tools = toGeminiTools(buildToolSpecs(f.session));
const toolConfig = { functionCallingConfig: { mode: "ANY" } };
const contents = [{ role: "user", parts: [{ text: snapshotAndTranscript({ ...f.ctx, transcript }) }] }];
const generationConfig = { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: model === "gemini-3.8-flash" ? "low" : "minimal" } };

type Json = Record<string, unknown>;
const str = (v: unknown, fallback = "?") => (typeof v === "string" || typeof v === "number" ? String(v) : fallback);
const mask = (s: string) => s.replace(/cachedContents\/[\w-]+/g, "cachedContents/<id>");

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: Json; ms: number }> {
  const started = performance.now();
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey! },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json: Json;
  try {
    json = text ? (JSON.parse(text) as Json) : {};
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json, ms: Math.round(performance.now() - started) };
}

function errorOf(json: Json): string {
  const e = json["error"] as Json | undefined;
  return e ? mask(`${str(e["status"], "")}: ${str(e["message"], "")}`.slice(0, 300)) : "";
}

function generateSummary(json: Json): string {
  const u = (json["usageMetadata"] ?? {}) as Json;
  const cand = (json["candidates"] as Json[] | undefined)?.[0];
  const parts = ((cand?.["content"] as Json | undefined)?.["parts"] as Json[] | undefined) ?? [];
  const calls = parts.map((p) => p["functionCall"] as Json | undefined).filter(Boolean).map((c) => `${str(c!["name"])}(${JSON.stringify(c!["args"] ?? {})})`);
  return `prompt ${str(u["promptTokenCount"])}, cached ${str(u["cachedContentTokenCount"], "0")}, out ${str(u["candidatesTokenCount"])}, finish ${str(cand?.["finishReason"])}, calls ${calls.join(" ") || "none"}`;
}

function report(step: string, r: { status: number; json: Json; ms: number }, detail = "") {
  console.log(`\n[${step}] HTTP ${r.status} in ${r.ms} ms${r.status >= 400 ? `\n  error: ${errorOf(r.json)}` : ""}${detail ? `\n  ${detail}` : ""}`);
}

const generate = `models/${encodeURIComponent(model)}:generateContent`;
console.log(`Probe: ${model}, fixture ${values.fixture}, transcript «${transcript}»`);

// 0. Today's uncached request, for comparison.
const base = await call("POST", generate, { systemInstruction, tools, toolConfig, contents, generationConfig });
report("0 uncached (today)", base, base.status === 200 ? generateSummary(base.json) : "");

// 1. Create with system + tools + toolConfig (verify point 1).
let created = await call("POST", "cachedContents", { model: `models/${model}`, systemInstruction, tools, toolConfig, ttl: "300s" });
report("1 create with tools", created, created.status === 200 ? `totalTokenCount ${str((created.json["usageMetadata"] as Json | undefined)?.["totalTokenCount"])}, expireTime ${str(created.json["expireTime"])}` : "");
if (created.status !== 200) {
  created = await call("POST", "cachedContents", { model: `models/${model}`, systemInstruction, ttl: "300s" });
  report("1b create system only (fallback)", created, created.status === 200 ? `totalTokenCount ${str((created.json["usageMetadata"] as Json | undefined)?.["totalTokenCount"])}` : "");
}
const name = typeof created.json["name"] === "string" ? created.json["name"] : undefined;
if (!name) {
  console.log("\nNo cache could be created; stopping.");
  process.exit(0);
}

// 2. Use it: only cachedContent + contents + generationConfig.
const used = await call("POST", generate, { cachedContent: name, contents, generationConfig });
report("2 cached request", used, used.status === 200 ? generateSummary(used.json) : "");
const used2 = await call("POST", generate, { cachedContent: name, contents, generationConfig });
report("2b cached request again", used2, used2.status === 200 ? generateSummary(used2.json) : "");

// 3. Cache plus the same fields again (verify point 2): expected 400.
const dup = await call("POST", generate, { cachedContent: name, systemInstruction, tools, toolConfig, contents, generationConfig });
report("3 cached + tools/system resent", dup, dup.status === 200 ? generateSummary(dup.json) : "");

// 4. Extend TTL (verify point 3): without updateMask, then with it if needed.
let patched = await call("PATCH", name, { ttl: "600s" });
report("4 PATCH ttl (no updateMask)", patched, patched.status === 200 ? `expireTime ${str(patched.json["expireTime"])}` : "");
if (patched.status !== 200) {
  patched = await call("PATCH", `${name}?updateMask=ttl`, { ttl: "600s" });
  report("4b PATCH ttl (?updateMask=ttl)", patched, patched.status === 200 ? `expireTime ${str(patched.json["expireTime"])}` : "");
}

// 5. Delete, then use the deleted cache: the status the fallback must catch.
const deleted = await call("DELETE", name);
report("5 DELETE", deleted);
const gone = await call("POST", generate, { cachedContent: name, contents, generationConfig });
report("6 cached request after delete", gone, gone.status === 200 ? generateSummary(gone.json) : "");

console.log("\nDone. Paste everything above back into the chat.");
