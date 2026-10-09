import "fake-indexeddb/auto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFixture, FIXTURE_SPECS } from "./fixtureSpecs";

/** `npx tsx eval/voice/buildFixtures.ts`: regenerates eval/voice/fixtures/*.json (T135). */

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
mkdirSync(dir, { recursive: true });
for (const spec of FIXTURE_SPECS) {
  const exported = await buildFixture(spec);
  writeFileSync(join(dir, `${spec.id}.json`), `${JSON.stringify(exported, null, 2)}\n`, "utf8");
  console.log(`${spec.id}: ${exported.entries.length} entries`);
}
