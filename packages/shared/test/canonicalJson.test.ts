import { describe, expect, it } from "vitest"

import {
  canonicalJson,
  inviteClaimMessage,
  rejectMessage,
  requestSigningMessage,
} from "../src"

describe("canonicalJson", () => {
  it("sorts keys recursively and drops whitespace", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: "x" } })).toBe(
      '{"a":{"c":"x","d":[3,{"y":2,"z":1}]},"b":1}',
    )
  })

  it("is independent of insertion order", () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }))
  })

  it("omits undefined properties, keeps null", () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}')
  })

  it("escapes strings like JSON", () => {
    expect(canonicalJson({ s: 'Ìpín "x"\n' })).toBe('{"s":"Ìpín \\"x\\"\\n"}')
  })

  it("rejects ambiguous values", () => {
    expect(() => canonicalJson({ a: 1n })).toThrow(TypeError)
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(TypeError)
    expect(() => canonicalJson([undefined])).toThrow(TypeError)
  })

  it("request signing message excludes the signature", () => {
    expect(
      requestSigningMessage({ potId: "1", signature: "0xabc", item: "x" }),
    ).toBe('{"item":"x","potId":"1"}')
  })

  it("fixed messages", () => {
    expect(inviteClaimMessage("abc")).toBe("Ipin invite abc")
    expect(rejectMessage("r1")).toBe("Ipin reject r1")
  })
})
