# Status (Sat 2026-10-24, submission due 2026-10-25)

This replaces the morning audit of the same day, which described an earlier snapshot ("no money can
leave a pot yet"). That is no longer true. The audit is still in git history.

## Summary

- Wave 1 is built end to end on Mezo testnet: pots and splits, payee allowlist, itemized requests
  from a phone with no wallet, one-signature approval paid straight to the vendor, capped monthly
  allowance, statement and the `booksBalance()` badge.
- Vault deployed at `0x69B6401d6C94e11e6D2390F4ee35D5a55A375aeF` (`deployments/mezo-testnet.json`).
  It must be **redeployed** to include multicall (the one-transaction setup), then the app rebuilt.
- One internal security review is done (`docs/security-review.md`): no critical or high findings,
  one medium fixed (cancel a signed approval). Multicall was added after it and has its own addendum there.

## Tests

| Suite | Result |
| --- | --- |
| Contracts (`pnpm test`) | 88 passed (fuzz 256) |
| Invariants I1–I6 (`pnpm test:invariant`) | all pass, including a multicall handler action |
| `@ipin/shared` | 73 passed |
| Relayer | 43 passed, plus 3 anvil end-to-end tests (`pnpm --filter relayer test:anvil`) |
| App | 25 passed; svelte-check 0 warnings |

`pnpm check` passes.

## Rules and invariants

| ID | Status |
| --- | --- |
| R1 Units, R2 Splits, R3 Replays, R4 Fees, R7 Caps, R8 Approval, R9 Schedule | Built and tested |
| R5 Pending | Wave 2 (ADR-015: Wave 1 payouts are synchronous) |
| R6 Refunds | Wave 1: a failed payout reverts atomically. Async refunds are Wave 2 |
| R10 Savings | Wave 2 |
| I1–I6 | Invariant tests pass |

## User stories

| US | Status |
| --- | --- |
| US1 Pots and split | Built. One transaction after the redeploy |
| US2 Approved payees | Built |
| US3 Request from a phone | Built |
| US4 Approve and pay | Built |
| US5 Upkeep allowance | Built |
| US6 Statement and books balance | Built |
| US7 Refunds | Covered by tests (atomic revert) |
| US8 Savings vault | Wave 2 |
| US9 Fund with card | Built (link only; Banxa delivers on mainnet) |

Click-by-click walkthrough: `docs/demo.md`.

## Left for Wave 1

| Item | Owner |
| --- | --- |
| Merge `feat/multicall`, redeploy the Vault, rebuild the app | User (deploy key) |
| Verify the source on the explorer (first attempt failed) | User, after the redeploy |
| Security-review addendum for multicall | Done (docs/security-review.md) |
| Public URL: app on Vercel, relayer on Render or Railway | User (accounts) |
| Simulated month (50 families, 30 days) | Agent; cut first if short on time |
| Deck, 2-minute video (`docs/demo.md`), AKINDO form | User, agent drafts |
