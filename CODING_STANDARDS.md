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
  `UPPER_SNAKE`; immutables `mixedCase`; private/internal functions and state `_leading`;
  parameters `_leading` (M1).
- S5 Interfaces start with `I` and live in `src/interfaces/`. Policies in `src/policies/`, payee
  adapters in `src/adapters/`.
- S6 File order (matches solhint `ordering`, which lint enforces): pragma, imports, `using`, types
  (structs/enums), constants/immutables, state, events, errors, modifiers, constructor, external,
  public, internal, private, view/pure last within each group. Events/errors are declared in the
  contract's interface instead (M3).
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

## Mezo conventions (from mezo-org/musd)

**Source.** Mezo publishes no code style guide (none at mezo.org/docs/developers or in the
`mezo-org/documentation` repo). Official, but process only: [mezod CONTRIBUTING.md][contrib].
[musd CLAUDE.md][mclaude] says "Thesis standards", meaning [solhint-config-thesis][solthesis],
`@thesis-co/eslint-config` and `@thesis/prettier-config`. Everything else below was **inferred
from code** in [MUSD.sol][musd], [PCV.sol][pcv], [BorrowerOperations.sol][bo],
[GovernableVariables.sol][gv], [IMUSD.sol][imusd], [IPCV.sol][ipcv] and [docs/tests.md][tests]
(read 2026-10-24). A rule marked **Pending config** needs a config edit and an ADR (CLAUDE.md rule 6)
before lint enforces it. Until then, reviewers enforce it.

### Solidity
- M1 Function parameters take a leading underscore: `_amount`, `_recipient`, `_potId`. Existing
  `musd_`-style parameters get renamed the next time their file is changed.
- M2 State variables are `public` by default, with no hand-written getter for a plain variable.
  A system contract is stored as its interface type (`IMUSD public musd`). A raw address variable
  ends in `Address` (`stabilityPoolAddress`).
- M3 Every contract has an `I<Name>` interface in `src/interfaces/` that declares its events,
  errors and external functions, in the sections `// --- Events ---`, `// --- Errors ---` and
  `// --- Functions ---`. The contract inherits it. Events and errors are not declared again in
  the contract body (this changes S6).
- M4 Group functions in a contract body with `// --- <Group> ---` dividers (`// --- Governance ---`,
  `// --- Helper functions ---`). The S6 order applies inside each group.
- M5 List inherited contracts alphabetically, one per line once the list wraps
  (`contract PCV is CheckContract, IPCV, Ownable2StepUpgradeable, ...`).
- M6 Write NatSpec with `///` only. A continuation line is indented to line up with the text after
  the tag. Each contract has `@title` and `@notice`. S19 still decides how much NatSpec is required.
- M7 Event names follow the patterns `<Thing>Set`, `<Thing>Added`/`<Thing>Removed` and
  `<Thing>Withdrawn`. Error names describe the state that blocked the call, as in
  `AddressHasMintRole` or `AddressWithoutMintRole`. The arguments required by S7 still apply.
- M8 Access control:
  - The owner role uses OZ `Ownable2Step`.
  - Every role check is an `onlyX` modifier (`onlyGovernance`, `onlyWhitelistedRecipient(_r)`).
    The check is not written inline in the function.
  - An allowlist is a `mapping(address => bool) public` with an `addToX`/`removeFromX` pair. Each
    reverts if it would change nothing and emits `XAdded`/`XRemoved`.
  - A role change is done in two steps behind a time delay (`startChanging…`,
    `cancelChanging…`, `finalizeChanging…`).
  - A system-contract address can be set once only, and only to an address that has code. Both
    checks fail with custom errors.
  - S13 still limits which powers may exist at all.
- M9 Formatting matches [prettier-plugin-solidity][prettierrc] defaults: 80-column lines, 4-space
  indent, double quotes, no bracket spacing. When a function header wraps, the parameters wrap
  first and the visibility and modifiers sit on the closing `) external onlyOwner {` line.
  **Pending config:** `foundry.toml` `line_length = 80`, `.solhint.json` `max-line-length` 80, and
  the forge fmt `multiline_func_header` value closest to that layout.
- M10 The lint baseline is the [Thesis solhint rules][solthesis] (musd's [.solhint.json][solhint]
  extends them), run with `--max-warnings 0`. Our config already includes all of them except two:
  - `max-states-count` limits a contract to 25 state variables.
  - `not-rely-on-time` is on, with a justified `// solhint-disable-next-line not-rely-on-time` at
    each timestamp read.
  **Pending config:** turn on both rules, and record why in an ADR that amends ADR-009.

### Tests ([docs/tests.md][tests], [PCV.test.ts][pcvtest])
- M11 Group tests by external function: one test contract per function, named
  `<Contract><Function>Test`. Inside it, sections appear in this order, each marked with a
  `// --- … ---` comment: Expected Reverts, Emitted Events, System State Changes, Balance changes,
  Fees, State change in other contracts.
- M12 A test checks one behaviour. The behaviour part of the name uses Mezo's wording:
  `test_R3_revertsWhenNonceReplayed`, `test_R1_emitsPotCredited`.
- M13 Share setup through a base `setUp` fixture and helper wrappers whose defaults can be
  overridden (`_deposit({amount: ..., sender: alice})`). Balance tests record `before`, act, then
  assert `after == before ± delta`. A value read once is asserted inline. A temporary variable is
  used only when the value is used more than once or the name makes the test clearer.

### TypeScript ([.prettierrc.js][prettierrc], [dapp/.eslintrc][eslint])
- M14 Use `@thesis/prettier-config`: `semi: false` and Prettier 3 defaults otherwise (double
  quotes, 80 columns, trailing commas). Lint with `@thesis-co/eslint-config`. Sort imports with
  `simple-import-sort` in these groups: packages, internal packages, `#/` aliases, side-effect
  imports, parent paths, sibling paths, styles. **Pending config:** add these when `relayer/` and
  `app/` get tooling.

### Commits ([CONTRIBUTING.md][contrib])
- M15 Write commits per Chris Beams: imperative summary of 50 characters or fewer, body wrapped at
  72. Any non-trivial commit has a body that explains why. No ticket or issue references: the
  message must stand on its own. One logical change per commit. Convention changes and functional
  changes go in separate commits. The conventional-commit prefix from CLAUDE.md stays.

### Conflicts
- Error style: Mezo mostly uses `require(cond, "Contract: msg")`. **We keep custom errors** (S7).
- Pragma: Mezo also uses exact `0.8.24`, so there is no conflict.
- Imports: Mezo uses global `import "./X.sol";`. **We keep named imports** (S2). solhint
  `no-global-import` is an error in our config, and this is the one deviation not on the protected
  list, so the owner should confirm it. Mezo's grouping (third-party first, a blank line, then
  local) is adopted.
- Upgradeability: Mezo uses OZ upgradeable proxies with initializers. **We forbid proxies** (S13,
  single payment path).
- Mocks: Mezo keeps testers and mocks in `contracts/tests/` under the source tree. **We keep them
  in `test/mocks/`** (X8, no test code in `src/`).
- Test names: Mezo uses `it("reverts when …")`. **We keep rule-ID names** (X1) and use Mezo's
  wording for the behaviour part (M12).
- Lint disables: Mezo disables rules with no reason given. **We keep the one-line justification**
  (CLAUDE.md rule 6).
- S4: parameter naming changes to `_leading` (M1).
- S6: events and errors move to the interface (M3).
- Formatting: line length drops from 120 to 80 (M9).
- `not-rely-on-time`: changes from off to on (M10).
- Chain library: Mezo's tests use ethers v6 because they run on Hardhat. **We keep viem** (T2).
  This is a choice of test harness, not a style rule.
- Not adopted, owner's call: Mezo licenses contracts GPL-3.0 and we use MIT. Mezo requires signed
  commits; that is not enforced here.

[contrib]: https://github.com/mezo-org/mezod/blob/main/CONTRIBUTING.md
[mclaude]: https://github.com/mezo-org/musd/blob/main/CLAUDE.md
[solthesis]: https://www.npmjs.com/package/solhint-config-thesis
[solhint]: https://github.com/mezo-org/musd/blob/main/solidity/.solhint.json
[prettierrc]: https://github.com/mezo-org/musd/blob/main/.prettierrc.js
[eslint]: https://github.com/mezo-org/musd/blob/main/dapp/.eslintrc
[musd]: https://github.com/mezo-org/musd/blob/main/solidity/contracts/token/MUSD.sol
[imusd]: https://github.com/mezo-org/musd/blob/main/solidity/contracts/token/IMUSD.sol
[pcv]: https://github.com/mezo-org/musd/blob/main/solidity/contracts/PCV.sol
[ipcv]: https://github.com/mezo-org/musd/blob/main/solidity/contracts/interfaces/IPCV.sol
[bo]: https://github.com/mezo-org/musd/blob/main/solidity/contracts/BorrowerOperations.sol
[gv]: https://github.com/mezo-org/musd/blob/main/solidity/contracts/GovernableVariables.sol
[tests]: https://github.com/mezo-org/musd/blob/main/docs/tests.md
[pcvtest]: https://github.com/mezo-org/musd/blob/main/solidity/test/normal/PCV.test.ts
