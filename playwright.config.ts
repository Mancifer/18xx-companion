import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: "http://localhost:4173",
    locale: "es-ES",
    trace: "retain-on-failure",
  },
  projects: [
    // Feature 015: Chromium's fake microphone, looping a synthetic tone (not a voice recording), so
    // the Whisper e2e records real audio that passes the speech gate.
    {
      name: "phone",
      use: {
        ...devices["Pixel 7"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            `--use-file-for-fake-audio-capture=${resolve("e2e/fixtures/tone.wav")}`,
          ],
        },
      },
    },
    // WebKit has no fake-media flags; e2e/whisper.spec.ts stubs the media APIs there.
    { name: "tablet", use: { ...devices["iPad Pro 11 landscape"] } },
  ],
  webServer: {
    command: "npm run build && npm run preview",
    // Feature 015: .env.production keeps Whisper hidden until its audio check passes; the e2e
    // build offers it so e2e/whisper.spec.ts can run (process env overrides .env files in Vite).
    env: { VITE_WHISPER_LANGUAGES: "es,en" },
    port: 4173,
    reuseExistingServer: !process.env["CI"],
    timeout: 180_000,
  },
});
