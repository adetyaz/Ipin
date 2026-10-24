// Generates src/abi/generated.ts from contracts/abi/*.json (written by `pnpm abi`
// at the repo root) so viem gets `as const` ABIs with full types. Never edit the
// output by hand; test/abi.test.ts fails if it drifts from contracts/abi.
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { buildAbis } from "./abi-sources.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const abiDir = join(here, "../../../contracts/abi")
const out = join(here, "../src/abi/generated.ts")

const read = (name) =>
  JSON.parse(readFileSync(join(abiDir, `${name}.json`), "utf8"))
writeFileSync(out, buildAbis(read))
console.log(`wrote ${out}`)
