# Demo video: the full product in 3 minutes

A recording script for the complete demo. Everything runs live on Mezo testnet against Vault
[`0x8B6D…7082`](https://explorer.test.mezo.org/address/0x8B6D769249e97aEefE1Bc2a60318E8297AAa7082).
Amounts are the house story at 1:100 scale: $1,000 becomes 10 MUSD. Click-by-click detail for each
screen is in [demo.md](demo.md).

**Cast:** Tunde (sender, London), Bisi (site manager, Ibadan, no wallet), Vendor Y (cement), Mama
(monthly allowance), Ade's Shop (a merchant).

## Before you record (15 minutes)

1. **Browser A (Tunde):** desktop Chrome with MetaMask on Mezo testnet, account
   `0x99BD4BDD7A9c22E2a35F09A6Bd17f038D5E5eB87`. It has test BTC for gas, MUSD, and an open BTC
   trove at about 229%, so "Pay with a BTC loan" is available.
2. **Browser B (Bisi):** a phone, or an incognito window shrunk to phone width. No wallet.
3. **Addresses ready to paste:** Vendor Y, Mama and Ade's Shop. Any spare addresses work.
   Keep them in a notes file so you never type an address on camera.
4. **Pre-make, off camera:** an empty pot called **Checkout** with Ade's Shop as a payee, and a
   pending request from Bisi in it (so the BTC-loan scene is one click).
5. **Tabs open:** the app (https://ipin-ten.vercel.app), the Mezo explorer on the Vault, and the
   README "On-chain evidence" table.
6. Screen at 1080p, browser zoom 110%, notifications off. Record each scene separately and cut
   them together; MetaMask pop-ups can be trimmed in the edit.

## Script

| # | Time | On screen | Voiceover |
| --- | --- | --- | --- |
| 1 | 0:00–0:12 | Photo of an unfinished house | "I sent a thousand dollars home to build my house. Six months later, the money was gone and the foundation wasn't done." |
| 2 | 0:12–0:22 | Title card: **Ìpín: you decide what your money is for** | "Once money lands, you lose control of it. Ìpín fixes that, with Bitcoin-backed dollars on Mezo." |
| 3 | 0:22–0:42 | Browser A: **Create pots** → **Start from a purpose** → **Build a house**. House 7.50, Upkeep 2.50, **Add money now** 10.00 → one MetaMask confirm → **Your pots are ready** | "I pick a purpose. Ìpín sets up a House pot and an Upkeep pot, each with a monthly limit, and funds them in one transaction." |
| 4 | 0:42–0:55 | Open **House** → **+ Add a payee** (Vendor Y) → **Who can ask** → **Create invite link**; Browser B opens it and taps **Accept invite** | "I decide who can be paid, and who can ask. My site manager gets a link. No wallet, no crypto, no gas." |
| 5 | 0:55–1:10 | Browser B: Cement bag 50kg × 5 at 1.00, pay Vendor Y → **Request sent**. Browser A: **Requests** → **Approve $5.00** → sign → **See the payment on Mezo explorer** | "Bisi asks for cement. I check the price and approve with one signature. The vendor is paid directly. Bisi never touches the money." |
| 6 | 1:10–1:22 | Try to approve a request over the limit, or to an unapproved payee → the refusal message | "Anything outside my rules is refused by the contract on Mezo, not by a promise from us." |
| 7 | 1:22–1:35 | **Upkeep** → **+ Set up an allowance** (Mama, 1.00 monthly) → then **Subscriptions** screen with next date, monthly total, **Stop** | "Mama's upkeep goes out every month, capped. Every subscription is in one place, with a warning before a pot runs short." |
| 8 | 1:35–1:48 | New tab: `/merchant` → Business name "Ade's Shop", address, 2.00, every 30 days → link → open it in Browser A → choose a pot → subscribe | "A merchant makes a subscribe link without a wallet. One signature and they're an approved payee on a schedule, and nothing more." |
| 9 | 1:48–2:05 | **House** → **Savings**: amount 2.00 → **Move to savings** → **Saved** shows 2.00 → **Bring back** | "Money waiting for the next purchase earns in Mezo's savings vault, sMUSD, and comes back to the same pot. Yield is shared out fairly per pot." |
| 10 | 2:05–2:30 | **Checkout** pot (empty) → the pending request → **Or pay with a BTC loan** → ratio before and after → sign → paid → explorer shows the borrow and the payment in one transaction | "No money in the pot? Pay with a loan against your Bitcoin, without selling it. Ìpín borrows from your Mezo trove and pays the merchant in one transaction. It shows your safety ratio first, and if any check fails, nothing is borrowed." |
| 11 | 2:30–2:42 | Templates list (School fees, Medical care, Shop stock, AI agent budget) → **+ Give an agent a weekly budget** | "The same engine runs school fees, medical bills, shop stock, and even a weekly budget for an AI agent." |
| 12 | 2:42–2:52 | **Statement** in House → green **Books balance** badge → README evidence table | "Every payment is on-chain, and anyone can check that the books balance." |
| 13 | 2:52–3:00 | Title card: logo, https://ipin-ten.vercel.app, github.com/adetyaz/Ipin | "Ìpín. You decide what your money is for." |

## If something goes wrong while recording

- **Relayer slow to pay (scene 5 or 7):** Render may be waking up. Open
  https://ipin.onrender.com/health first, then record. Payments land within a minute.
- **"Your trove is too thin for this" in scene 10:** the BTC price moved. Lower the request amount,
  or record scene 10 from the evidence transaction on the explorer instead:
  [`0x3d3463a8…a467`](https://explorer.test.mezo.org/tx/0x3d3463a89506f5c2b859a911ac2c363ec4db0a85ef7f67c5f25984bd532ca467).
- **MetaMask shows the wrong network:** switch to Mezo testnet (chain 31611) before the scene.

## After recording

Upload to YouTube (unlisted is fine), then put the link in the README "Demo video" line and in
`docs/evidence/wave2-form.md` under Links.
