# Status audit (Sat 2026-10-24, submission due 2026-10-25)

Audit only. No code changed. Snapshot of `main` at `181fd86`.

## Summary

1. Contracts cover only deposits: pots, split-on-deposit with a remainder rule, permit deposit, and `booksBalance()`. **No money can leave a pot yet.** There is no PolicyEngine, no payee allowlist, no signed-request settlement, no schedule, no fee, no pending or refund, and no savings code.
2. Tests: 17/17 pass (R1, R2, I1, I2 plus mock and typehash tests). There are 0 invariant tests and the handlers directory is empty. `pnpm check` passes. `forge build` exits 1 because the forge 1.8.5 built-in linter reports 13 warnings.
3. Rules: 2 of 10 implemented and tested (R1, R2). Invariants: I1 partly done (deposits only, no invariant test), I2 done as a fuzz test. R3–R10 and I3–I6 are missing.
4. Off-chain: relayer/, adapters/ and app/ hold only `.gitkeep`. scripts/ has only `check-pragma.mjs`. No deploy script, no broadcast output, no addresses, no `.env`.
5. Last commit was Oct 18 (6 days ago). Of the README "Done when" items, only part of "Contracts" is done (deposit and split). Of the 9 user stories, US1 is mostly done and US6 is partly done. The rest are missing.

## Tests

Run on 2026-10-24 with forge 1.8.5 and solc 0.8.24.

| Command | Result |
| --- | --- |
| `forge test` | **17 passed, 0 failed, 0 skipped** (Pots.t.sol 12, MockMUSD.t.sol 3, PaymentRequest.t.sol 2) |
| `pnpm test:invariant` (`--match-test invariant_`) | `Warning: no tests match the provided pattern` (0 invariant tests) |
| `pnpm check` | exit 0 (fmt, pragma check, solhint 0 warnings, tests) |
| `forge build` / `pnpm build` | **exit 1**: `Error: post-build lint step failed ... aborting due to 13 linter warning(s)`. Compilation itself succeeds. |

The forge-lint warnings are all in `src/Pots.sol`:
- 3x `reentrancy-events` at lines 241, 247 and 250. Events are emitted after the `permit` external call in `depositWithPermit`.
- 4x `require-revert-in-loop` in `createSplit`.
- 3x `uninitialized-local`.
- 2x `uninitialized-state`. `_totalPending` and `_unclaimedFees` are never written because R4 and R5 are not built.
- 1x `unsafe-typecast` at line 93 (`uint64(block.timestamp)`).

Either fix them, or turn off the specific forge lint rules in `foundry.toml` and record why in `docs/decisions.md`. `forge script` may hit the same lint gate during deploy.

## Rules & invariants matrix

Legend: ✓ implemented and tested · ~ partial · ✗ missing.

| ID | Status | Implemented in | Tests |
| --- | --- | --- | --- |
| R1 Units | ✓ (contracts only) | `Pots` uses `uint256` base units everywhere | `test_R1_amountsAreBaseUnits`. `testFuzz_R1_noPrecisionLossOnRoundTrip` is listed in money-rules but missing. Nothing exists off-chain to check. |
| R2 Splits | ✓ | `Pots.createSplit`, `Pots._deposit`, `depositWithPermit` | `testFuzz_R2_splitSumsToDeposit`, `test_R2_remainderGoesToNamedPot`, `_rejectsWeightsNot10000`, `_rejectsZeroWeight`, `_rejectsDuplicatePot`, `_rejectsRemainderPotOutsideSplit`, `_rejectsForeignPotInSplit`, `_onlySplitOwnerDeposits`, `_depositWithPermit` (all 9 listed names exist) |
| R3 Replays | ✗ | Only the `nonce` and `expiry` fields in the `PaymentRequest` struct. No nonce storage and no check. | none |
| R4 Fees | ✗ | `_unclaimedFees` is declared and never written. No FEE constant or immutable. | none |
| R5 Pending | ✗ | `_totalPending` is declared and never written. `IPayeeAdapter.isAsync` exists only as an interface. | none |
| R6 Refunds | ✗ | — | none |
| R7 Caps | ~ | `Pot.cap` and `createdAt` are stored. Nothing enforces them. No `spent[pot][period]`. | none |
| R8 Approval | ✗ | `PaymentRequests.hash` (struct hash only). No EIP712 domain, no signature verification. | Only the typehash and struct-hash tests (not R8 tests) |
| R9 Schedule | ✗ | — | none |
| R10 Savings | ✗ | Seams only: `_savingsPrincipal()` and `_totalSaved()` return 0 | none |
| I1 Books | ~ | `booksBalance()` (view), `totalAssets`, `totalLiabilities`, `surplus` | `test_I1_booksBalanceAfterDeposits`, `test_I1_surplusDoesNotBreakBooks`. `invariant_I1_booksBalance` is missing. |
| I2 Deposits | ~ | `PotCredited` per pot; Σ == `Deposited.amount` | Checked inside `testFuzz_R2_splitSumsToDeposit`. `invariant_I2_depositEqualsCredits` is missing. |
| I3 Caps | ✗ | — | none |
| I4 Nonces | ✗ | — | none |
| I5 Payees | ✗ | No payee allowlist | none |
| I6 Approval | ✗ | — | none |

## Contracts

| File | What | Used? |
| --- | --- | --- |
| `src/Pots.sol` (abstract) | Pots, splits, deposits, books | Yes (base of Vault) |
| `src/Vault.sol` | `Vault is Pots`; constructor only | Yes (test fixture). Nothing deployed. |
| `src/interfaces/IPolicy.sol` | `PaymentContext` struct and `check()` | **No.** Nothing imports it. |
| `src/interfaces/IPayeeAdapter.sol` | `onPayout`, `isAsync` | **No.** Nothing imports it. Its NatSpec mentions `confirmPayout`, `failPayout` and `reversePayout`, which don't exist. |
| `src/libraries/PaymentRequests.sol` | EIP-712 struct and typehash | Only from `test/PaymentRequest.t.sol` |
| `src/policies/`, `src/adapters/` | empty (untracked) | — |
| `test/mocks/MockMUSD.sol` | 18 dp, permit, "Mezo USD" v1 | Yes |
| `test/utils/IpinTest.sol` | fixture | Yes |
| `test/invariant/handlers/` | empty | — |

Specific checks:
- **Can the requester be the payee?** There is no payee or request logic, so nothing enforces this. Note that under ADR-008 the requester has no chain key, so the protection must come from (a) the contract paying only allowlisted payees (I5), (b) the relayer rejecting a request whose payee is the requester's registered payout address, and (c) a contract-level check if requesters ever get an on-chain address. **Missing.**
- **SignatureChecker (ERC-1271) for approval?** No. Neither `SignatureChecker`, `ECDSA` nor `EIP712` is imported anywhere. ADR-008 (proposed) requires SignatureChecker.
- **Is `booksBalance()` a view?** Yes (`public view returns (bool)`), and it is `assets >= liabilities` per ADR-010 (proposed).
- **Savings-vault adapter?** No. There are only seams in `Pots`. Research confirms that `MUSDSavingsRate` (sMUSD, not ERC-4626, 1:1 principal, yield via `claimYield`) is callable from a contract (`docs/research/mezo.md` §1).
- **Admin path that moves funds?** None. No owner, no withdraw or sweep. Today **no** function moves funds out at all.
- **Revert strings / floating pragma / skipped tests?** None. Custom errors only, exact `0.8.24` everywhere (`check-pragma.mjs` passes), 0 skipped, no `solhint-disable`.
- **OZ version:** the submodule reports `git describe` as `v4.8.0-1217-…` because tags are missing, but `package.json` says 5.7.0, which matches ADR-004.

## Off-chain components

| Dir | State | Key files |
| --- | --- | --- |
| `relayer/` | empty | `.gitkeep` |
| `adapters/` | empty | `.gitkeep` |
| `app/` | empty | `.gitkeep` |
| `scripts/` | tooling only | `check-pragma.mjs` (no simulate-month, no booksBalance check) |
| `packages/` | does not exist | `pnpm-workspace.yaml` lists relayer, adapters and app as packages. None has a `package.json`. |

## Deploy state

- `contracts/script/`: only `.gitkeep`. No deploy script.
- No `broadcast/` output. No contract addresses anywhere in the repo.
- `.env`: **not present** (checked the root, `contracts/` and `relayer/`). No `.env.example` either.
- An RPC alias `mezo_testnet` is set in `foundry.toml`. The `[etherscan]` section is empty, so verification is not configured.

## Worktrees & branches

| Worktree / branch | Commits not on main | Uncommitted | Delete loses work? |
| --- | --- | --- | --- |
| `.claude/worktrees/agent-a48b4a7917a14e525` on branch `worktree-agent-a48b4a7917a14e525` (at `90147fb`) | **none** (`git log main..branch` is empty; the branch is 1 commit behind main) | **none** (`status --short` is empty) | **No.** Safe: `git worktree remove .claude/worktrees/agent-a48b4a7917a14e525 && git branch -d worktree-agent-a48b4a7917a14e525` |

No other branches and no remotes are listed. `.claude/` itself is untracked on main.

## Candidate deletions

| Item | Class |
| --- | --- |
| The worktree and branch above | Obvious junk (fully merged, clean) |
| `contracts/src/.gitkeep` (src now has files) | Obvious junk |
| README "Status: planning done, no code yet" and "Proposed repo layout (not created yet)" | Stale. Update rather than delete. Needs user OK (README is the source of truth). |
| `contracts/README.md` "No feature code yet" | Stale. Obvious fix. |
| Duplicate **ADR-008** number (lint `gas-small-strings` and Wallets) | Renumber one. Needs user OK (append-only ADR log). |
| `IPayeeAdapter` NatSpec referencing `confirmPayout`, `failPayout` and `reversePayout` that don't exist | Fix when R5/R6 land, or trim. Keep the interface. |
| `IPolicy`, `IPayeeAdapter`, `PaymentRequests` (unused today) | **Keep.** They are the planned seams. Delete only if the PolicyEngine is dropped. Needs user OK. |
| Empty untracked dirs `src/policies`, `src/adapters`, `test/invariant/handlers` | Harmless. Leave them, or delete if the work is cut. |
| `relayer/`, `adapters/`, `app/` placeholders and the pnpm workspace entries | Keep if they will be built. If scope is cut, remove them. Needs user OK. |

## User stories gap list

| US | Status | Have | Needed |
| --- | --- | --- | --- |
| US1 Deposit and split into named pots (R2) | **Partial (contracts done)** | `createPot`, `createSplit`, `deposit`, `depositWithPermit`, tests | Pot names (none on-chain or off-chain), deploy, UI |
| US2 Payee allowlist | **Missing** | — | `approvePayee` / `revokePayee` (owner only, events), allowlist check in settlement, I5 handler |
| US3 Requester raises an itemized request (item, qty, unit price, vendor) with no wallet or gas | **Missing** | — | Relayer API and store for itemized requests (off-chain, with the item detail hashed or referenced), requester device key (ADR-008), requester screen |
| US4 One-signature approval, vendor paid directly, requester never the payee, nonce and expiry | **Missing** (only the struct exists) | `PaymentRequest` and its typehash | Vault `EIP712` domain, `SignatureChecker` verification, nonce bitmap (R3, I4), expiry, PolicyEngine with cap and payee policies, `settle()` with `nonReentrant` and SafeERC20, fee (R4), requester-not-payee guard, R3/R8 tests, I4/I6 invariants, sender approve screen (Privy signTypedData), relayer submit |
| US5 Capped monthly allowance once per period | **Missing** | `Pot.cap`, `createdAt` | `spent[pot][period]` (R7, I3), schedule struct with `nextDue` and payee (R9), keeper path through the PolicyEngine, relayer cron |
| US6 Per-pot statement and booksBalance badge | **Partial** | `booksBalance()`, `surplus()`, events | Statement built from events (indexer or `getLogs`), badge in the UI, invariant test I1 |
| US7 Refund of amount and fee | **Missing** | — | Pending state (R5), `confirmPayout`, `failPayout`, timeout refund (R6), the airtime adapter (VTpass sandbox, ADR-007) |
| US8 Savings vault | **Missing** | Seams and research (sMUSD callable) | `moveToSavings` / `withdrawFromSavings` per pot (R10), `pot.saved`, wiring into I1, testnet sMUSD address check |
| US9 Banxa link | **Missing** | Research: hosted referral URL; no testnet support | A "Fund with card" deep link in the app (to the Mezo app's Banxa flow or a referral URL). It is UI only. |

Decisions relied on that are still proposed or open: ADR-001, ADR-002, ADR-003, ADR-008 (wallets) and ADR-010 are proposed. ADR-005 (team) and ADR-006 (name) are open.
