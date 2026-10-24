// Writes the ABIs the relayer and app import to contracts/abi/<Name>.json.
// Run `pnpm abi` (it builds first). The output is committed so off-chain code
// does not need Foundry.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CONTRACTS = ["Vault", "IPots", "IPolicyEngine", "IERC20"];
const OUT = "contracts/out";
const DEST = "contracts/abi";

mkdirSync(DEST, { recursive: true });
for (const name of CONTRACTS) {
  const artifact = JSON.parse(readFileSync(join(OUT, `${name}.sol`, `${name}.json`), "utf8"));
  writeFileSync(join(DEST, `${name}.json`), `${JSON.stringify(artifact.abi, null, 2)}\n`);
  console.log(`wrote ${DEST}/${name}.json`);
}
