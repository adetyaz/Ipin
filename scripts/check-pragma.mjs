// Fails if any first-party Solidity file uses a pragma other than the pinned one.
// solhint's compiler-version rule accepts floating ranges (^0.8.24), so we enforce exact pinning here.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PINNED = "pragma solidity 0.8.24;";
const ROOTS = ["contracts/src", "contracts/test", "contracts/script"];

function walk(dir) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (p.endsWith(".sol")) out.push(p);
  }
  return out;
}

const bad = [];
for (const file of ROOTS.flatMap(walk)) {
  const pragmas = readFileSync(file, "utf8").match(/^\s*pragma\s+solidity[^;]*;/gm) ?? [];
  if (pragmas.length !== 1 || pragmas[0].trim() !== PINNED) bad.push(`${file}: ${pragmas.join(" | ") || "missing pragma"}`);
}
if (bad.length) {
  console.error(`Floating/missing pragma (expected exactly "${PINNED}"):\n  ${bad.join("\n  ")}`);
  process.exit(1);
}
