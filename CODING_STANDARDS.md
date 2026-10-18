# Coding standards

Each rule is checkable in review. "Must" = blocking. Lint enforces what it can (`pnpm lint`);
reviewers enforce the rest.

## Solidity

### Compiler and dependencies
- S1 Must use exactly `pragma solidity 0.8.24;` (enforced by `scripts/check-pragma.mjs`).
- S2 Must import named symbols only: `import {SafeERC20} from "@openzeppelin/contracts/...";`.
- S3 OpenZeppelin is the only third-party contract library unless a decision says otherwise. Never
  copy OZ code into `src/`; import it.

### Naming and layout
- S4 Contracts/structs/enums/events/errors `CapWords`; functions/variables `mixedCase`; constants
  `UPPER_SNAKE`; immutables `mixedCase`; private/internal functions and state `_leading`.
- S5 Interfaces start with `I` and live in `src/interfaces/`. Policies in `src/policies/`, payee
  adapters in `src/adapters/`.
- S6 File order: pragma, imports, errors, events, types, constants/immutables, state, modifiers,
  constructor, external, public, internal, private, view/pure last within each group.
- S7 Custom errors name the failed check and carry the values: `error CapExceeded(uint256 potId,
  uint256 spent, uint256 cap);`. No `require(..., "string")`, no bare `revert()`.

### Money
- S8 Every amount is `uint256` MUSD base units. Variable names say so: `amount`, `fee`, `cap`
  (never `amountUsd`, `price`, or a float-like name).
- S9 Every state change that affects money emits an event: deposit, pot credit, split remainder,
  payment settled, fee charged, pending created/confirmed/refunded, savings in/out, cap/payee/rule change.
  Event names are past tense (`PotCredited`, `FeeCharged`). Index `potId` and `payee`.
- S10 Checks-effects-interactions in every external function. All state updates before any external
  call. Must use `nonReentrant` on every function that transfers tokens or calls an adapter.
- S11 All ERC-20 calls via `SafeERC20` (`safeTransfer`, `safeTransferFrom`, `forceApprove`). No raw
  `transfer`/`approve`, no low-level `call` (solhint errors on it).
- S12 Divisions that split money handle the remainder explicitly (money-rules R2). No silent dust.
- S13 No admin backdoor that can move user funds: no owner `withdraw`, `sweep`, `rescue`, upgrade
  proxy, or `selfdestruct` over pot money. Admin powers (if any) are limited to registering
  policies/adapters and are listed in the contract NatSpec.
- S14 Signatures: EIP-712 via OZ `EIP712` + `ECDSA`/`SignatureChecker`; domain includes chainId and
  verifying contract; nonce consumed before external calls.

### Architecture
- S15 One policy = one contract implementing `IPolicy`. A policy is a pure check (view), never moves
  money, and is added without redeploying the vault.
- S16 One payee type = one adapter implementing `IPayeeAdapter`. Adapters receive funds only from the
  settlement path and report success/failure for the R5/R6 pending lifecycle.
- S17 The PolicyEngine is the only door out of a pot (CLAUDE.md non-negotiable 2).
- S18 `booksBalance()` is a view on the vault and is kept true by construction (I1).

### Documentation
- S19 Every `external`/`public` function has NatSpec: `@notice`, `@param` for each parameter,
  `@return` where applicable, and `@dev` naming the rule IDs it enforces (e.g. `@dev R3, R8`).

## TypeScript (relayer/, adapters/, app/, scripts/)

- T1 `tsconfig` `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
  No `any` (use `unknown` + narrowing). No `@ts-ignore`; `@ts-expect-error` needs a reason.
- T2 Chain access via `viem` only (no ethers). ABIs imported as `const` for typed calls.
- T3 Amounts are `bigint` end to end. Forbidden on amounts: `number`, `Number()`, `parseFloat`,
  `Math.*`, `toFixed`, floating literals. Convert only with `parseUnits(x, 18)` / `formatUnits(x, 18)`
  at the UI edge. JSON carries amounts as decimal strings of base units.
- T4 Validate every boundary with `zod`: HTTP bodies, env vars, provider/webhook responses, signed
  request payloads. Parse, then use the typed result; never trust raw input.
- T5 Secrets only from env (validated by zod at startup). Never log keys, signatures in full, or
  personal data.
- T6 Relayer submits only requests that pass the same checks the contract enforces (fail fast), but
  the contract remains the authority; never rely on off-chain checks for safety.
- T7 Errors are typed results or thrown `Error` subclasses; no swallowed `catch {}`.

## Tests

- X1 Rule tests are named `test_<RuleID>_<behaviour>` / `testFuzz_<RuleID>_<behaviour>`; invariants
  `invariant_<InvID>_<name>`. Names must match `docs/money-rules.md`.
- X2 Failing first: each rule test is committed (or shown in the PR) failing before the fix.
- X3 Invariants use a handler contract (`test/invariant/handlers/`) with bounded inputs (`bound`),
  ghost variables for I2/I4/I6, and `targetContract(handler)`; `fail_on_revert = false`.
- X4 Revert tests assert the exact custom error and arguments (`vm.expectRevert(abi.encodeWithSelector(...))`).
- X5 Event tests use `vm.expectEmit` with all topics checked for money events.
- X6 No skipped, commented-out or `vm.skip` tests; no `--no-match-test` in scripts to hide failures.
- X7 Fuzz amounts span 1 wei to large values (`bound(x, 1, 1e30)`), including remainder edge cases.
- X8 Mocks live in `test/mocks/`, never in `src/`. A mock MUSD has 18 decimals.
