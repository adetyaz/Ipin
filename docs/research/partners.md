# Partner research: airtime provider (Wave 1) and naira payout partners (Wave 2)

Checked: 2026-10-18. Sources are listed in each section with the date they were checked. Anything marked **(unverified)** came from search summaries or third parties and needs confirming with the provider before we rely on it.

Covers the README "Decide" items: *Airtime provider (VTpass or Reloadly) and sandbox sign-up* and *Shortlist of naira bank-payout partners*.

---

## TL;DR

- **Airtime, Wave 1: VTpass.** Sandbox sign-up is self-serve. The docs publish magic phone numbers that force success, failure, pending, timeout, no-response and unexpected responses. That gives us the forced-failure-then-refund demo (R6) without any mocking. The API is simple: API-key headers, one `POST /api/pay`, and one `POST /api/requery`. A webhook reports final state and late reversals.
- **Reloadly** is the fallback. It is a good global API with OAuth, async top-ups and webhooks, but its docs describe no way to force a failure in sandbox ("use any number").
- **Payout shortlist, Wave 2:** (1) **Paycrest**: an on-chain escrow off-ramp, USDC/USDT on Base to NGN banks, with automatic refunds; (2) **Busha Business API**: USDT to NGN bank transfers, with a sandbox; (3) **Yellow Card Payments API**: stablecoin-funded NGN bank payouts, with a sandbox that forces failures, but onboarding is heavy (KYB plus a legal agreement before you get sandbox keys).

---

## 1. Airtime / data provider

### 1.1 VTpass (recommended)

| Item | Detail |
|---|---|
| Sandbox | Yes. Self-serve sign-up at https://sandbox.vtpass.com/register. Sandbox and live are separate accounts with separate keys. The auth docs mention no KYC for the sandbox. Live go-live requirements are not documented publicly **(ask VTpass)**. Whether the sandbox wallet comes pre-funded is not documented **(check after sign-up)**. |
| Base URLs | Sandbox `https://sandbox.vtpass.com/api/` · Live `https://vtpass.com/api/` |
| Auth | Static API key plus a public/secret key pair, generated under Profile > API Keys (the auth type must be set to "all" or "API keys"). Keys are shown **once**. **POST:** headers `api-key: <key>`, `secret-key: <secret>`. **GET:** headers `api-key`, `public-key`. |
| `request_id` rule | Must start with `YYYYMMDDHHII` in **Africa/Lagos (GMT+1)** time, matching the current date and time, at least 12 characters, with optional alphanumeric suffix, e.g. `202610201430ipin7f3a9c`. A wrong format gives code `085`, a duplicate gives `014`. We should derive the suffix from our on-chain payout id so requery is idempotent. |
| Airtime top-up | `POST /api/pay` with body `{ "request_id": "...", "serviceID": "mtn" \| "glo" \| "airtel" \| "etisalat"(9mobile), "amount": 100, "phone": "08011111111" }`. Success: `code: "000"`, `content.transactions.status: "delivered"`. Data bundles use the same endpoint plus a `variation_code` from the service's variations endpoint. |
| Status check | `POST /api/requery` with `{ "request_id": "..." }`. It returns the same shape as `pay`. |
| Async / webhook | `pay` is synchronous but may return pending (`099`, or `000` with status `initiated`/`pending`). Set the callback URL in the dashboard. VTpass POSTs `{type:"transaction-update", data:{...}}` at the final state. It retries until it gets `{"response":"success"}`, **5 attempts**. Always read `data.content.transactions.status`. **Late reversal:** a separate webhook with code `040`, status `reversed` ("TRANSACTION REVERSAL TO WALLET") arrives if the telco bounces a top-up that was already reported. Our adapter must refund the pot on this too, even after a "delivered". |
| Failure semantics | Final success: `000` + `delivered`. Final failure: `016` (failed), `091` (not processed, not charged), and validation errors `010`–`035`, `087` etc. Pending: `099`, `089`, `000` + `initiated`/`pending`. VTpass says to **treat timeouts, missing responses and any unexpected response as pending and requery**. `040` means reversed, so refund. |
| Sandbox test numbers (forced outcomes) | `08011111111` gives success · `201000000000` gives pending · `500000000000` gives unexpected response · `400000000000` gives no response · `300000000000` gives timeout · **any other number gives failed**. These are documented on the MTN page. The other network pages appear to use the same scheme **(confirm in sandbox)**. |
| Pricing | Commission comes as an instant discount (percentage or flat). It is returned in `commission_details` on pay and requery. Reported API rates: MTN 3.0%, Airtel 3.4%, Glo and 9mobile 4.0% **(unverified, from search summary; check dashboard)**. |
| Fit for R6 | Excellent. "Any other number" and the timeout number give us a deterministic refund demo. |

Sources (checked 2026-10-18):
- https://www.vtpass.com/documentation/ (index, sandbox register link)
- https://vtpass.com/documentation/authentication/
- https://vtpass.com/documentation/mtn-airtime-vtu-api/ (endpoint, params, test numbers)
- https://www.vtpass.com/documentation/re-query-services/
- https://vtpass.com/documentation/response-codes/
- https://vtpass.com/documentation/how-to-generate-request-id/
- https://vtpass.com/documentation/callback-api-integration/
- https://vtpass.com/documentation/transaction-update-webhook-api/
- https://www.vtpass.com/documentation/understanding-how-vtpass-commission-works/

### 1.2 Reloadly (fallback)

| Item | Detail |
|---|---|
| Sandbox | Yes. Register for free API keys at reloadly.com, toggle **Test mode** in the dashboard, and use the separate sandbox credentials from Developers > API settings. Sign-up appears self-serve. Live use requires account verification **(KYB details not documented publicly)**. |
| Auth | OAuth2 client credentials: `POST https://auth.reloadly.com/oauth/token` with `{client_id, client_secret, grant_type:"client_credentials", audience:"https://topups-sandbox.reloadly.com"}` (live audience `https://topups.reloadly.com`). Sandbox tokens last 24 hours, live tokens 60 days. Requests send `Authorization: Bearer <token>` and `Accept: application/com.reloadly.topups-v1+json`. |
| Airtime top-up | Sync: `POST https://topups-sandbox.reloadly.com/topups`. Async: `POST .../topups-async` with `{ "operatorId": <id>, "amount": "100", "useLocalAmount": true, "customIdentifier": "<our id>", "recipientPhone": {"countryCode":"NG","number":"08031234567"} }`. Get the operator id from `GET /operators/auto-detect/phone/{phone}/countries/NG`. Async returns `{ "transactionId": 28805 }`. |
| Status check | `GET /topups/{transactionId}/status`. Statuses: `PROCESSING`, `SUCCESSFUL`, `FAILED`, `REFUNDED`. |
| Webhook | Register the URL in Dashboard > Developers > Webhooks. The event is `airtime_transaction.status`, with payload `{id,type,liveMode,date,data:{...transaction.status}}`. Reply 200. |
| Forced failure in sandbox | **Not documented.** Reloadly's blog says the sandbox accepts "any number you want". There are no magic failure numbers. A refund test would need us to mock, or to trigger validation errors (bad operator or amount out of range), which are synchronous 4xx errors rather than a realistic async failure. |
| Pricing | Operator discounts apply in the portal's Pricing tab ("Local" vs "International" pricing; international gives better discount, local gives better FX). The blog cites MTN 3%, Airtel 4%, Glo 5% **(old/unverified)**. There is also FX exposure: the account is funded in USD and pays out in NGN. |

Sources (checked 2026-10-18; docs.reloadly.com is a JS app that would not render, so these are Reloadly blog quickstarts):
- https://reloadly.com/blog/?p=2613 (async top-up, status endpoint, webhook)
- https://reloadly.com/blog/?p=2660 (sandbox, "any number")
- https://www.reloadly.com/blog/?p=2820 and https://blog.reloadly.com/blog/airtime-python-quickstart (OAuth, audience, `customIdentifier`)
- https://support.reloadly.com/pricing-table · https://www.reloadly.com/blog/?p=1603

### 1.3 Alternatives considered
- **Flutterwave Bills API**: the sandbox exists, but we could not confirm that airtime works in test mode or that there are forced-failure inputs. Onboarding is heavier (business KYC for live). Worth it only if Flutterwave also becomes the payout partner. https://developer.flutterwave.com/docs/integration-journey (checked 2026-10-18)
- **Bitrefill / crypto-native airtime**: pays in crypto, which fits Mezo nicely, but there is no documented sandbox with forced failures. Not researched in depth.
- Local VTU aggregators (ClubKonnect, Baxi/Capricorn, Interswitch Quickteller) need business onboarding and have weaker public sandbox docs.

### 1.4 Recommendation for Wave 1
**VTpass.** It is self-serve with no KYB for the sandbox. It is Nigeria-native (all four networks plus data). Auth is API keys, with no token refresh. Its documented magic numbers cover exactly the paths we need to demo: success, failure (gives refund) and timeout (gives requery, then refund). Adapter rules:
1. `pay`: on `000`+`delivered`, mark paid. On a final-failure code, refund. On anything else (timeout, `099`, unexpected), mark pending.
2. Pending: requery with backoff, and also accept the webhook. If still unresolved after N minutes, treat it as pending-ops rather than auto-refunding, because an auto-refund could pay twice.
3. Webhook `040`/`reversed` at any time: refund the pot (R6).

**Human steps (about 10 minutes):**
1. Register at https://sandbox.vtpass.com/register (email and phone, self-serve).
2. Log in to the sandbox, go to Profile > API Keys, set the auth type to "API keys" or "all", copy the **api-key**, and generate the **public-key/secret-key** (shown once). Store them as `VTPASS_API_KEY`, `VTPASS_PUBLIC_KEY`, `VTPASS_SECRET_KEY` in `.env` (do not commit).
3. Check the sandbox wallet balance. If it is zero, fund it through the sandbox funding option or ask VTpass support.
4. Set the callback URL in the sandbox dashboard once our adapter has a public URL (ngrok or similar).

---

## 2. Naira bank-payout partners (Wave 2)

Requirement: accept stablecoins or USD (ideally from on-chain) and pay out NGN to Nigerian bank accounts (NUBAN) via API, with clear failure and refund semantics.

| Partner | API | Stablecoin in | NGN bank out | Onboarding | Contact route | Fit |
|---|---|---|---|---|---|---|
| **Paycrest** | Sender API v2 (`POST /v2/sender/orders`, `GET /v2/sender/orders/:id`, `POST /v2/verify-account`, public rates). Webhooks `payment_order.*`, HMAC-signed, retried for 24h. | USDC, USDT, cNGN on Base, Ethereum, Arbitrum, Polygon, BSC, Celo, Lisk, Starknet, Tron, Solana. **Not Mezo directly.** MUSD moves to Base via Wormhole NTT and there is a USDC/MUSD pool on Aerodrome (Base) **(unverified)**. | Yes, NGN is a live corridor (banks and wallets via local PSPs). | Self-serve sign-up at app.paycrest.io plus KYB. **Mainnet only, no sandbox**; test with real orders from $0.50. | app.paycrest.io; docs.paycrest.io; GitHub github.com/paycrest | **High.** On-chain escrow plus **automatic refund when an order cannot be fulfilled** maps directly to R6. Lowest onboarding friction. |
| **Busha (Busha Business API)** | REST: `POST /v1/recipients` (`ngn_bank`), `POST /v1/quotes` (USDT to NGN, `bank_transfer`), `POST /v1/transfers`, `GET /v1/transfers/{id}`, plus webhooks. Quotes expire after 30 minutes. | Yes: USDT (and other crypto balances) on the Busha Business account. | Yes: statuses `pending` > `processing` > `funds_delivered` / `cancelled`. | Busha Business account with KYB. Sandbox `https://api.sandbox.busha.so/v1`. Whether sandbox access is self-serve is unclear. Reportedly holds a Nigerian SEC provisional DAX licence **(unverified)**. | enterprise@busha.co · https://cal.com/busha-business/30min | **High.** Nigerian, regulated, documented sandbox. |
| **Yellow Card Payments API** | REST under `/business`: channels, networks, rates, submit send (quote), accept/deny, lookup, webhooks. Signed requests (API key plus secret). | Yes: the business balance is pre-funded in USD stablecoins to a deposit address. A `directSettlement` crypto mode also exists. | Yes (NGN supported). | **Heavy:** contact form, discovery call, pre-integration form, KYB, AML review, signed legal agreement, **then** sandbox keys. Production needs IP whitelisting. | https://links.yellowcard.io/contact | **Medium-high.** Best sandbox (bank account `1111111111` gives complete, `0000000000` gives failed), but slow to start. |
| Juicyway | API for collections and payouts, including bulk (docs.juicyway.com). | USDC/USDT wallets. Business is stablecoin-based. | Yes (NGN). Holds PSSP and IMTO licences **(press)**. | Not public. | Partner page: juicyway.com/partner | Medium. Good fallback; API detail is unverified. |
| Flutterwave Transfers | Mature transfers API with test mode. | Some USDC/RLUSD settlement announced **(press)**, but payouts draw on a Flutterwave fiat balance. | Yes. | Registered business with full KYC (CAC/TIN for Nigerian entities). | Sales via flutterwave.com | Low for us: no on-chain funding path, heavy KYC. |
| Paystack Transfers | Mature API. | No. | Yes (₦10–₦50 fee per transfer, plus ₦50 stamp duty on ₦10k or more since Feb 2026). | **Registered Nigerian business only.** | paystack.com | Low: needs a Nigerian entity and NGN funding. |
| Kotani Pay | v3 REST plus SDK, on/off-ramp, sandbox host available. | Yes (stablecoins). | NGN is listed, but the off-ramp to Nigerian banks is unconfirmed (focus is East Africa mobile money). Confirm via `POST /api/v3/providers`. | KYB. | developers.kotanipay.com | Low-medium until NGN bank coverage is confirmed. |
| Onafriq | Payouts API (sync/async, webhooks) across African banks and wallets. | USDC treasury via Conduit (Feb 2026). No stablecoin endpoint is documented. | Nigeria bank coverage not confirmed. | Enterprise. | developers.onafriq.com | Low: enterprise sales cycle. |
| Fonbnk | Developer-led API. | Yes. | NGN bank payout not confirmed in public sources. | Unknown. | fonbnk.com | Low until confirmed. |
| Bitnob | Payout API, USDT/USDC wallets. | Yes. | Claims African payouts; no public NGN endpoint docs found. | Unknown. | bitnob.com | Low-medium. |

Sources (checked 2026-10-18):
- Paycrest: https://docs.paycrest.io/ · https://docs.paycrest.io/implementation-guides/sender-api-integration
- MUSD on Base: https://www.diadata.org/map/global-stablecoins/stablecoin/musd-mezo/ · https://dexpaprika.com/base/pool/0xff56d037d948fad1027a1ac82ae610e4b694c641 (third-party; confirm in Mezo docs)
- Busha: https://docs.busha.io/examples/customer-payouts · https://busha.io/business · https://busha.io/llms.txt
- Yellow Card: https://docs.yellowcard.engineering/docs/getting-started-api.md · https://docs.yellowcard.engineering/docs/sandbox-testing-api.md · https://docs.yellowcard.engineering/docs/disbursement-user-journey.md · https://docs.yellowcard.engineering/v1.0.26/docs/environments-api · https://yellow-card.helpscoutdocs.com/article/812-b2b-payment-api-faq
- Juicyway: https://www.juicyway.com/ · https://techcrunch.com/2024/12/16/this-stealthy-african-stablecoin-startup-already-processed-over-1b-in-cross-border-payments · https://fin.com/stories/juicy-way
- Flutterwave: https://developer.flutterwave.com/docs/making-payments/transfers/overview · https://developer.flutterwave.com/docs/nigerian-bank-account-transfer
- Paystack: https://support.paystack.com/hc/en-us/articles/360012276559-Transfers · https://paystack.com/pricing · https://support.paystack.com/en/articles/7573314
- Kotani Pay: https://documentation.kotanipay.com/v3/overview · https://documentation.kotanipay.com/v3/api-reference/system/providers.md
- Onafriq: https://developers.onafriq.com/docs/api-overview · https://techcabal.com/2026/02/11/onafriq-joins-africas-stablecoin-shift-in-cross-border-payments/
- Fonbnk: https://www.rfp.wiki/financial-services-banking-fintech/cross-border-payments-remittance/fonbnk/bridge (third-party)
- Bitnob: https://linkedin.com/company/bitnob · https://www.alchemy.com/dapps/bitnob

### 2.1 Shortlist

1. **Paycrest.** It has the most natural fit with an on-chain pot contract. MUSD can be swapped to USDC on Base, then a Paycrest order created, and an unfilled order refunds automatically. The risk: no sandbox (mainnet, $0.50 minimum) and no Mezo support, so it needs a bridge plus swap hop. Ask whether Mezo or MUSD support is on their roadmap.
2. **Busha.** It is a regulated Nigerian exchange with a documented USDT-to-NGN bank API and a sandbox. The risk: we would hold a custodial USDT balance at Busha, and the KYB timeline is unknown.
3. **Yellow Card.** It is the largest pan-African stablecoin ramp, with a good sandbox that includes failure accounts. The risk: sandbox keys only come after KYB and a signed agreement, so it is unlikely to be ready by Nov 2. Start the conversation now for "Later".

### 2.2 Intro email drafts

Fill the `[ ]` placeholders before sending.

**To Paycrest** (via app.paycrest.io support / Paycrest team channel)

> Subject: Ìpín: NGN off-ramp integration for purpose-bound remittances (Mezo / Base)
>
> Hi Paycrest team,
>
> I'm [name], building Ìpín, a purpose-bound remittance app on Mezo for the Mezo Buildathon. Senders in the diaspora fund pots that pay Nigerian recipients only for approved purposes (upkeep, school fees, vendors). In Wave 2 (Nov 2–15) we want to pay vendors' Nigerian bank accounts in naira.
>
> Paycrest's escrowed orders with automatic refunds match our model, because a failed payout must return funds to the pot. Our funds start as MUSD on Mezo, which we'd move to USDC on Base and settle through the Sender API.
>
> Could you confirm: (1) KYB requirements and timeline for a sender account, (2) any test or low-value path for integration (we know the minimum is $0.50), (3) the expected NGN settlement time and refund window, and (4) whether Mezo or MUSD support is planned?
>
> Happy to jump on a short call. Thanks, [name] · [email] · [repo/demo link]

**To Busha** (enterprise@busha.co)

> Subject: Busha Business API: USDT to NGN bank payouts for a remittance pilot
>
> Hi Busha team,
>
> I'm [name], founder of Ìpín, a purpose-bound remittance product on Mezo (a Bitcoin L2). Senders abroad fund on-chain pots that release money in Nigeria only for approved purposes. From November we want to pay approved vendors' Nigerian bank accounts in naira.
>
> Your recipients, quotes and transfers API (USDT to NGN `bank_transfer`) looks like the right rail. Could you share: (1) Busha Business onboarding and KYB requirements for a [country]-registered / pre-incorporation team, (2) sandbox access at api.sandbox.busha.so, (3) fees, limits and settlement times for NGN bank payouts, and (4) supported deposit networks for USDT/USDC?
>
> We're starting with small pilot volumes ([~$X/month]) and could integrate within two weeks. Could we book 30 minutes? Thanks, [name] · [email] · [link]

**To Yellow Card** (https://links.yellowcard.io/contact)

> Subject: Payments API: stablecoin-funded NGN bank disbursements (remittance pilot)
>
> Hello Yellow Card team,
>
> I'm [name], building Ìpín, purpose-bound remittances to Nigeria on Mezo. Diaspora senders fund on-chain pots, and funds are released only for approved purposes, including payments to Nigerian vendors' bank accounts.
>
> We'd like to use the Payments API to disburse NGN to bank accounts from a stablecoin-funded balance. We are at pilot stage ([~$X/month] initially) and want to begin the onboarding process now: discovery call, KYB and sandbox access. Could you tell us the documents you need, the typical time to sandbox keys and to production, and the pricing for NGN bank sends?
>
> Thank you, [name] · [email] · [link]

---

## Open questions to confirm
- VTpass: is the sandbox wallet pre-funded? Are the magic numbers the same for Glo, Airtel and 9mobile? What are the live go-live (KYC) requirements?
- Paycrest: do we need a registered entity for KYB? What is the refund window length?
- Mezo: what is the official MUSD to Base bridge path (Wormhole NTT)? Confirm in Mezo docs or Discord.
