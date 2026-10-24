import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  DeploymentsInvalidError,
  NotDeployedError,
  parseDeployments,
} from "../src"
import { defaultDeploymentsPath, loadDeployments } from "../src/node"

const vault = "0x5fbdb2315678afecb367f032d93f642f64180aa3"
const valid = {
  chainId: 31611,
  musd: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
  pots: vault,
  policyEngine: vault,
  relayer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  deployBlock: 123456,
}

describe("deployments", () => {
  it("parses and checksums, exposing vault", () => {
    const d = parseDeployments(valid)
    expect(d.vault).toBe("0x5FbDB2315678afecb367f032d93F642f64180aa3")
    expect(d.deployBlock).toBe(123456n)
  })

  it("rejects pots != policyEngine", () => {
    expect(() =>
      parseDeployments({ ...valid, policyEngine: valid.relayer }),
    ).toThrow(DeploymentsInvalidError)
  })

  it("rejects a missing field", () => {
    expect(() => parseDeployments({ ...valid, musd: undefined })).toThrow(
      DeploymentsInvalidError,
    )
  })

  it("loadDeployments: NotDeployedError when the file is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "ipin-"))
    expect(() => loadDeployments({ path: join(dir, "nope.json") })).toThrow(
      NotDeployedError,
    )
  })

  it("loadDeployments: reads a file and reports bad JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "ipin-"))
    const good = join(dir, "good.json")
    writeFileSync(good, JSON.stringify(valid))
    expect(loadDeployments({ path: good }).chainId).toBe(31611)
    const bad = join(dir, "bad.json")
    writeFileSync(bad, "{")
    expect(() => loadDeployments({ path: bad })).toThrow(
      DeploymentsInvalidError,
    )
  })

  it("default path is <repo>/deployments/mezo-testnet.json", () => {
    expect(defaultDeploymentsPath().replace(/\\/g, "/")).toMatch(
      /\/deployments\/mezo-testnet\.json$/,
    )
  })
})
