# Status (Wed 2026-11-04, Wave 2 builds Nov 2–15)

Wave 1 is unchanged and live. This page tracks Wave 2 against the judges' Nov 1 feedback and the
plan in `docs/wave2.md` §7. Earlier snapshots are in git history.

## Live

- Vault `0x69aF910aF825faE2D06f320080a0A1023A0a48f8` on Mezo testnet, verified, with sMUSD savings
  (R10) and borrow-to-pay (R13) enabled (`deployments/mezo-testnet.json`).
- Every Mezo call has an explorer link in the README ("On-chain evidence").

## Tests

| Suite | Result |
| --- | --- |
| Contracts (`pnpm test`) | 109 passed (fuzz 256); `pnpm test:ci` 10k runs passed |
| Invariants I1–I6 (`pnpm test:invariant`) | pass, with savings and borrow-to-pay handler actions |
| `@ipin/shared` | 74 passed |
| Relayer | 49 passed |
| App | 44 passed; svelte-check 0 warnings |

`pnpm check` passes.

## Wave 2 items

| Item | Status |
| --- | --- |
| R10 savings in sMUSD | Done: contract, app card, on-chain |
| R13 borrow-to-pay | Done: contract, relayer endpoint, app "Pay with a BTC loan", on-chain |
| Full flow on testnet + verified Vault | Done (Showcase on `0x69aF…48f8`) |
| Subscriptions screen + merchant subscribe link (P0) | Done: `/send/subscriptions`, `/merchant`, `/send/subscribe` (one multicall: addPayee + createSchedule); e2e on a local chain: link → subscribe → relayer pays → stop |
| Security review of R10/R13 (P0) | Done (second pass in `docs/security-review.md`): M-02 fixed (borrow signature unusable outside Ìpín), L-04 fixed (relayer trove hints); **Vault `0x69aF…` predates the fix: redeploy** |
| Mainnet deploy (P0) | Not started: needs the testnet redeploy + rehearsal first, real BTC/MUSD and your go-ahead |
| Real sender evidence; track and team in the form | Guide and form draft ready: `docs/evidence/interview-guide.md`, `docs/evidence/wave2-form.md`; interviews and team names pending |
| P1: templates | Done: 7 presets on `/send/new` (`?template=`), each tested against the form's rules |
| P1: x402 agent float (step A) | Done (Ìpín side): weekly top-up to the agent's wallet in one transaction, R7 warning; `docs/agents.md`. Not verified: an agent paying a live x402 service |
| P1: naira payouts | Blocked on a licensed partner |

## Lessons from testnet (ADR-020 addendum)

- Mezo sends a zero-value BTC call to every borrow recipient; the Vault now accepts it.
- Forge cannot simulate Mezo borrows (price oracle precompile); use `RehearseBorrowToPay.s.sol`
  on a fork, then `cast send`.
- Mezo's node rejects out-of-order nonces: run multi-transaction scripts with `--slow`.

## Open decisions

- Borrow safety margin: the app blocks loans under 150% (docs/wave2.md 4a, **proposed**). The demo
  trove sits near 134%, so it needs more BTC collateral, or the margin is lowered.
