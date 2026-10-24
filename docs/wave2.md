# Wave 2 and beyond: one engine, many purposes

Status: **design, not built.** Nothing here is in Wave 1 scope (CLAUDE.md rule 1). New rules below are
numbered R11+ and marked *proposed*. Each one moves into `docs/money-rules.md`, with its failing
tests, only when it is built. Direction decision: ADR-018 in `docs/decisions.md`.

Wave 2: build Nov 2–15, judging Nov 16–22.

## The idea in one paragraph

Ìpín's core is not "remittance". It is **money with a job**. A pot is MUSD with rules: who may ask,
who may be paid, how much per period, and what triggers a payment. The house is the first job.
Subscriptions, AI agent budgets, school fees and paying at checkout with borrowed MUSD are other
jobs. Each is a **configuration of the same engine**, never a shortcut around it. Every payment
still takes one path: signed intent → PolicyEngine → settlement.

## What already exists (Wave 1, on testnet)

The engine already has every primitive these features need:

| Primitive | Where | Reused by |
| --- | --- | --- |
| Pots, split on deposit | `Pots.sol` (R2) | every use case |
| Payee allowlist per pot | `PolicyEngine.addPayee` (I5) | subscriptions, agents, checkout |
| Cap per 30-day period | `PolicyEngine.setCap` (R7, I3) | agent budgets, subscriptions |
| Schedules with any interval | `PolicyEngine.createSchedule(pot, payee, amount, start, interval)` (R9) | subscriptions, recurring payments |
| Sender-signed EIP-712 requests | `PolicyEngine.execute` (R3, R8) | checkout, mandates |
| Gasless relayer with a flat MUSD fee | `relayer/` (R4) | everything |
| `booksBalance()` | `Pots.sol` (I1) | proof for every use case |

So recurring payments work today: a schedule to an approved payee *is* a subscription. Wave 2 adds
what is missing around it, below.

---

## 1. Purpose templates: Ìpín for other situations

A template is a preset: pot names, split, cap, release mode and payee type. No new contract code.

| Template | Pots | Release mode | Who asks | Who gets paid |
| --- | --- | --- | --- | --- |
| Build a house (Wave 1) | House, Upkeep | On request + schedule | Site manager | Vendors, family |
| School fees | Fees, Books | On schedule (termly) + on request | Parent or student | The school's account, bookshop |
| Medical | Care | On request, low cap | Relative | Hospital, pharmacy |
| Small-business stock | Stock | On request | Shop owner | Suppliers |
| Grant by milestone | Stage 1..n | On request + proof (later) | Grantee | Contractors |
| Subscriptions | Subs | On schedule | Nobody (automatic) | Services |
| Agent budget | Agent | Per use (x402) | An AI agent | Allowlisted services |
| Pay at checkout | Credit | Borrow then pay, one transaction | The sender | A merchant |

App work: a template picker on `/send/new` that pre-fills the existing create-pot flow.

---

## 2. Recurring payments and subscriptions

**Today:** the sender creates a schedule: pot, payee, amount, start, interval. The relayer triggers
it when due. The contract pays at most once per period (R9), within the cap (R7), only to the named
payee (I5).

**Wave 2 adds:**

1. **Subscriptions screen.** It lists every schedule as a subscription with next due date
   (`nextDue()`), amount and payee, plus a one-tap cancel (`cancelSchedule`). App only.
2. **Merchant subscriptions.** A merchant (a Mezo ecosystem service, a school, a gym) shares a
   "subscribe" link with payee, amount and interval. The sender opens it, sees the terms and signs
   once. That one transaction adds the payee and creates the schedule (multicall). The merchant
   never holds an allowance on the sender's wallet. Money only ever leaves the pot, within its cap.
3. **Recurring top-ups (funding side).** The sender's own pots refill every month. There are two
   options:
   - *From a wallet:* the sender approves MUSD to the vault once, with a capped amount and an end
     date (proposed R12). A keeper pulls the top-up and splits it with the pot's split (R2).
   - *From a BTC loan:* see section 4. One `WithdrawMUSD` signature is needed per draw, so this is
     "tap to top up" rather than fully automatic.
4. **Failure handling.** A schedule that cannot pay (pot empty, cap hit) does not lose the period
   (`test_R9_failedRunDoesNotForfeitPeriod` already covers this). Wave 2 adds a notification to the
   sender ("Upkeep is short by 12 MUSD").

**Proposed rule:**

| ID | Statement |
| --- | --- |
| R12 Top-up mandates | A pull from a sender's wallet happens only under a live mandate the sender signed: amount ≤ mandate amount, at most once per interval, never after its end date, always split with the pot's split. |

---

## 3. x402 and AI agent budgets (per-use release mode)

**Problem:** agents and pay-per-call APIs need to pay many small amounts without a human approving
each one. The sender still wants a hard ceiling and a list of services the agent may pay.

**Shape:** the sender gives an agent a **mandate** on one pot. The mandate covers: the agent's key,
the services it may pay (payee allowlist), a max per call, a cap per period, and an end date. That
standing signature replaces "approve each request". Every call still goes through the PolicyEngine.

**x402 flow (Mezo):**

```
agent → GET /tool                     service replies 402 with {payTo, amount, asset: MUSD}
agent → Ìpín relayer: pay(payTo, amount, mandateId), signed with the agent's key
relayer → PolicyEngine: mandate live? payTo allowlisted? amount ≤ per-call max? cap headroom?
         → pays the service from the pot (one transaction, flat fee R4)
agent → GET /tool with payment proof  service checks it and serves the request
```

Mezo pieces we use (README "Mezo reference"): the x402 facilitator `facilitator.vativ.io` (pays
gas in BTC), the settlement proxy `0x402085c248EeA27D92E8b30b2C58ed07f9E20001`, and the SDK
`@x402/evm` (testnet from v2.10.0). MUSD is a Permit2 + EIP-2612 token, so it is x402-compatible.

**Two build steps, safest first:**

| Step | How | Trade-off |
| --- | --- | --- |
| A. Agent float | A schedule tops up the agent's own x402 wallet from the pot, for example 5 MUSD a week. The agent pays services with the standard x402 client. | Ships in days and uses only Wave 1 code. Loss is bounded by the float. The payee allowlist applies to the float, not to each call. |
| B. Direct settlement | The vault validates Permit2 signatures through ERC-1271 (`isValidSignature`), only for payments that passed the mandate checks. The facilitator then settles straight from the pot. | Every call is policy-checked on-chain (I5 holds per call). More contract work, and it needs a security review. |

**Proposed rule and invariant:**

| ID | Statement |
| --- | --- |
| R11 Mandates | A per-use payment settles only if a live, unrevoked sender mandate covers that agent key, that payee and that amount: amount ≤ per-call max, period spend ≤ mandate cap, before the end date. |
| I6 (extended) | No payment executes without the sender's approval, given either per request (R8) or as a standing mandate (R11). |

The same mandate covers **subscriptions to agent services**, **buying an agent** (a one-off
payment plus a monthly schedule) and **agent-to-agent payments**. The difference is only which
payees are allowlisted.

---

## 4. Pay at checkout by borrowing: keep your BTC, pay in MUSD

> Pay at checkout by borrowing against what you hold, so you never have to sell it. The loan and
> the payment happen in one transaction.

### 4a. On Mezo with BTC (Wave 2, Track 1)

Mezo already lends MUSD against BTC (troves). Facts from `mezo-org/musd`
(`BorrowerOperations.sol`, `BorrowerOperationsSignatures.sol`, read 2026-10-24):

- Collateral is BTC. The minimum collateral ratio is 110%.
- The minimum net debt is set at 1,800 MUSD at initialization. Governance can change it, with a
  floor of 50 MUSD. The default borrowing fee is 0.1%, added to the debt. Interest is simple and
  fixed per trove. **Read live values on-chain before quoting them** (`minNetDebt()`,
  `borrowingRate()`).
- **`withdrawMUSDWithSignature(amount, hints, borrower, recipient, signature, deadline)`**: the
  borrower signs an EIP-712 `WithdrawMUSD(amount, borrower, recipient, nonce, deadline)` message,
  anyone can submit it, and the new MUSD is minted **to `recipient`**.

That last function makes one-transaction checkout possible without custody:

```
1. The user already has a trove (BTC locked). Opening one is a one-time step in the Mezo app.
2. At checkout the user signs two things: WithdrawMUSD(amount = price + fee, recipient = Ìpín vault)
   and an Ìpín PaymentRequest(pot = Credit, payee = merchant, amount = price).
3. Ìpín's Checkout contract, in ONE transaction:
     borrow: withdrawMUSDWithSignature → MUSD minted into the vault, credited to the Credit pot
     pay:    PolicyEngine.execute       → merchant paid, fee charged (R4)
   If either step fails, the whole transaction reverts. No debt without payment, no payment without debt.
```

Why it fits Mezo's criteria:

- **Extends a Mezo product** (MUSD borrowing) instead of detouring. Every checkout mints MUSD.
- **Composable:** we call Mezo's own BorrowerOperations and do not build a new lending market.
- **Same safety story:** the merchant must be an approved payee, the cap applies, and the books
  still balance, because borrowed MUSD enters as a pot credit like any deposit (I2).

Limits to state honestly:

- The 1,800 MUSD minimum debt means a user opens a credit line once and draws on it per
  purchase. It is not a new loan per coffee.
- The borrower's trove nonce is sequential, so checkouts from one borrower settle one at a time.
- Liquidation risk stays with the user. The app shows the collateral ratio before and after the
  purchase, and blocks a purchase that would take it under a safety margin (proposed: 150%).

**Proposed rule:**

| ID | Statement |
| --- | --- |
| R13 Borrow-to-pay | A checkout borrows exactly `price + fee`, credits it to the named pot and pays the merchant in the same transaction. If any step fails, nothing is borrowed and nothing is paid. Borrowed MUSD enters the books as a deposit (I2). |

### 4b. Tokenized stocks as collateral (later, research)

Tokenized stocks do not exist on Mezo today. What we found (secondary sources, Oct 2026):

- Kraken/Backed **xStocks** are on Ethereum, Solana, Tron and BNB Chain, for non-US users only.
- Lenders that accept tokenized stocks: Kamino (Solana), Aave (Coinbase-issued equities, low LTV)
  and an Euler vault (tokenized stock → PYUSD).

Possible design: on BNB Chain or Ethereum (both allowed by the buildathon), a **collateral adapter**
borrows against the user's tokenized stock in an existing lending market that lists it, then swaps
the borrowed stable into MUSD (MUSD is bridged by Wormhole), then pays through the same Checkout
contract. All of it happens in one transaction.

Open before building: which market lists an xStock on an allowed chain, MUSD liquidity on that
chain, oracle behaviour when stock markets are closed, and who may legally use it (non-US only).
Until those are answered this stays **Later**, and section 4a is the version we demo.

---

## 5. Track fit

| Feature | Track | Why it scores |
| --- | --- | --- |
| Pots, requests, approvals (Wave 1) | 2: access | Non-crypto requesters and vendors use MUSD with no wallet and no gas |
| Savings vault for idle pots | 1: yield | sMUSD is Mezo's own yield product; idle money earns |
| Borrow-to-pay checkout (BTC) | 1: borrowing | New MUSD demand from real spending; built on Mezo's own troves |
| Recurring top-ups from a BTC loan | 1: borrowing | A BTC holder funds family monthly without selling BTC |
| x402 agent budgets | 2: access | MUSD becomes the currency agents spend, with hard caps |
| Subscriptions and merchant links | 2: access | Merchants get recurring MUSD revenue through a link |
| WhatsApp requests | 2: access | Matches the "bots where users already are" example |
| Templates | 2: access | One engine, many audiences |

We submit to **both tracks**: Track 2 primary (as Wave 1), Track 1 through savings and borrow-to-pay.

## 6. Business model

| Stream | Amount (proposed) |
| --- | --- |
| Flat fee per payment (exists, R4) | 0.25 MUSD, lower for small x402 calls |
| Checkout fee, paid by the merchant | Small %, well under card fees |
| Merchant subscription links | Free to create; the per-payment fee applies |
| Yield share on idle pots | None in Wave 2. Users keep 100% of yield. |

## 7. Proposed Wave 2 order (2 weeks)

| Priority | Item | Depends on |
| --- | --- | --- |
| P0 | Mainnet deploy + savings vault (R10) | Security review of the R10 code |
| P0 | Borrow-to-pay checkout on Mezo (R13) | Mezo testnet trove; read the live `minNetDebt()` |
| P0 | Subscriptions screen + merchant subscribe link | Nothing new on-chain |
| P1 | x402 agent float (step A) | Nothing new on-chain |
| P1 | Templates | App only |
| P1 | Naira bank payouts | Partner signed (docs/research/partners.md) |
| P2 | x402 direct settlement (step B, R11) | ERC-1271 + Permit2 design review |
| P2 | Recurring top-ups (R12) | Mandate design |
| Later | Tokenized-stock collateral (4b), passkeys, WhatsApp, milestones with photo proof | Research above |

This order differs from the feature board's Wave 2 list, which leads with naira payouts. It is a
proposal (ADR-018): the user decides.

## 8. Open questions

- [ ] Live `minNetDebt()` and `borrowingRate()` on Mezo testnet and mainnet.
- [ ] Is `BorrowerOperationsSignatures` deployed on testnet, and at which address?
- [ ] Does the x402 facilitator accept ERC-1271 (contract) payers through Permit2? This decides
      whether step B is possible.
- [ ] Which lending market lists an xStock on BNB Chain or Ethereum, and is there MUSD liquidity
      there?
- [ ] Merchant interest: talk to two Mezo ecosystem services about subscription links.
