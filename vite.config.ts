import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Research R17: strict CSP. Injected only in the production build, because the dev server
// relies on inline scripts and a websocket for hot reload.
const CSP = [
  "default-src 'self'",
  "connect-src 'self' https://api.anthropic.com",
  "script-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
].join("; ");

function cspMeta(): Plugin {
  return {
    name: "csp-meta",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "<head>",
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    cspMeta(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script",
      includeAssets: ["icons/*.png"],
      manifest: {
        name: "18xx Companion",
        short_name: "18xx",
        description: "Lleva el dinero de tus partidas de 18xx, por toque y por voz.",
        lang: "es",
        display: "standalone",
        orientation: "any",
        background_color: "#14161a",
        theme_color: "#14161a",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
        navigateFallback: "index.html",
      },
    }),
  ],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "domain",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          setupFiles: ["tests/setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["tests/**/*.test.tsx"],
          setupFiles: ["tests/setup.ts"],
        },
      },
    ],
  },
});
