import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { buildAbis } from "../scripts/abi-sources.mjs"

const abiDir = join(import.meta.dirname, "../../../contracts/abi")
const generated = join(import.meta.dirname, "../src/abi/generated.ts")

describe("ABI re-exports", () => {
  it("src/abi/generated.ts is in sync with contracts/abi (run gen:abi)", () => {
    const read = (name: string): unknown =>
      JSON.parse(readFileSync(join(abiDir, `${name}.json`), "utf8"))
    expect(readFileSync(generated, "utf8").replace(/\r\n/g, "\n")).toBe(
      buildAbis(read),
    )
  })
})
