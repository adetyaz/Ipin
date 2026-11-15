# AKINDO Wave 2 form: answers

Paste-ready. URLs are written out in full because the form may not render Markdown. Repo links
point at `main`, so merge `feat/wave2-mezo-integration` before submitting.

## Track

Track 2 (Access and Distribution) primary, Track 1 (Bitcoin-backed finance) through savings in
sMUSD and borrow-to-pay on Mezo troves.

## Team

adetyaz: solo builder (contracts, relayer, app, design, research).

## Updates in this Wave

Wave 1 judges asked for deeper Mezo integration and proof that the full flow works on-chain. This
wave adds two Mezo Bitcoin-finance features (savings in sMUSD and paying with a BTC loan), proves
every money path with a transaction on Mezo testnet, adds subscriptions, merchant links, purpose
templates and AI agent budgets, and closes a second security review.

Live app: https://ipin-ten.vercel.app
New verified Vault (Mezo testnet): https://explorer.test.mezo.org/address/0x8B6D769249e97aEefE1Bc2a60318E8297AAa7082
Repo: https://github.com/adetyaz/Ipin

1. Savings in Mezo's sMUSD (Track 1)
- Money waiting in a pot can now earn in Mezo's MUSD savings vault (MUSDSavingsRate, sMUSD). The
  Vault deposits it and withdraws it back to the same pot. While saved, it stays credited to its
  pot and can't be spent, so the purpose rules still hold.
- Yield is shared out per pot with an index, and is harvested before every move in or out. A pot
  that starts saving late never takes yield earned before it joined.
- In the app, each pot has a Savings card: Move to savings, Bring back, Check for new yield.
- On-chain: money moved in https://explorer.test.mezo.org/tx/0x2ee64d05a58f940f1b9a1ed3365bb1d18a7e8c6a8aa7d0d7b96fb12232fab879
  and brought back https://explorer.test.mezo.org/tx/0x636f3e27ad4a70d2886a46aeeb12b01bb3db1c2d0e6032fe50d2efbd5957f17a
- Code: https://github.com/adetyaz/Ipin/blob/main/contracts/src/Savings.sol (money rule R10)

2. Pay with a BTC loan (Track 1)
- A sender who holds BTC on Mezo can pay an approved vendor with MUSD borrowed against their BTC,
  without selling it. In one transaction, the Vault calls Mezo's BorrowerOperationsSignatures
  (withdrawMUSDWithSignature) with the sender's signed loan. Mezo mints the MUSD to the Vault, it
  is credited to the pot, and it is paid to the vendor through the same checks as every other
  payment (approved payee, monthly limit, signed request). If any check fails, the whole
  transaction reverts: nothing is borrowed and nothing is paid.
- In the app, the approval card has "Or pay with a BTC loan". It shows the trove's collateral
  ratio before and after the loan, and refuses a loan that would leave the trove under 150%.
- The relayer has a new endpoint (POST /requests/:id/approve-with-loan) and fills in Mezo's trove
  position hints.
- On-chain: a pot with no money paid a merchant 1 MUSD, borrowed against BTC, in one transaction:
  https://explorer.test.mezo.org/tx/0x3d3463a89506f5c2b859a911ac2c363ec4db0a85ef7f67c5f25984bd532ca467
- Before sending, we rehearsed it against Mezo's real contracts on a fork (script
  RehearseBorrowToPay.s.sol). Mezo sends every borrower a zero-value BTC transfer, which a
  contract must accept; the Vault handles it.
- Code: https://github.com/adetyaz/Ipin/blob/main/contracts/src/Checkout.sol (money rule R13)

3. Subscriptions and merchant subscribe links (Track 2)
- A Subscriptions screen lists everything a pot pays on a schedule: who, how much, the next date,
  the monthly total, a one-tap Stop, and a "short by $X" warning before a pot runs out.
- A merchant (a school, gym or shop) opens https://ipin-ten.vercel.app/merchant, enters a name,
  address, amount and interval, and gets a link. They need no wallet. The sender opens the link,
  picks a pot and signs one transaction that approves the merchant and starts the schedule. The
  merchant can only receive that amount on that schedule, and never gets access to the wallet.
- The relayer pays each schedule when it's due, at most once per period, within the pot's limit:
  https://explorer.test.mezo.org/tx/0x1c0bd08c9f01c082e0358ab5945f0e868bfec86bde3bd868c4077243feb36352

4. Purpose templates
- Seven templates on the Create pots screen: Build a house, School fees, Medical care, Shop stock,
  Subscriptions, AI agent budget and Pay with BTC. Each sets up the right pots and monthly limits
  in a few taps: https://ipin-ten.vercel.app/send/new

5. AI agent weekly budgets (x402, first step)
- A sender can give an AI agent a weekly budget: a schedule tops up the agent's wallet from a pot,
  so the agent can pay for services per call (x402) and can never spend more than the pot allows.
  It uses the existing payee and schedule rules, with no new contract code.
- Design and next step: https://github.com/adetyaz/Ipin/blob/main/docs/agents.md

6. The full flow proven on Mezo testnet
- We redeployed and verified the Vault with all fixes, then ran every money path on it. Each has an
  explorer link:
  - One-transaction setup (create pots, add payees, split MUSD): https://explorer.test.mezo.org/tx/0xf74ad8479252d06291fa7354e579f5ecda93959ad074a120eb5d9ad9423d459c
  - Sender-approved request paid straight to the vendor: https://explorer.test.mezo.org/tx/0x9a8b2a1195af381c390985240dfa68e96cfe6c15443607740f06f015aa21bd3c
  - Monthly allowance created: https://explorer.test.mezo.org/tx/0xab1ce2fb993e809545ab4d5271f6e1e8323559a4f272b501a08954303f43cbea
  - Allowance paid by the relayer: https://explorer.test.mezo.org/tx/0x1c0bd08c9f01c082e0358ab5945f0e868bfec86bde3bd868c4077243feb36352
  - Relayer fees claimed in MUSD: https://explorer.test.mezo.org/tx/0x29a39fbcc5a08db9ac5c1801f8f8fccdee46af352bdcb7aaca3810b31436d9f8
  - Savings in and out, and pay with a BTC loan: links in sections 1 and 2.

7. Security
- A second internal review checked savings and the BTC loan against Mezo's own source code.
- Fixed, medium: a borrower's loan signature could be sent to Mezo directly, outside Ìpín, which
  would leave the borrowed MUSD stuck in the Vault. Now the Vault accepts Mezo's borrow call only
  during its own checkout, so a loan signature only works through Ìpín.
- Fixed, low: the relayer now passes Mezo's trove position hints.
- The remaining low and informational findings are documented:
  https://github.com/adetyaz/Ipin/blob/main/docs/security-review.md
- Tests: 109 contract tests with fuzzing (10,000 runs in CI), invariant tests that the books always
  balance and money only reaches approved payees (I1–I6), and 167 tests across the relayer, app
  and shared package. Every money rule has a test named after it:
  https://github.com/adetyaz/Ipin/blob/main/docs/money-rules.md

8. Documentation
- The README describes the whole product, with diagrams of the system, the contracts and the BTC
  loan flow, and a build log of Wave 1 and Wave 2: https://github.com/adetyaz/Ipin#readme

## Milestones for the next wave

1. Mainnet. Deploy the reviewed Vault on Mezo mainnet with sMUSD savings and pay with a BTC loan,
   using a fresh deployer key, and onboard the first real senders sending money home to Nigeria.
2. Agents paying per call. AI agents pay x402 services directly from a pot under a mandate the
   sender signs (spend limit, payees, expiry), checked by the same policy engine.
3. More for senders. Recurring top-ups from the sender, statement export, approval thresholds,
   and more than one sender per pot (siblings funding a parent's upkeep together).

## Links

- App: https://ipin-ten.vercel.app
- Relayer health: https://ipin.onrender.com/health
- Repo: https://github.com/adetyaz/Ipin
- Demo video: https://youtu.be/nU1rUzyl1tM
- Deck: https://docs.google.com/presentation/d/1TV1C-6S-KPhzUcZUcKJrSV19zjBCZ63WyillbbS2ReY/edit?usp=sharing
