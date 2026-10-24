import type { ErrorCode } from "@ipin/shared"

/** An error the HTTP layer returns as `{ error: { code, message } }`. */
export class ApiError extends Error {
  override name = "ApiError"
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 500 | 502 | 503,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export const notDeployed = (): ApiError =>
  new ApiError(
    503,
    "NOT_DEPLOYED",
    "Ipin is not deployed yet (deployments/mezo-testnet.json is missing).",
  )
