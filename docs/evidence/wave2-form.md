# AKINDO Wave 2 form: draft answers

Copy into the AKINDO form. Replace every `[[…]]` before submitting. Explorer links point at the
Vault named in the README; after the next redeploy they are refreshed there, so re-copy them from
the README's "On-chain evidence" table on the day you submit.

## Track

Track 2 (Access and Distribution) primary, Track 1 (Bitcoin-backed finance) through savings in
sMUSD and borrow-to-pay on Mezo troves.

## Team

[[Name — role (contracts / relayer / app / research / design / business)]]
[[Name — role]]

## Updates in this Wave

We acted on every point in the Wave 1 feedback.

**Deeper Mezo integration (Track 1).**
- **Savings in Mezo's sMUSD:** idle pot money moves into `MUSDSavingsRate` from the Vault and back to
  the same pot. Yield is shared out per pot by index, so a late saver never takes earlier yield.
  In the app: Move to savings, Bring back, Check for new yield.
- **Borrow-to-pay:** a sender with BTC on Mezo pays an approved vendor with MUSD borrowed against
  their trove, in one transaction, through Mezo's `BorrowerOperationsSignatures`. If any check
  fails, nothing is borrowed and nothing is paid. In the app, "Pay with a BTC loan" on the approval
  card shows the collateral ratio before and after, and refuses loans that would leave the trove
  under 150%.

**The full flow on Mezo testnet, verified.** Vault [[0x… verified link]]. Every call has an
explorer link: one-transaction setup (multicall), approved payment (`execute`), monthly allowance
(`createSchedule` + `executeSchedule` by the relayer), fees (`claimFees`), savings in and out, and
borrow-to-pay (`borrowAndPay`). README → "On-chain evidence".

**Subscriptions and merchant links.** A Subscriptions screen lists everything a pot pays on a
schedule, with next date, monthly total, one-tap stop and a "short by $X" warning. A merchant makes
a subscribe link with no wallet; the sender signs one transaction that adds the merchant as a payee
and starts the schedule. The merchant never gets access to the sender's wallet.

**Security.** A second internal review of savings and borrow-to-pay against Mezo's source found
and fixed one medium issue (a borrow signature could be used outside Ìpín, stranding MUSD) and one
low (trove hints). 109 contract tests, 10k-run fuzzing and invariants I1–I6 pass. Every money rule
has a test that cites it.

**Evidence from senders.** [[N]] senders interviewed and tested on testnet.
[[Two-line summary of what they said, e.g. "4 of 5 have had money spent on something else; all 5
approved a request unaided."]]
> [[Quote 1 — first name, city]]
> [[Quote 2 — first name, city]]

## Milestones for Wave 3

1. **Mainnet.** Deploy the reviewed Vault on Mezo mainnet with sMUSD and borrow-to-pay, and onboard
   the first [[10]] real senders from the interviews.
2. **Agents and per-use payments.** x402 agent budgets: a pot tops up an agent's wallet on a
   schedule (no new contracts), then direct per-call settlement under a signed mandate.
3. **Templates and payouts.** Templates for school fees, building and family allowance, and naira
   bank payouts for vendors through a licensed partner ([[partner status]]).

## Links

- App: https://ipin-ten.vercel.app
- Relayer health: https://ipin.onrender.com/health
- Repo: https://github.com/adetyaz/Ipin
- Demo video: [[Wave 2 video link, or the Wave 1 one: https://youtu.be/MmmpK6DZjj0]]
- Deck: https://docs.google.com/presentation/d/1TV1C-6S-KPhzUcZUcKJrSV19zjBCZ63WyillbbS2ReY/edit?usp=sharing
