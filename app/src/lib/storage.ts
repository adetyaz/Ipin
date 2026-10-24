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
