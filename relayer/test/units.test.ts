import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { getAddress } from "viem"
import { describe, expect, it } from "vitest"

import { mezoTestnet, NotDeployedError } from "@ipin/shared"

import { parseEnv } from "../src/env"
import { createRuntime } from "../src/runtime"
import { runSchedulerTick } from "../src/scheduler"
import { Store } from "../src/store"

import {
  deployments,
  FakeChain,
  makeRuntime,
  payee,
  relayerAccount,
  relayerKey,
  silentLogger,
} from "./helpers"

describe("env", () => {
  it("applies README defaults and requires the key", () => {
    const env = parseEnv({ RELAYER_PRIVATE_KEY: relayerKey })
    expect(env.RPC_URL).toBe("https://rpc.test.mezo.org")
    expect(env.PORT).toBe(8787)
    expect(env.CORS_ORIGIN).toEqual(["http://localhost:5173"])
    expect(() => parseEnv({})).toThrow(/RELAYER_PRIVATE_KEY/)
    expect(() => parseEnv({ RELAYER_PRIVATE_KEY: "0x1234" })).toThrow(/32-byte/)
  })

  it("accepts a key without 0x, a CORS list and '*'", () => {
    const env = parseEnv({
      RELAYER_PRIVATE_KEY: relayerKey.slice(2),
      CORS_ORIGIN: "https://a.example/, https://b.example",
      PORT: "9000",
    })
    expect(env.RELAYER_PRIVATE_KEY).toBe(relayerKey)
    expect(env.CORS_ORIGIN).toEqual(["https://a.example", "https://b.example"])
    expect(env.PORT).toBe(9000)
    expect(
      parseEnv({ RELAYER_PRIVATE_KEY: relayerKey, CORS_ORIGIN: "*" })
        .CORS_ORIGIN,
    ).toBe("*")
  })
})

describe("store", () => {
  it("persists requests and invites across restarts", () => {
    const path = join(mkdtempSync(join(tmpdir(), "ipin-relayer-")), "db.json")
    const store = new Store(path)
    store.addInvite({
      code: "c1",
      potId: 1n,
      label: "Site manager",
      createdAt: new Date(0).toISOString(),
    })
    store.claimInvite("c1", payee)
    store.addRequest(
      {
        id: "r1",
        potId: 1n,
        payee,
        item: "x",
        quantity: 2n,
        unitPrice: 3n,
        amount: 6n,
        vendor: "v",
        requester: payee,
        itemHash: `0x${"11".repeat(32)}`,
        status: "pending",
        createdAt: new Date(0).toISOString(),
      },
      `0x${"ab".repeat(65)}`,
    )
    store.updateRequest("r1", { status: "failed", error: "boom" })
    store.updateRequest("r1", { status: "pending", clearError: true })
    expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({
      version: 1,
    })

    const reloaded = new Store(path)
    expect(reloaded.getInvite("c1")?.claimedBy).toBe(payee)
    const r = reloaded.getRequest("r1")
    expect(r?.amount).toBe(6n)
    expect(r?.status).toBe("pending")
    expect(r && "error" in r).toBe(false)
    expect(reloaded.findBySignature(`0x${"AB".repeat(65)}`)?.id).toBe("r1")
  })
})

describe("runtime", () => {
  it("picks up a deployment that appears after startup", () => {
    let deployed = false
    const runtime = createRuntime({
      relayerAddress: relayerAccount.address,
      chainId: mezoTestnet.id,
      load: () => {
        if (!deployed) throw new NotDeployedError("deployments/x.json")
        return deployments
      },
      makeChain: () => new FakeChain(),
      logger: silentLogger,
    })
    expect(runtime.current()).toBeNull()
    expect(runtime.reason()).toMatch(/not deployed/)
    deployed = true
    expect(runtime.current()?.deployments.vault).toBe(deployments.vault)
  })

  it("refuses a deployment for another chain", () => {
    const runtime = createRuntime({
      relayerAddress: relayerAccount.address,
      chainId: mezoTestnet.id,
      load: () => ({ ...deployments, chainId: 1 }),
      makeChain: () => new FakeChain(),
      logger: silentLogger,
    })
    expect(runtime.current()).toBeNull()
    expect(runtime.reason()).toMatch(/chainId/)
  })
})

describe("test_R9 scheduler", () => {
  const schedule = (id: bigint, nextDue: bigint, active = true) => ({
    id,
    potId: 1n,
    payee: getAddress(payee),
    amount: 5n,
    active,
    nextDue,
  })

  it("executes only active, due schedules", async () => {
    const chain = new FakeChain()
    chain.now = 1_000n
    chain.schedules = [
      schedule(1n, 999n),
      schedule(2n, 1_000n),
      schedule(3n, 1_001n),
      schedule(4n, 10n, false),
    ]
    const result = await runSchedulerTick(makeRuntime(chain), silentLogger)
    expect(result?.checked).toBe(4)
    expect(chain.scheduleCalls).toEqual([1n, 2n])
    expect(result?.executed).toEqual(["1", "2"])
  })

  it("skips (never broadcasts) a schedule whose simulation fails", async () => {
    const chain = new FakeChain()
    chain.schedules = [schedule(1n, 0n)]
    chain.simulateError = "PayeeNotApproved(1, 0xbeef)"
    const result = await runSchedulerTick(makeRuntime(chain), silentLogger)
    expect(chain.scheduleCalls).toEqual([])
    expect(result?.skipped).toEqual([
      { id: "1", reason: "PayeeNotApproved(1, 0xbeef)" },
    ])
  })

  it("does nothing while not deployed", async () => {
    expect(await runSchedulerTick(makeRuntime(null), silentLogger)).toBeNull()
  })
})
