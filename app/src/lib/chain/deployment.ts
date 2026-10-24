import { type Deployments, parseDeployments } from "@ipin/shared"

/**
 * The deployment file (docs/api.md section 1) is read at build time from the
 * repo root, so no address is ever hand-copied. Before the first deploy the
 * file does not exist and the app shows "Not deployed yet" instead of failing.
 */
const files = import.meta.glob<unknown>("../../../../deployments/*.json", {
  eager: true,
  import: "default",
})

export type DeploymentState =
  | { status: "deployed"; deployments: Deployments }
  | { status: "missing" }
  | { status: "invalid"; message: string }

function load(): DeploymentState {
  const entry = Object.entries(files).find(([path]) =>
    path.endsWith("/mezo-testnet.json"),
  )
  if (!entry) return { status: "missing" }
  try {
    return {
      status: "deployed",
      deployments: parseDeployments(entry[1], "deployments/mezo-testnet.json"),
    }
  } catch (err) {
    return {
      status: "invalid",
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

export const deployment: DeploymentState = load()

export function requireDeployments(): Deployments {
  if (deployment.status !== "deployed") {
    throw new Error("Ìpín is not deployed on Mezo testnet yet.")
  }
  return deployment.deployments
}
