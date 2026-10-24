import js from "@eslint/js"
import simpleImportSort from "eslint-plugin-simple-import-sort"
import svelte from "eslint-plugin-svelte"
import globals from "globals"
import ts from "typescript-eslint"

import svelteConfig from "./svelte.config.js"

// R1 / T3: no floats on amounts. These are banned app-wide; amounts are bigint
// and only viem parseUnits/formatUnits convert at the UI edge.
const noFloats = [
  {
    selector: "CallExpression[callee.name='parseFloat']",
    message: "R1: no floats. Use parseUnits.",
  },
  {
    selector: "CallExpression[callee.name='Number']",
    message: "R1: no Number(). Amounts are bigint.",
  },
  {
    selector: "CallExpression[callee.property.name='toFixed']",
    message: "R1: no toFixed. Use formatUnits.",
  },
  {
    selector: "MemberExpression[object.name='Math']",
    message: "R1: no Math.* on amounts. Use bigint.",
  },
]

export default ts.config(
  { ignores: [".svelte-kit/", "build/", "node_modules/"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      // Off: the app is served at "/" with no kit.paths.base, and many links
      // are external (explorer, faucet, wa.me), so resolve() adds nothing.
      "svelte/no-navigation-without-resolve": "off",
    },
  },
  {
    // App code only; scripts/gen-icons.mjs does pixel geometry, not money.
    files: ["src/**/*.{ts,svelte}"],
    rules: { "no-restricted-syntax": ["error", ...noFloats] },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: [".svelte"],
        parser: ts.parser,
        svelteConfig,
      },
    },
  },
)
