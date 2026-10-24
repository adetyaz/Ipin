import { inviteClaimMessage, requestSigningMessage } from "@ipin/shared"
import type { Hex } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

import { readJson, writeJson } from "#/storage"

/**
 * The requester's key (ADR-012): generated silently in the browser and kept in
 * localStorage. It never holds money and never authorises a payment on-chain;
 * it only proves to the relayer which registered requester is asking. If it is
 * lost, the sender sends a new invite.
 */
const KEY = "ipin:requester-key"

function loadOrCreate(): Hex {
  const existing = readJson<string>(KEY)
  if (existing && /^0x[0-9a-fA-F]{64}$/.test(existing)) return existing as Hex
  const fresh = generatePrivateKey()
  writeJson(KEY, fresh)
  return fresh
}

export function requesterAccount() {
  return privateKeyToAccount(loadOrCreate())
}

export function hasRequesterKey(): boolean {
  return readJson<string>(KEY) !== null
}

export async function signInviteClaim(code: string): Promise<Hex> {
  return requesterAccount().signMessage({ message: inviteClaimMessage(code) })
}

/** Sign a POST /requests body (EIP-191 over canonical JSON minus signature). */
export async function signRequestBody(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const message = requestSigningMessage(body)
  const signature = await requesterAccount().signMessage({ message })
  return { ...body, signature }
}
