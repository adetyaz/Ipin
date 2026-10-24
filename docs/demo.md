# Demo: the house story, click by click

For judges and for recording the 2-minute video. Everything runs on Mezo testnet. Amounts are the
house story at 1:100 scale: $1,000 becomes 10 MUSD.

## The story

**Tunde** lives in London and is building a house in Ibadan. **Bisi** runs the site. **Vendor Y**
sells cement. **Mama** gets a monthly allowance for upkeep.

Tunde decides what the money is for. Bisi asks for what the house needs. Vendor Y is paid directly.
Nobody touches the money in between, and the books always balance.

## User stories

| ID | As… | I want to… | So that… | Screen |
| --- | --- | --- | --- | --- |
| US1 | Tunde | split money into named pots (House, Upkeep) in one go | each purpose has its own money and limit | Create pots |
| US2 | Tunde | approve who can be paid from a pot | money can only reach vendors I trust | Pot → Who can be paid |
| US3 | Bisi | ask for an itemized purchase from my phone, with no wallet and no gas | I can buy what the house needs without holding the money | Invite link → New request |
| US4 | Tunde | approve a request with one signature and have the vendor paid directly | the money goes to the purchase, never through the requester | Requests → Approve |
| US5 | Tunde | pay Mama a capped allowance every month automatically | upkeep is covered without me remembering | Pot → Monthly allowance |
| US6 | Anyone | see every payment and check that the books balance | nobody has to trust us | Pot → Statement, Books balance badge |
| US7 | Tunde | have a failed payment change nothing | a failure never loses money | (tests: `test_R6_failedPayoutRevertsAtomically`) |
| US9 | Tunde | buy MUSD with a card | I can fund pots without crypto | Your pots → Fund with card (Banxa, mainnet only) |

US8 (savings vault) moved to Wave 2. See `docs/wave2.md`.

## Before you start

- **Tunde:** MetaMask on Mezo testnet with a little test BTC for gas (faucet:
  `https://faucet.test.mezo.org`) and at least 10 MUSD (borrow or swap at
  `https://testnet.mezo.org`).
- **Vendor Y and Mama:** any two spare addresses. They need nothing installed.
- **Bisi:** a phone, or a private/incognito browser window. No wallet.

## Click by click

### 1. Tunde creates the pots (US1)

1. Open the app and tap **I'm sending money**, then connect MetaMask.
2. Tap **Create pots**. Leave **House** (limit $7.50) and **Upkeep** (limit $2.50).
3. Under **Add money now**, enter **10.00**: House **7.50**, the rest goes to Upkeep.
4. Tap **Create 2 pots and add $10.00**. MetaMask asks twice: sign the amount (free), then confirm
   **one** transaction.

You see **Your pots are ready**, with House $7.50 and Upkeep $2.50.

### 2. Tunde approves Vendor Y (US2)

1. Open **House**. Under **Who can be paid**, tap **+ Add a payee**.
2. Name: **Vendor Y, cement**. Wallet address: Vendor Y's address. Confirm in MetaMask.

### 3. Tunde invites Bisi (US3)

1. Still in House, under **Who can ask**, type **Site manager** and tap **Create invite link**.
2. Send the link on WhatsApp, or copy it.
3. Bisi opens the link and taps **Accept invite**. Her phone makes a key that can only send
   requests. It can never move money.
4. Back on Tunde's screen, tap **Finish adding Site manager** and confirm in MetaMask.

### 4. Tunde sets Mama's allowance (US5)

1. Open **Upkeep**. Add Mama as a payee (as in step 2).
2. Under **Monthly allowance**, tap **+ Set up an allowance**: pay to Mama, **1.00** each month.
   Tap **Start allowance**.

The relayer pays it within about a minute, then once every 30 days. Never twice in a period.

### 5. Bisi asks for cement (US3)

On Bisi's phone:

1. **What do you need?** Cement bag 50kg. **How many?** 5. **Price each** 1.00.
2. **Who gets paid?** Vendor Y. Add a note if you like, then send the request.

You see **Request sent**. No MetaMask, no gas, no fee for Bisi.

### 6. Tunde approves and Vendor Y is paid (US4)

1. Tunde opens **Requests**. The card shows the item, quantity, total and payee.
2. Tap **Approve $5.00** and sign once.

Vendor Y receives 5.00 MUSD. House drops by 5.25 (5.00 plus the 0.25 relayer fee). Tap **See the
payment on Mezo explorer** to check it on-chain.

### 7. Anyone checks the books (US6)

1. Open **House** and scroll to **Statement**: the deposit, the payment and the fee, each with an
   explorer link.
2. On **Your pots**, the green **Books balance** badge reads `booksBalance()` from the contract.

## What the contract refuses (try these)

| Try | Result |
| --- | --- |
| Approve a request to an address that isn't an approved payee | Refused: "That payee isn't approved for this pot." |
| Add Bisi's address as a payee | Refused: a requester can never be paid from the same pot |
| Approve more than the pot's monthly limit | Refused: "This would go over the pot's monthly limit." |
| Submit the same signed approval twice | Paid once. The second is refused. |
| Cancel a signed approval before it settles | **Cancel approval**: the signature can never be used |

## Video (2 minutes)

| Time | On screen | Voiceover |
| --- | --- | --- |
| 0:00–0:15 | Photo of an unfinished house | "I sent $1,000 home to build my house. Six months later, the money was gone and the foundation wasn't done." |
| 0:15–0:30 | Tunde's phone, money "sent" | "Once money lands, you lose control. And while it waits, the naira eats its value." |
| 0:30–0:45 | Step 1: Create pots, one transaction | "With Ìpín, you decide what your money is for. It waits in MUSD, a Bitcoin-backed dollar." |
| 0:45–1:10 | Steps 5 and 6: Bisi asks, Tunde approves, Vendor Y paid | "Your site manager can ask. Only approved vendors get paid. Nobody touches the money in between." |
| 1:10–1:25 | Step 4 and the refusals table: allowance paid, a bad request refused | "Upkeep goes out every month, capped. Anything outside the rules is refused by the contract, not by us." |
| 1:25–1:40 | Step 7: Statement and the Books balance badge | "Every cent is accounted for, and anyone can verify it on-chain." |
| 1:40–2:00 | `docs/wave2.md` uses: school fees, subscriptions, agents, borrow-to-pay | "The same engine runs school fees, subscriptions, AI agent budgets and paying with BTC you never sell. Ìpín: you decide what your money is for." |
