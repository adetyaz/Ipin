# Money rules

Source: README "Money rules" (R1–R10) and "Invariants" (I1–I6). This file makes each one testable.
Every rule gets a test that **fails first** (Penny method), then the fix. Test names below are the
contract between this document and `contracts/test/`. Renaming a test means updating this file.

## Units and arithmetic

- **Unit:** MUSD base units, 18 decimals. `1 MUSD = 1e18`. All amounts are `uint256` on-chain and
  `bigint` off-chain. No floats, no `number` for amounts, no decimal strings in storage.
- **Display only:** conversion to a human string (`formatUnits(x, 18)`) happens at the UI edge and is
  never parsed back into arithmetic. User input is parsed with `parseUnits(str, 18)` to `bigint`.
- **Division:** integer division rounds down. Every division that splits money must account for the
  remainder explicitly (R2). No `mulDiv` rounding-up anywhere money leaves a pot.
- **Basis points:** split weights are basis points (`uint16`, sum = 10_000 exactly). A split config
  whose weights don't sum to 10_000 is rejected at creation.
- **Remainder rule (R2):** `piece_i = deposit * bps_i / 10_000` for each pot; then
  `remainder = deposit - Σ piece_i` is added to the pot's named remainder pot (default: savings pot).
  `0 ≤ remainder < number_of_pots` base units.
- **Fee (R4):** relayer fee is a flat constant in base units (proposed `0.25 MUSD = 25e16`, see
  `decisions.md`). Never a percentage.

Glossary: *pot balance* = MUSD credited to a pot and spendable; *pending* = debited from a pot,
awaiting confirmation (R5); *unclaimed fees* = fees charged but not yet withdrawn by the relayer;
*period* = cap epoch (proposed fixed 30 days from pot creation).

## Rules

| ID | Testable statement | Violation looks like | Test name(s) |
| --- | --- | --- | --- |
| R1 Units | Every amount in storage, events, calldata and the EIP-712 request is `uint256` base units (18 dp). Off-chain amounts are `bigint`. | A float/`number` amount anywhere; a `* 1e18` at runtime outside a parse helper; a 6-decimal assumption. | `test_R1_amountsAreBaseUnits`, `testFuzz_R1_noPrecisionLossOnRoundTrip` |
| R2 Splits | For any deposit `d` and valid split, `Σ credits == d`, and `d - Σ floor(d*bps_i/10_000)` goes to the named remainder pot. | Σ credits ≠ d (dust lost or created); remainder to an unnamed/random pot; weights ≠ 10_000 accepted. | `testFuzz_R2_splitSumsToDeposit`, `test_R2_remainderGoesToNamedPot`, `test_R2_rejectsWeightsNot10000`, `test_R2_rejectsZeroWeight`, `test_R2_rejectsDuplicatePot`, `test_R2_rejectsRemainderPotOutsideSplit`, `test_R2_rejectsForeignPotInSplit`, `test_R2_onlySplitOwnerDeposits`, `test_R2_depositWithPermit` |
| R3 Replays | A request with a used nonce, or `block.timestamp > expiry`, reverts with a custom error and changes no state. | Same signed request settles twice; expired request settles; nonce consumed by a reverted call. | `test_R3_rejectsReplayedNonce`, `test_R3_rejectsExpiredRequest`, `test_R3_acceptsAtExactExpiry` |
| R4 Fees | Each settled payment charges exactly one flat fee, from the same pot, emitted as its own `FeeCharged` event and tracked in `unclaimedFees`. | Fee charged twice, from another pot, folded into the payee amount, or missing an event; fee on a failed payment that is not refunded. | `test_R4_chargesFlatFeeOnce`, `test_R4_feeFromSamePot`, `test_R4_feeRecordedAsOwnEntry`, `test_R4_rejectsWhenPotCannotCoverAmountPlusFee` |
| R5 Pending | A payout awaiting provider/bank confirmation moves `amount + fee` from the pot to `pending[id]`; it is neither in the pot balance nor counted as paid until confirmed. | Pending money still spendable from the pot; pending money missing from I1; confirmation paying twice. | `test_R5_payoutMovesToPending`, `test_R5_pendingNotSpendable`, `test_R5_confirmClearsPendingOnce` |
| R6 Refunds | A failed or timed-out pending payout returns exactly `amount + fee` to the original pot, once, and restores cap headroom for that period. | Partial refund; fee kept; refund to a different pot; refund twice; refund after confirmation. | `test_R6_failedPayoutRefundsAmountAndFee`, `test_R6_timeoutRefunds`, `test_R6_cannotRefundTwice`, `test_R6_cannotRefundConfirmed` |
| R7 Caps | Within a period, `spent[pot][period] + amount ≤ cap[pot]`, else revert. Period index = `(block.timestamp - pot.createdAt) / PERIOD`. A new period starts at 0 spent. | Spend above cap; cap not resetting; reset on a sliding window; fee/amount excluded inconsistently (cap counts `amount`, see note). | `test_R7_rejectsSpendAboveCap`, `test_R7_capResetsNextPeriod`, `testFuzz_R7_spendNeverExceedsCap` |
| R8 Approval | A request-mode payment settles only with a valid EIP-712 signature by the pot's sender over that exact request (pot, payee, amount, itemHash, nonce, expiry, chainId, verifying contract). `runningTotal` (metered settlement) was removed: metering is Wave 2 (x402). | Settles with a requester's signature; signature reused with a changed field; cross-chain/cross-contract replay; malleable sig accepted. | `test_R8_rejectsNonSenderSignature`, `testFuzz_R8_rejectsAnyAlteredField`, `test_R8_rejectsWrongDomain` |
| R9 Schedule | A scheduled payment executes at most once per period, only when `block.timestamp ≥ nextDue`, only to its named payee, and within the cap. | Runs twice in one period; runs early; pays a different payee; skipped periods paid as a lump without rule. | `test_R9_runsOncePerPeriod`, `test_R9_rejectsBeforeDueDate`, `test_R9_paysOnlyNamedPayee` |
| R10 Savings | MUSD moved to the savings vault stays credited to its pot (`pot.saved`); withdrawals return to the same pot. | Savings position not attributed to a pot; withdrawal credited to another pot; yield/loss unaccounted in I1. | `test_R10_depositKeepsPotCredit`, `test_R10_withdrawReturnsToSamePot` |

Cap note (R7): the cap counts the payment `amount` only; the fee is not counted toward the cap.
Changing this is a decision (record in `decisions.md`) and changes I3's handler.

## Invariants (hold after every call, checked with Foundry invariant tests + handlers)

| ID | Statement (exact) | Test name |
| --- | --- | --- |
| I1 Books balance | `assets == liabilities + surplus`, where `assets = musd.balanceOf(vault) + sMUSD.balanceOf(vault)` (savings principal, 1:1), `liabilities = Σ pot.balance + Σ pot.saved + Σ pending + unclaimedFees`, and `surplus ≥ 0` is MUSD owed to no pot (see note). On-chain: `booksBalance()` returns `assets ≥ liabilities`; `surplus()` reports the surplus line. In the invariant suite `surplus == ghost direct transfers` exactly, so lost or invented credits are still caught. | `invariant_I1_booksBalance`, `test_I1_booksBalanceAfterDeposits`, `test_I1_surplusDoesNotBreakBooks` |
| I2 Deposits | For every deposit event, `deposit.amount == Σ PotCredited.amount` emitted by that deposit (ghost tracked in the handler). | `invariant_I2_depositEqualsCredits` |
| I3 Caps | For every pot and period, `spent[pot][period] ≤ cap[pot]`. | `invariant_I3_spendWithinCap` |
| I4 Nonces | No nonce is consumed twice; ghost count of successful settlements per `(signer, nonce)` ≤ 1. | `invariant_I4_nonceUsedOnce` |
| I5 Payees | Every MUSD transfer out of the vault (excluding savings deposits and fee claims) goes to an address approved for that pot at that time. | `invariant_I5_onlyApprovedPayees` |
| I6 Approval | Ghost count of request-mode settlements without a valid sender signature == 0. | `invariant_I6_noUnapprovedRequestPayments` |

I1 note (surplus): anyone can send MUSD to the vault without `deposit` (a donation, a card
on-ramp delivering to the vault address), and savings yield (R10) arrives as unannounced MUSD on
`withdraw`/`claimYield`. That MUSD is owed to no pot, so it is a separate surplus line and never
makes `booksBalance()` false. Strict equality on-chain would let a 1-wei transfer turn the badge
red forever, and S13 forbids a sweep. How surplus is allocated (yield to pots) is decided with
R10; until then it stays in the vault, visible via `surplus()`.

## Stricter readings chosen (contracts, Wave 1)

Where the rule text allowed more than one reading, the stricter one is built and tested:

- R2: each split weight must be > 0, pots in a split are distinct and owned by the split's
  creator, the remainder pot must be one of the split's pots, and only the split's owner may
  deposit through it (multiple senders per pot is Wave 2). A deposit of 0 is rejected.

## Done means

All test names above exist, each was seen failing before its fix (note the commit in the PR),
none are skipped, and `pnpm check` + `pnpm test:invariant` pass. The simulated month
(`scripts/`, 50 families × 30 days, with retries and failed top-ups) ends with `booksBalance() == true`.
