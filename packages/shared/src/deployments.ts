import { type Address, getAddress, isAddress } from "viem"
import { z } from "zod"

export type Network = "mezo-testnet"

export class NotDeployedError extends Error {
  override name = "NotDeployedError"
  constructor(readonly location: string) {
    super(
      `Ipin is not deployed yet: ${location} not found. Deploy the contracts (contracts/script/Deploy.s.sol writes it).`,
    )
  }
}

export class DeploymentsInvalidError extends Error {
  override name = "DeploymentsInvalidError"
}

const address = z
  .string()
  .refine((s) => isAddress(s, { strict: false }), "not an address")
  .transform((s) => getAddress(s))

const blockNumber = z
  .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
  .transform((v) => BigInt(v))

/** docs/api.md section 1. Extra keys are kept (the deploy may add more). */
export const deploymentsSchema = z.looseObject({
  chainId: z.number().int().positive(),
  musd: address,
  pots: address,
  policyEngine: address,
  relayer: address,
  deployBlock: blockNumber,
})

export type Deployments = z.output<typeof deploymentsSchema> & {
  /** The single Vault (pots == policyEngine in Wave 1). */
  vault: Address
}

/** Validate a parsed deployment file (browser-safe: pass the JSON in). */
export function parseDeployments(
  json: unknown,
  source = "deployments",
): Deployments {
  const result = deploymentsSchema.safeParse(json)
  if (!result.success) {
    throw new DeploymentsInvalidError(
      `${source} is invalid: ${z.prettifyError(result.error)}`,
    )
  }
  const d = result.data
  if (d.pots !== d.policyEngine) {
    throw new DeploymentsInvalidError(
      `${source}: pots and policyEngine must be the same Vault address in Wave 1 (docs/api.md section 1)`,
    )
  }
  return { ...d, vault: d.pots }
}
