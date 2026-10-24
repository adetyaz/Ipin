/**
 * Canonical JSON: object keys sorted by UTF-16 code unit, no whitespace,
 * `undefined` properties omitted. Requesters sign `canonicalJson(body minus
 * signature)` with EIP-191 personal_sign (docs/api.md section 3).
 * Throws on bigint, non-finite numbers, functions and undefined array items so
 * a signature never covers an ambiguous encoding.
 */
export function canonicalJson(value: unknown): string {
  return encode(value, "$")
}

function encode(value: unknown, path: string): string {
  if (value === null) return "null"
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value)
    case "number":
      if (!isFinite(value)) throw new TypeError(`${path}: non-finite number`)
      return JSON.stringify(value)
    case "object": {
      if (Array.isArray(value)) {
        const items: unknown[] = value
        return `[${items.map((v, i) => encode(v, `${path}[${i}]`)).join(",")}]`
      }
      const record = value as Record<string, unknown>
      const parts: string[] = []
      for (const key of Object.keys(record).sort()) {
        const v = record[key]
        if (v === undefined) continue
        parts.push(`${JSON.stringify(key)}:${encode(v, `${path}.${key}`)}`)
      }
      return `{${parts.join(",")}}`
    }
    default:
      throw new TypeError(`${path}: cannot encode ${typeof value}`)
  }
}

/** The message a requester signs for POST /requests: the body without `signature`. */
export function requestSigningMessage(body: Record<string, unknown>): string {
  const rest = Object.fromEntries(
    Object.entries(body).filter(([key]) => key !== "signature"),
  )
  return canonicalJson(rest)
}

/** Message the requester key signs to claim an invite. */
export function inviteClaimMessage(code: string): string {
  return `Ipin invite ${code}`
}

/** Message the pot's sender signs to reject a request. */
export function rejectMessage(requestId: string): string {
  return `Ipin reject ${requestId}`
}
