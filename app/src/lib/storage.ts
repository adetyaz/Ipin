/**
 * localStorage that never throws: private windows and blocked storage fall
 * back to "nothing saved" instead of breaking the page.
 */
export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as T)
  } catch {
    return null
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

// ---- Requester: invites this phone has accepted ----

export interface JoinedPot {
  code: string
  potId: string
  label: string
  joinedAt: string
  potName?: string
  /** The sender's names for payee addresses, carried in the invite link. */
  payeeNames?: Record<string, string>
}

const JOINED = "ipin:joined-pots"

export function joinedPots(): JoinedPot[] {
  return readJson<JoinedPot[]>(JOINED) ?? []
}

export function rememberJoined(pot: JoinedPot): void {
  const rest = joinedPots().filter((p) => p.code !== pot.code)
  writeJson(JOINED, [pot, ...rest])
}

// ---- Sender: invite links created per pot ----

export interface SentInvite {
  code: string
  url: string
  potId: string
  label: string
  createdAt: string
}

const SENT = "ipin:sent-invites"

export function sentInvites(potId: bigint): SentInvite[] {
  return (readJson<SentInvite[]>(SENT) ?? []).filter(
    (i) => i.potId === potId.toString(),
  )
}

export function rememberInvite(invite: SentInvite): void {
  const all = readJson<SentInvite[]>(SENT) ?? []
  writeJson(SENT, [invite, ...all.filter((i) => i.code !== invite.code)])
}

// ---- Sender: their own names for payee addresses (this device only) ----

const LABELS = "ipin:payee-labels"

export function payeeLabels(): Record<string, string> {
  return readJson<Record<string, string>>(LABELS) ?? {}
}

export function setPayeeLabel(address: string, label: string): void {
  const all = payeeLabels()
  if (label.trim() === "") delete all[address.toLowerCase()]
  else all[address.toLowerCase()] = label.trim()
  writeJson(LABELS, all)
}

export function payeeLabel(address: string): string | undefined {
  return payeeLabels()[address.toLowerCase()]
}

// ---- Invite links carry payee names in the #fragment (never sent to a server) ----

export function encodePayeeNames(names: Record<string, string>): string {
  return Object.keys(names).length === 0
    ? ""
    : `#p=${encodeURIComponent(JSON.stringify(names))}`
}

export function decodePayeeNames(hash: string): Record<string, string> {
  const m = /[#&]p=([^&]*)/.exec(hash)
  if (!m?.[1]) return {}
  try {
    const raw: unknown = JSON.parse(decodeURIComponent(m[1]))
    if (typeof raw !== "object" || raw === null) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) {
      if (/^0x[0-9a-fA-F]{40}$/.test(k) && typeof v === "string") {
        out[k.toLowerCase()] = v.slice(0, 40)
      }
    }
    return out
  } catch {
    return {}
  }
}

// ---- Sender: approvals signed on this device (M-01) ----
// If the relayer never submits a signed approval, the sender can cancel it
// on-chain with invalidateNonce(nonce). Kept until settled or cancelled.

export interface SignedApproval {
  requestId: string
  nonce: string
  expiry: string
}

const SIGNED = "ipin:signed-approvals"

export function signedApproval(requestId: string): SignedApproval | undefined {
  return (readJson<SignedApproval[]>(SIGNED) ?? []).find(
    (a) => a.requestId === requestId,
  )
}

export function rememberSignedApproval(a: SignedApproval): void {
  const rest = (readJson<SignedApproval[]>(SIGNED) ?? []).filter(
    (x) => x.requestId !== a.requestId,
  )
  writeJson(SIGNED, [a, ...rest])
}

export function forgetSignedApproval(requestId: string): void {
  writeJson(
    SIGNED,
    (readJson<SignedApproval[]>(SIGNED) ?? []).filter(
      (x) => x.requestId !== requestId,
    ),
  )
}
