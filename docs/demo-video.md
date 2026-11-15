# Demo video: the 2-minute pitch

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

## Script (2:00)

Speak at a calm pace; each line fits its slot at about 150 words a minute. Show the screen, not
the waiting: cut MetaMask pop-ups and relayer waits in the edit.

| # | Time | On screen | Voiceover |
| --- | --- | --- | --- |
| 1 | 0:00–0:10 | Photo of an unfinished house | "I sent a thousand dollars home to build my house. Six months later, the money was gone and the foundation wasn't done." |
| 2 | 0:10–0:18 | Title card: **Ìpín: you decide what your money is for** | "Ìpín is purpose-bound money on Mezo, in Bitcoin-backed dollars." |
| 3 | 0:18–0:32 | Browser A: **Create pots** → **Start from a purpose** → **Build a house** → **Add money now** 10.00 → one confirm → **Your pots are ready** | "Pick a purpose. Ìpín makes a House pot and an Upkeep pot, each with a monthly limit, funded in one transaction." |
| 4 | 0:32–0:52 | Browser B (phone): invite link → cement × 5 at 1.00, pay Vendor Y → **Request sent**. Browser A: **Requests** → **Approve $5.00** → explorer link | "My site manager asks from her phone, with no wallet and no gas. I approve with one signature, and the vendor is paid directly. She never touches the money." |
| 5 | 0:52–1:00 | A request over the limit → the refusal message | "Anything outside my rules is refused by the contract, not by us." |
| 6 | 1:00–1:12 | **Subscriptions** screen (Mama's allowance, a merchant) → `/merchant` link form | "Allowances and subscriptions run on schedule, capped. A merchant makes a subscribe link without a wallet." |
| 7 | 1:12–1:24 | **House** → **Savings** → **Move to savings** → **Saved** 2.00 | "Money waiting for the next purchase earns in Mezo's savings vault, and comes back to the same pot." |
| 8 | 1:24–1:44 | **Checkout** pot (empty) → **Or pay with a BTC loan** → ratio before and after → sign → explorer: borrow and payment in one transaction | "No money in the pot? Pay with a loan against your Bitcoin, without selling it. One transaction borrows from your Mezo trove and pays the merchant. If any check fails, nothing is borrowed." |
| 9 | 1:44–1:52 | Templates list → **Statement** → green **Books balance** badge | "School fees, medical bills, shop stock, even an AI agent's budget. And anyone can check the books balance." |
| 10 | 1:52–2:00 | Title card: https://ipin-ten.vercel.app · github.com/adetyaz/Ipin | "Ìpín. You decide what your money is for." |

## If something goes wrong while recording

- **Relayer slow to pay (scene 4 or 6):** Render may be waking up. Open
  https://ipin.onrender.com/health first, then record. Payments land within a minute.
- **"Your trove is too thin for this" in scene 8:** the BTC price moved. Lower the request amount,
  or record scene 8 from the evidence transaction on the explorer instead:
  [`0x3d3463a8…a467`](https://explorer.test.mezo.org/tx/0x3d3463a89506f5c2b859a911ac2c363ec4db0a85ef7f67c5f25984bd532ca467).
- **MetaMask shows the wrong network:** switch to Mezo testnet (chain 31611) before the scene.

## After recording

Upload to YouTube (unlisted is fine), then put the link in the README "Demo video" line and in
`docs/evidence/wave2-form.md` under Links.
