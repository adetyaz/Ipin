// Node-only entry (@ipin/shared/node): reads the deployment file from disk.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import {
  type Deployments,
  DeploymentsInvalidError,
  type Network,
  NotDeployedError,
  parseDeployments,
} from "./deployments"

/** Default location: <repo root>/deployments/<network>.json. */
export function defaultDeploymentsPath(
  network: Network = "mezo-testnet",
): string {
  return fileURLToPath(
    new URL(`../../../deployments/${network}.json`, import.meta.url),
  )
}

/**
 * Load and validate the deployment file. Throws NotDeployedError if it does
 * not exist yet, DeploymentsInvalidError if it is malformed.
 */
export function loadDeployments(
  opts: { network?: Network; path?: string } = {},
): Deployments {
  const path = opts.path ?? defaultDeploymentsPath(opts.network)
  let text: string
  try {
    text = readFileSync(path, "utf8")
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new NotDeployedError(path)
    }
    throw err
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (err) {
    throw new DeploymentsInvalidError(`${path} is not JSON: ${String(err)}`)
  }
  return parseDeployments(json, path)
}
