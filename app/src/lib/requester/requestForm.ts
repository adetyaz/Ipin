import { type Address, getAddress, isAddress } from "viem"

import { parseUsdInput } from "#/money/format"

export interface RequestFormInput {
  item: string
  quantity: string
  unitPrice: string
  vendor: string
  payee: string
  note: string
}

export interface RequestFormValue {
  item: string
  quantity: bigint
  unitPrice: bigint
  total: bigint
  vendor: string
  payee: Address
  note?: string
}

export type FieldErrors = Partial<Record<keyof RequestFormInput, string>>

export type RequestFormResult =
  | { ok: true; value: RequestFormValue }
  | { ok: false; errors: FieldErrors; total: bigint | null }

const MAX_TEXT = 200
const MAX_NOTE = 500

/**
 * Validate the requester's "New request" form. Amounts are bigint throughout
 * (R1): quantity is a whole number, unit price is parsed with parseUnits.
 * `payees` are the pot's approved payees read from chain; anything else is
 * refused here, and again by the relayer and the contract (I5).
 */
export function validateRequestForm(
  input: RequestFormInput,
  payees: readonly Address[],
  requester?: Address,
): RequestFormResult {
  const errors: FieldErrors = {}

  const item = input.item.trim()
  if (item === "") errors.item = "Say what you're buying."
  else if (item.length > MAX_TEXT) errors.item = "Keep it under 200 characters."

  const q = input.quantity.trim()
  let quantity: bigint | null = null
  if (q === "") errors.quantity = "How many?"
  else if (!/^\d+$/.test(q)) errors.quantity = "Use a whole number, like 5."
  else if (BigInt(q) === 0n) errors.quantity = "At least 1."
  else quantity = BigInt(q)

  let unitPrice: bigint | null = null
  const price = parseUsdInput(input.unitPrice)
  if (!price.ok) errors.unitPrice = price.error
  else if (price.value === 0n)
    errors.unitPrice = "The price must be above $0.00."
  else unitPrice = price.value

  const vendor = input.vendor.trim()
  if (vendor === "") errors.vendor = "Who are you buying from?"
  else if (vendor.length > MAX_TEXT)
    errors.vendor = "Keep it under 200 characters."

  let payee: Address | null = null
  if (input.payee === "") errors.payee = "Choose who gets paid."
  else if (!isAddress(input.payee, { strict: false })) {
    errors.payee = "That isn't a valid payee."
  } else {
    const p = getAddress(input.payee)
    if (!payees.some((a) => a.toLowerCase() === p.toLowerCase())) {
      errors.payee = "Choose one of the pot's approved payees."
    } else if (requester && p.toLowerCase() === requester.toLowerCase()) {
      errors.payee = "You can't pay yourself from this pot."
    } else payee = p
  }

  const note = input.note.trim()
  if (note.length > MAX_NOTE)
    errors.note = "Keep the note under 500 characters."

  const total =
    quantity !== null && unitPrice !== null ? quantity * unitPrice : null

  if (
    Object.keys(errors).length > 0 ||
    quantity === null ||
    unitPrice === null ||
    payee === null ||
    total === null
  ) {
    return { ok: false, errors, total }
  }
  return {
    ok: true,
    value: {
      item,
      quantity,
      unitPrice,
      total,
      vendor,
      payee,
      ...(note === "" ? {} : { note }),
    },
  }
}
