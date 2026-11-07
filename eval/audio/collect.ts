import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { candidateToManifest, ManifestLineSchema, nextId, type Candidate } from "./lib";

/**
 * Feature 015 T041 (contracts/audio-check.md): `npm run eval:audio:collect -- <downloads folder>`.
 * Moves each `candidate-*.json` that has an `audio` file (saved with "Grabar clips de control") into
 * the audio check set: the clip to eval/audio/clips/, the session export to eval/audio/fixtures/,
 * and one line to eval/audio/manifest.jsonl. Clips and fixtures stay out of git; the manifest holds
 * no audio and may be committed.
 */

const here = dirname(fileURLToPath(import.meta.url));
const folder = process.argv[2];
if (!folder) {
  console.error("Usage: npm run eval:audio:collect -- <folder with candidate-*.json and their audio>");
  process.exit(1);
}

const clipsDir = join(here, "clips");
const fixturesDir = join(here, "fixtures");
const manifest = join(here, "manifest.jsonl");
mkdirSync(clipsDir, { recursive: true });
mkdirSync(fixturesDir, { recursive: true });

const ids = existsSync(manifest)
  ? readFileSync(manifest, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => ManifestLineSchema.parse(JSON.parse(l)).id)
  : [];

let added = 0;
for (const name of readdirSync(folder).filter((n) => /^candidate-.*\.json$/.test(n)).sort()) {
  const path = join(folder, name);
  const candidate = JSON.parse(readFileSync(path, "utf8")) as Candidate;
  if (!candidate.audio) {
    console.log(`skip ${name}: no audio (record with "Grabar clips de control" on)`);
    continue;
  }
  const clip = join(folder, candidate.audio);
  if (!existsSync(clip)) {
    console.log(`skip ${name}: ${candidate.audio} not found next to it`);
    continue;
  }
  const lang = candidate.lang ?? "es";
  const id = nextId(ids, lang);
  const audio = `${id}${extname(candidate.audio)}`;
  copyFileSync(clip, join(clipsDir, audio));
  writeFileSync(join(fixturesDir, `${id}.json`), `${JSON.stringify(candidate.fixture, null, 2)}\n`, "utf8");
  const line = candidateToManifest(candidate, { id, audio, fixture: id });
  appendFileSync(manifest, `${JSON.stringify(line)}\n`, "utf8");
  unlinkSync(clip);
  unlinkSync(path);
  ids.push(id);
  added += 1;
  const engines = line.browserTranscript !== undefined ? "browser + whisper" : "whisper only";
  console.log(`add  ${id} [${engines}] «${candidate.transcript}»${line.mentionsName ? " (names)" : ""}`);
}
console.log(`\n${added} clip(s) added to ${manifest}`);
