# Security review: Ìpín contracts (Wave 1, pre-testnet)

Date: 2026-10-24. Reviewer: an AI agent (Claude), working inside the repo. This was an internal
review, not an independent audit. Read it with that in mind.

## Scope

- Base commit: `5e0abf2` (`test(contracts): add handler-based invariants I1-I6`).
- Fixes and tests added during the review: `bf299ed` (M-01 fix), `54a9a3c` (attack tests).
- In scope: `contracts/src/` (`Vault.sol`, `PolicyEngine.sol`, `Pots.sol`,
  `libraries/PaymentRequests.sol`, `interfaces/`) and the tests in `contracts/test/`.
- Out of scope: `relayer/`, `app/`, `packages/`, the deploy scripts (read, not reviewed in depth),
  OpenZeppelin v5.7.0 and the MUSD token itself. The off-chain parts matter for liveness and
  privacy. They do not matter for safety, because the contract checks every rule itself (T6).

## Method

1. Read the spec (`README.md`, `docs/money-rules.md`, `docs/decisions.md` ADR-013/015/016,
   `docs/api.md`, `CODING_STANDARDS.md`), then every line of `contracts/src` and the tests.
2. Went through these areas one at a time: reentrancy (including read-only reentrancy through
   `booksBalance()`), access control on every external function, signature replay (domain, nonce
   namespace, ERC-1271, malleability, expiry boundary), rounding and units (R2 remainder, fee, cap
   epochs), token assumptions (SafeERC20, fee-on-transfer, permit front-running), schedule abuse,
   I1 accounting on every path, DoS, and payee/requester separation.
3. Wrote a Foundry test for each plausible attack (listed below). For the one Medium finding, I
   wrote the tests first and saw them fail (compile failure: `invalidateNonce` did not exist), then
   added the fix. I also checked that the invariant suite catches the bug: when the fix was
   temporarily turned off, `invariant_I4_nonceUsedOnce` failed (`1 != 0`).
4. Gates at `54a9a3c`: `forge fmt --check`, `pnpm lint` (0 warnings), `forge test` (80 passed),
   `pnpm test:invariant` (I1-I6 pass at 512 runs × depth 128), and `pnpm test:ci` (80 passed at
   10k fuzz runs; invariants at 1024 × 256).
5. No static analyzer was run (Slither and Aderyn are not installed here). That is a gap.

## Findings

| ID | Severity | Title | Status | Test(s) |
| --- | --- | --- | --- | --- |
| M-01 | Medium | A signed request could not be revoked before expiry, and re-adding a payee revived old requests | Fixed (`bf299ed`) | `test_R3_rejectsRevokedRequest`, `test_R3_revokedRequestStaysDeadAfterPayeeReAdded`, `test_R3_invalidateOnlyTouchesCallerNamespace`, `test_R3_revertsWhenInvalidatingUsedNonce`, `test_R3_emitsNonceInvalidated`, `test_R3_erc1271SenderInvalidatesNonce`, `invariant_I4_nonceUsedOnce` (new handler action `revokeThenExecute`) |
| L-01 | Low | `relayerAddress` is immutable: if it becomes unreachable, fees are frozen until a redeploy | Acknowledged | `test_R4_blockedRelayerOnlyFreezesFees`, `test_R7_senderCanAlwaysExitToOwnAddress` |
| L-02 | Low | No upper bound on request `expiry` | Acknowledged (off-chain cap recommended) | none (a policy choice) |
| L-03 | Low | Deposits credit `_amount` without checking how much arrived (assumes MUSD has no transfer fee and does not rebase) | Acknowledged | none |
| I-01 | Info | ERC-1271 senders: what is accepted and what depends on the wallet | Acknowledged | `test_R8_acceptsERC1271Sender`, `test_R8_erc1271SignatureBoundToItsPot`, `test_R3_erc1271SenderInvalidatesNonce` |
| I-02 | Info | Read-only reentrancy window around `booksBalance()` | Acknowledged (not reachable with MUSD) | none |
| I-03 | Info | Payee/requester separation holds per pot and cannot see who controls an address | Accepted risk | `test_I5_*` (existing) |
| I-04 | Info | A full cap can be spent twice across an epoch boundary, and fees are not capped | Accepted (ADR-003, R7 note) | `test_R7_epochBoundaryAllowsTwoCapsBackToBack` |
| I-05 | Info | Anyone can trigger a schedule: timing and cap interplay | Acknowledged (no exploit found) | `test_R9_failedRunDoesNotForfeitPeriod`, `test_R9_runsOncePerPeriod`, `test_R9_skipsMissedPeriods` |
| I-06 | Info | Front-running `execute` or the permit in `depositWithPermit` only costs gas | Acknowledged (no exploit found) | `test_R3_frontRunExecuteSettlesOnce`, `test_R2_frontRunPermitDoesNotBlockDeposit` |
| I-07 | Info | Absurd amounts revert with `Panic(0x11)` instead of a custom error | Acknowledged | none |

No Critical or High findings.

## Details

### M-01 A signed request could not be revoked before expiry (fixed)

Before the fix, a `PaymentRequest` signed by the sender could be submitted by anyone who held it
(the relayer, its database, a leaked log) until `expiry`, and `expiry` has no upper bound (L-02).
The sender had only blunt tools: `removePayee` (which also blocks every legitimate request and
schedule to that payee) or `setCap(0)` (which blocks the whole pot). Worse, `removePayee` was not a
revocation at all. Once the payee was re-added, which is normal for a regular vendor, every
unexpired request to it became valid again (`test_R3_revokedRequestStaysDeadAfterPayeeReAdded`
shows the stale request settling). Impact: a payment the sender had decided against could still
go out. It went only to a payee the sender approved and stayed within the cap, so money could not
be stolen, but the sender had lost control over it.

Fix: `invalidateNonce(uint256 _nonce)` marks the nonce used in **`msg.sender`'s own namespace**
and emits `NonceInvalidated(signer, nonce)`. If the nonce was already used, it reverts with
`NonceAlreadyUsed`. Nobody can cancel another signer's request
(`test_R3_invalidateOnlyTouchesCallerNamespace`). A smart-account sender calls it from the account.
It moves no money and needs no reentrancy guard. The EIP-712 type and the deployment file shape
are unchanged. The ABI gains one function and one event (`contracts/abi/Vault.json`,
`IPolicyEngine.json`). `docs/api.md` §2a documents it.

### L-01 `relayerAddress` is immutable (author concern 2)

`relayerAddress` only receives fees, through `claimFees()`, which anyone can call. It has no say
in payments: `execute` and `executeSchedule` are open to anyone, so a stolen or lost relayer key
cannot move pot money or block senders, who can submit their own signed requests. The risk is
limited to fees. If the key is stolen, the thief gets future fees. If the key is lost, or transfers
to it start failing, `unclaimedFees` piles up and cannot be withdrawn. Payments keep working and
the books stay balanced (`test_R4_blockedRelayerOnlyFreezesFees`). Recovery means a redeploy.
Senders can always move their own money out through the normal policy path
(`test_R7_senderCanAlwaysExitToOwnAddress`), so a redeploy does not trap any funds.

I did not add a way to change the relayer. If the current relayer could rotate itself, a thief
holding the key would rotate first. Any other rotation scheme needs an admin, which S13 and
ADR-016 rule out. **Recommendation for this deploy:** set `RELAYER_ADDRESS` to a cold or multisig
address that is *not* the hot key the relayer service uses to send transactions. Nothing in the
contract requires the two to be the same.

### L-02 No upper bound on `expiry`

The contract accepts any `expiry`, including `type(uint256).max`. Now that M-01 is fixed, a
long-lived request can be revoked, but only if the sender remembers that it exists.
Recommendation: the app and relayer should refuse to sign or submit requests that expire more than
about 7 days out. The limit is left off-chain so the rule stays simple.

### L-03 Deposits assume MUSD is a plain ERC-20

`deposit` credits the pots with `_amount` and then `safeTransferFrom`s `_amount`. If the token took
a transfer fee or rebased, I1 would break. MUSD is a fixed constructor argument and is a standard
ERC-20 with permit. `Deploy.s.sol` checks that the address has code and `decimals() == 18`, but it
does not check transfer behaviour. This is acceptable for MUSD. Any other token would need a
balance-delta check first.

### I-01 ERC-1271 senders (author concern 3)

`execute` uses OpenZeppelin `SignatureChecker.isValidSignatureNow(owner, digest, sig)`. If the
owner has no code, it uses ECDSA with low-s enforced (`test_R8_rejectsMalleableSignature`).
Otherwise it makes a `staticcall` to `isValidSignature`. What I checked:

- **No cross-account replay.** The digest includes `potId`, and the signer is always that pot's
  owner. Pot owners never change. So even a wallet that validates the raw hash (like the mock,
  which does not rehash per account the way ERC-7739 does) cannot have its signature reused on
  another pot of the same key (`test_R8_erc1271SignatureBoundToItsPot`). Nonce namespaces are per
  owner address.
- **No reentrancy.** The wallet call is a `staticcall` made before any state change, so it can
  neither write state nor observe half-done state.
- **Gas griefing** only hurts the wallet's own pot: the wallet can burn the gas of its own
  `execute` and nothing else.
- **What depends on the wallet.** Contract signatures can be revoked and can change over time.
  The wallet decides what counts as a signature (Safe-style pre-approved hashes, empty signatures).
  Malleability is up to the wallet, but the nonce prevents replay anyway.
- **Counterfactual accounts** (ERC-6492) cannot own pots, because the owner is `msg.sender` of
  `createPot` and so already has code.
- **EIP-7702.** Mezo testnet runs Cancun (ADR-004), so 7702 does not apply yet. On a Prague chain,
  an EOA with a delegate would be routed to ERC-1271, and its plain ECDSA signature would be
  refused unless the delegate implements ERC-1271. That would stop the sender from paying but would
  put no funds at risk.
- **Off-chain.** The relayer's pre-check must verify signatures with ERC-1271 support (viem
  `publicClient.verifyTypedData`), or it will reject valid smart-account approvals. Wave 1 senders
  use MetaMask EOAs (ADR-012), so this does not apply yet.

### I-02 Read-only reentrancy around `booksBalance()`

In `deposit`, the pots are credited before `transferFrom` pulls the MUSD (CEI). During that pull,
liabilities exceed assets, so a token that called back into the sender would let a third-party
contract read `booksBalance() == false`. In `execute`, after the effects and before the transfer,
`surplus()` briefly includes the amount being paid. MUSD has no transfer hooks, so neither window
can be reached. Every function that moves funds is `nonReentrant`.

### I-03 Payee/requester separation

The sets are disjoint per pot and are checked again at settlement. A requester of pot A can be a
payee of pot B. More fundamentally, the contract cannot tell who controls an address. A requester
who proposes a "vendor" address they control gets paid if the sender approves that payee. The
safeguard is the sender's explicit `addPayee` plus their signature on every request (R8).

### I-04 Epoch boundary and fees

Caps use fixed 30-day epochs (ADR-003). Up to 2× cap can leave the pot across a boundary
(`test_R7_epochBoundaryAllowsTwoCapsBackToBack`). On top of that, each payment's fee is outside the
cap (R7 note), so the most a pot can lose in one period is `cap + n × fee`.

### I-05 Schedule abuse

Anyone can call `executeSchedule` once it is due. Each call pays only the current period, once.
Missed periods are forfeited, never caught up. A reverted run (cap, balance, payee removed) does
not use up the period, so calling at a bad moment cannot burn it
(`test_R9_failedRunDoesNotForfeitPeriod`). Schedules draw on the same cap as signed requests, so
anyone can trigger a due schedule at the start of a period and use up cap headroom first. That is
the payment the sender already authorized. A very short interval is the sender's choice, and every
run charges a fee. No exploit found.

### I-06 Front-running

If someone copies a pending `execute` and lands it first, the result is the same payment to the
same payee, and the fee is still owed to `relayerAddress`. Only the relayer's gas is wasted
(`test_R3_frontRunExecuteSettlesOnce`). If someone submits the permit from a `depositWithPermit`
first, the deposit skips the used permit and still succeeds, and the allowance only lets the vault
pull funds in a deposit the holder sends (`test_R2_frontRunPermitDoesNotBlockDeposit`).

### I-07 Panic on absurd amounts

Suppose a sender sets `cap = type(uint256).max` and signs a request for close to `2^256`. Then
`_amount + fee` overflows and the call reverts with `Panic(0x11)` instead of
`InsufficientPotBalance`. State is unchanged and the nonce is not consumed. The only problem is the
error message.

### Areas checked with no finding

- **Access control.** Pot configuration (`setCap`, `add/removePayee`, `add/removeRequester`,
  `createSchedule`, `cancelSchedule`, `createSplit`) is owner-only through `_requirePotOwner`.
  `deposit` is split-owner-only and only pulls from `msg.sender`. `execute`, `executeSchedule` and
  `claimFees` are open to anyone, and each one either needs the sender's signature or schedule, or
  pays only the fixed relayer. `createPot` is open to anyone and affects only the caller's own pot.
  There is no owner and no admin.
- **Replay.** The domain includes name, version, chainId and the vault address, and is recomputed
  if the chain id changes (`test_R8_rejectsWrongDomain`). The nonce is consumed before the
  transfer. A reverted call does not consume the nonce. Expiry is inclusive
  (`test_R3_acceptsAtExactExpiry`).
- **Rounding.** The R2 remainder goes to the named pot (fuzzed up to 1e30). The fee is flat and
  bounded `0 < fee <= 1e18`. The cap counts `amount` only.
- **I1.** Every path keeps `assets == liabilities + surplus`: deposit (+d/+d), execute and schedule
  (−amount assets; −(amount+fee) pots, +fee fees), claimFees (−f/−f), invalidateNonce (no money).
  Checked by `invariant_I1_booksBalance` with direct donations.
- **DoS.** The only loops are bounded by `MAX_SPLIT_POTS = 10`. Nothing iterates over pots,
  schedules or payees.
- **Tokens.** Every transfer goes through SafeERC20. The vault cannot be added as a payee.

## Accepted risks for Wave 1

1. Fees are frozen if `relayerAddress` becomes unreachable (L-01). Recovery is a redeploy plus
   senders moving their own money out. Use a cold or multisig fee address.
2. The contract does not cap `expiry` (L-02). The app and relayer should enforce a short expiry.
3. MUSD is assumed to have no transfer fee, no rebasing and no callbacks (L-03, I-02).
4. Up to 2× cap across an epoch boundary, and fees outside the cap (I-04, ADR-003).
5. The contract cannot tell whether a payee address is controlled by a requester. The sender's
   approval of each payee is the control (I-03).
6. Surplus (donations, and later yield) can never be moved (ADR-010, S13).
7. Wave 1 payouts are synchronous. A payee whose transfer fails blocks only its own payment
   (ADR-015).
8. This was an AI-assisted internal review with no static analysis and no independent audit. It is
   fine for testnet with test MUSD. It is not enough for mainnet funds.

## Deep-run result (`pnpm test:ci`, 10k fuzz runs)

At `54a9a3c`, all 80 tests passed with 0 skipped: 10,000 fuzz runs per fuzz test, and I1-I6 at
1024 runs × depth 256.
