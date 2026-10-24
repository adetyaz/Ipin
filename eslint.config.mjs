// Shared ESLint flat config for the TypeScript workspaces (packages/*, relayer/).
// Each workspace runs `eslint .` from its own directory; app/ brings its own config.
// See CODING_STANDARDS T1-T7, M14 and docs/decisions.md ADR-015.
import js from "@eslint/js"
import globals from "globals"
import simpleImportSort from "eslint-plugin-simple-import-sort"
import tseslint from "typescript-eslint"

// T3 / R1: no floats on money. parseFloat and toFixed are banned everywhere;
// Number(...) is banned in packages/shared and relayer, where every amount lives.
const floatBans = {
  "no-restricted-globals": [
    "error",
    { name: "parseFloat", message: "No floats on money (T3, R1). Use bigint." },
  ],
  "no-restricted-properties": [
    "error",
    {
      object: "Number",
      property: "parseFloat",
      message: "No floats on money (T3, R1). Use bigint.",
    },
    {
      property: "toFixed",
      message: "No floats on money (T3, R1). Use formatMusd().",
    },
  ],
}

const numberBan = {
  "no-restricted-syntax": [
    "error",
    {
      selector: "CallExpression[callee.name='Number']",
      message:
        "No Number(...) in shared/relayer (T3, R1). Use BigInt or zod coercion.",
    },
  ],
}

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/data/**",
      "**/logs/**",
      "contracts/**",
      "app/**",
      "docs/**",
      "scripts/**",
      "eslint.config.mjs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      // M14: Thesis import groups: packages, internal packages, #/ aliases,
      // side-effect imports, parent paths, sibling paths, styles.
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            ["^node:", "^@?\\w"],
            ["^@ipin/"],
            ["^#/"],
            ["^\\u0000"],
            ["^\\.\\.(?!/?$)", "^\\.\\./?$"],
            ["^\\./(?=.*/)(?!/?$)", "^\\.(?!/?$)", "^\\./?$"],
            ["^.+\\.s?css$"],
          ],
        },
      ],
      "simple-import-sort/exports": "error",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
      ...floatBans,
    },
  },
  {
    // Plain JS build scripts: no type information.
    files: ["**/*.mjs", "**/*.js"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: globals.node,
    },
  },
  {
    files: ["packages/**/*.ts", "relayer/**/*.ts"],
    rules: numberBan,
  },
  {
    // The browser entry of @ipin/shared must not pull in Node built-ins.
    files: ["packages/shared/src/**/*.ts"],
    ignores: ["packages/shared/src/node.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*", "fs", "path"],
              message: "Browser entry: Node built-ins only in src/node.ts.",
            },
          ],
        },
      ],
    },
  },
)
