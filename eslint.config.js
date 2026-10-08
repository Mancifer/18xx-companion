import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

const noDangerousHtml = {
  selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
  message: "React escaping only: dangerouslySetInnerHTML is banned (research R17).",
};

export default defineConfig(
  { ignores: ["dist/", "coverage/", "node_modules/", "playwright-report/", "test-results/", "dev-dist/"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.node.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-syntax": ["error", noDangerousHtml],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // JSX handlers such as onClick={() => setOpen(x)} are clearer as arrow shorthands.
      "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Constitution: the domain is framework-free and the only place rules live.
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "react", message: "src/domain must not import React." }],
          patterns: [
            {
              group: ["**/ui/**", "**/voice/**", "**/persistence/**", "**/app/**"],
              message: "src/domain must not import ui, voice, persistence or app.",
            },
          ],
        },
      ],
    },
  },
  {
    // Only src/app owns the store. Everyone else goes through useSession.
    files: ["src/ui/**/*.{ts,tsx}", "src/voice/**/*.{ts,tsx}", "src/persistence/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/app/SessionStore", "**/app/SessionStore.ts"],
              message: "Use src/app/useSession.ts instead of the store internals.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["tests/**", "e2e/**", "eval/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
