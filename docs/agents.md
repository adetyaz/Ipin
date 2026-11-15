# AI agent budgets (x402, step A)

An agent that pays for APIs per call (x402) needs money it can spend without a human approving
each call. Ìpín gives it a **float**: a weekly top-up from one pot to the agent's own wallet. The
agent pays services from that wallet with a standard x402 client. This is step A in
[docs/wave2.md](wave2.md) §3; step B (each call checked on-chain under a mandate, R11) comes later.

## What the sender does

1. Create a pot with the **AI agent budget** template (`/send/new?template=agent`): one pot,
   "Agent", with a $2.50 monthly limit at testnet scale.
2. On the pot's page, **AI agent budget → Give an agent a weekly budget**: paste the agent's
   wallet address and the weekly amount (default $0.50). One transaction adds the agent as an
   approved payee and starts a 7-day schedule. The relayer pays each top-up when it's due.
3. Stop it any time under **Subscriptions**.

## The limits that hold

| Limit | Enforced by |
| --- | --- |
| The agent can only ever spend what's in its own wallet: the float, not the pot | The pot pays only approved payees (I5); the agent holds no allowance on the Vault |
| At most one top-up per week | The schedule pays once per period (R9) |
| Never more than the pot's monthly limit | R7. The app warns when 5 weekly top-ups (the most that fit in 30 days) would exceed it; those weeks then wait for the limit to reset |
| The agent can't also be a requester of the pot | I5 (the form refuses it) |

The trade-off, stated in the plan: the payee list applies to the float, not to each call. Which
services the agent pays from its own wallet is up to the agent. That's why the float is small and
weekly.

## What the agent does

Nothing Ìpín-specific. It holds MUSD on Mezo and pays x402 services as usual. Mezo's x402 pieces
(README "Mezo reference"): facilitator `https://facilitator.vativ.io` (pays gas in BTC), settlement
proxy `0x402085c248EeA27D92E8b30b2C58ed07f9E20001`, SDK `@x402/evm` (testnet from v2.10.0). MUSD
is a Permit2 + EIP-2612 token, so x402 can settle it.

```
week 0   Ìpín relayer ── executeSchedule ──► agent wallet   +0.50 MUSD
         agent ── GET /tool ──► service      402 {payTo, amount, asset: MUSD}
         agent ── pays with @x402/evm via the facilitator ──► service
         agent ── GET /tool + payment proof ──► service serves the call
week 1   the next top-up, if the pot's limit allows
```

Not yet verified end to end: an agent paying a live x402 service on Mezo testnet from the float.
The Ìpín side (the weekly top-up to the agent's address) is the same schedule path tested in
`test_R9_*` and the subscription e2e.
