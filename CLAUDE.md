# CLAUDE.md — agent instructions for Ìpín

Ìpín is purpose-bound money on Mezo: a sender funds pots in MUSD, and money leaves a pot only to
approved payees, within caps, via signed requests or schedules. Mezo Buildathon Wave 1, submit Oct 25.
**README.md is the source of truth** (Scope, money rules R1–R10, invariants I1–I6, Mezo reference).

Read before writing code: `README.md` → `docs/money-rules.md` → `CODING_STANDARDS.md` → `docs/decisions.md`.

## Environment

Foundry is NOT on PATH (Windows, Git Bash). Prefix every forge/cast/anvil command:

```sh
export PATH="$HOME/.foundry/bin:$PATH"
```

Node 22, pnpm 11. Install with `pnpm install` at the repo root; Foundry deps are git submodules
(`git submodule update --init --recursive`).

## Commands (repo root)

| Command | What |
| --- | --- |
| `pnpm check` | fmt:check + lint + test. **Run before every commit. Must pass.** |
| `pnpm test` | `forge test` (fuzz runs 256) |
| `pnpm test:invariant` | invariant tests with the deeper `invariant` profile |
| `pnpm test:ci` | `ci` profile: 10k fuzz runs, deeper invariants (run before security reviews) |
| `pnpm fmt` / `pnpm fmt:check` | forge fmt |
| `pnpm lint` | exact-pragma check + solhint (0 warnings allowed) |

Single test: `cd contracts && forge test --mt test_R3_rejectsReplayedNonce -vvv`.
Mezo testnet RPC alias: `--rpc-url mezo_testnet`.

## Non-negotiables

1. **Wave 1 scope only.** Build only what the README Scope table lists under Wave 1. Wave 2 items
   (x402, agents, naira payouts, multiple senders, Base) are out — don't stub them in either.
2. **One path for money:** signed request (or on-chain schedule) → PolicyEngine → settlement.
   No function moves user funds out of a pot without passing the PolicyEngine. No "admin" or
   "emergency" shortcut, no special case for a use case, no test-only bypass in `src/`.
3. **Penny method:** for each rule, write the failing test first, see it fail, then fix. The test
   name cites the rule ID exactly as listed in `docs/money-rules.md`
   (`test_R3_rejectsReplayedNonce`, `invariant_I1_booksBalance`). New rule → add it to that doc first.
4. **No floats anywhere**, frontend included. On-chain `uint256` base units (18 dp); off-chain
   `bigint` only. `Number(...)`, `parseFloat`, `toFixed` on amounts are bugs. Use viem
   `parseUnits`/`formatUnits` at the UI edge only.
5. **Solidity safety defaults:** custom errors (no revert strings), checks-effects-interactions,
   `ReentrancyGuard` (`nonReentrant`) on every function that moves funds, `SafeERC20` for every
   token call, exact `pragma solidity 0.8.24;`, explicit visibility, events for every money state change.
6. **No workarounds.** If a lint rule, test, or convention blocks you, fix the code or change the
   convention openly (edit the config + record why in `docs/decisions.md`). Never: `// solhint-disable`
   without a one-line justification, `vm.skip`, commented-out tests, `--no-verify`, loosened
   invariants, or editing a test to match buggy behaviour.
7. **Open source only, cited.** Reused code must be under an OSS license and credited in the README
   Credits section (with link) in the same commit that adds it.
8. **Decisions are recorded.** Anything marked OPEN or proposed in `docs/decisions.md` is not yours to
   settle silently. Use the proposed default, and flag it in your report.

## Layout

```
docs/       money-rules.md, decisions.md, security reviews (docs/research/ is owned by another agent — don't touch)
contracts/  Foundry: src/ (Pots, PolicyEngine, adapters/), test/, script/
relayer/    TypeScript + viem: submits signed requests, runs schedules
app/        phone-first PWA: sender + requester screens
scripts/    simulate-month, booksBalance check, repo tooling (check-pragma.mjs)
```

## Before you say "done"

- `pnpm check` passes; `pnpm test:invariant` passes if you touched contracts.
- Every new money-moving path has rule-ID tests and is covered by an invariant handler.
- No new skipped tests, no new lint disables without justification.
- Report any proposed/OPEN decision you relied on.

## Git

Conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`). Never commit `.env`, keys, or
`broadcast/` output. Don't push or rewrite history unless asked.
