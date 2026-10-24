# Decisions (ADR-lite)

Status: **proposed** (default in use, awaiting user confirm) · **accepted** · **open** (no default;
don't build anything that depends on it) · **superseded**. Append new entries; don't rewrite history.

---

## ADR-001 Account model: own Vault + relayer with EIP-712 signed requests
- Status: proposed (2026-10-18)
- Context: README Open question "own vault plus relayer, or ERC-4337 smart accounts". Unknown whether
  a bundler/EntryPoint runs on Mezo testnet; Wave 1 is 10 days.
- Decision: Vault contract holds pot funds. Senders and requesters sign EIP-712 payment requests;
  our relayer submits them and pays gas in BTC. No ERC-4337 dependency in Wave 1.
- Consequences: fewer moving parts and no bundler risk; the relayer is a liveness dependency
  (not a safety one: the contract checks everything). 4337/session keys can be revisited in Wave 2.

## ADR-002 Relayer fee: flat 0.25 MUSD per payment
- Status: proposed (2026-10-18)
- Decision: `FEE = 0.25 MUSD = 250000000000000000` base units (`25e16`), charged once per settled
  payment from the same pot (R4), refunded on failure (R6). Not counted toward the pot cap (see
  money-rules R7 note).
- Consequences: simple to explain and test. Make it a constructor/immutable parameter, not a magic
  number, so the amount can change without code changes.

## ADR-003 Cap period: fixed 30-day epochs from pot creation
- Status: proposed (2026-10-18)
- Decision: `PERIOD = 30 days`; `period = (block.timestamp - pot.createdAt) / PERIOD`. Spending
  resets to 0 at each epoch boundary. Schedules (R9) use the same epochs.
- Consequences: deterministic and cheap; no calendar-month logic. Not a sliding window: a sender
  can see up to 2× cap spent across an epoch boundary — acceptable and documented in the UI.

## ADR-004 Compiler: solc 0.8.24, EVM cancun
- Status: proposed (2026-10-18)
- Context: Mezo is EVM-compatible; OZ v5.7.0 needs ≥0.8.20 (some files ≥0.8.24).
- Evidence: on 2026-10-18, `eth_call` creation calls against `https://rpc.test.mezo.org`
  (chain 31611) executed PUSH0 (Shanghai), TLOAD and MCOPY (Cancun) successfully, while an undefined
  opcode was rejected, so the testnet supports `cancun`.
- Decision: exact `pragma solidity 0.8.24;`, `evm_version = "cancun"`, optimizer 200 runs, no via-IR.
  Dependencies pinned as submodules: forge-std v1.9.7, OpenZeppelin Contracts v5.7.0.
- Consequences: re-check on Mezo mainnet before Wave 2 deploy. A later solc bump is a new ADR.

## ADR-005 Team ownership
- Status: **open**
- Question: who owns contracts, relayer and adapters, frontend, deck and video.

## ADR-006 Final product name
- Status: **open**
- Question: keep "Ìpín" (working name) or rename. Until decided, use `Ipin` in identifiers and
  "Ìpín" in user-facing text.

## ADR-007 Airtime provider: VTpass (sandbox) for Wave 1
- Status: **accepted** (chief of staff, 2026-10-18)
- Why: self-serve sandbox with deterministic test numbers (`08011111111` success,
  `300000000000` timeout, anything else fails), so the R6 refund path is demonstrable without mocks.
  Reloadly is the fallback (no forced-failure path in sandbox).
- Adapter rules: timeouts/unexpected responses are pending (R5) and get requeried; a late
  reversal webhook (code `040`) after success must refund the pot (R6). Details:
  `docs/research/partners.md`.

## ADR-008 Wallets: requester has no chain key; sender uses Privy embedded wallet
- Status: **superseded** for Wave 1 by ADR-012 (2026-10-24). Kept as the post-Wave-1 plan.
- Requester: invited by WhatsApp link; the browser generates a non-extractable WebCrypto P-256
  device key (IndexedDB) that authenticates requests to the relayer. Nothing on-chain trusts it:
  only the sender's EIP-712 approval settles (R8). Recovery = sender re-invites.
- Sender: Privy embedded wallet (email/Google/passkey), signs typed data only (approvals and
  MUSD permit), never sends a tx. Mezo Passport offered as "use my own wallet".
  Fallback if Privy can't sign for chain 31611: passkey-PRF-derived key, same signing code.
- Contracts verify approvals with SignatureChecker (EOA + ERC-1271) so Passport smart-account
  senders work.
- Consequence: README's "a requester is a key with permissions on a pot" is wrong for Wave 1;
  fix it when the README is next updated. Details: `docs/research/wallets.md`.

## ADR-009 Lint: more gas hints off; S6 follows solhint order
- Status: accepted (2026-10-18, contracts agent; convention change per CLAUDE.md rule 6)
- `gas-indexed-events` off: it asks to index amounts. Amounts must stay in event data so that
  off-chain code and tests can sum them (I2); S9 already says which fields to index.
- `gas-strict-inequalities` off: `>=`/`<=` on money comparisons (`cap`, `expiry`, books) are written
  as the rule states them; rewriting them for ~3 gas makes off-by-one bugs more likely.
- S6 (file order) changed to the order solhint's `ordering` rule enforces (types, constants,
  state, events, errors, modifiers, functions), since lint runs with 0 warnings allowed.

## ADR-010 Unallocated surplus in I1
- Status: proposed (2026-10-18, contracts agent, following the coordinator's R10 brief)
- Decision: `booksBalance()` is `assets >= liabilities`; assets above liabilities are reported by
  `surplus()` and owed to no pot. Sources: MUSD sent to the vault without `deposit`, and savings
  yield (R10), which the savings vault pays in MUSD outside the principal.
- Open: who surplus is allocated to (pro-rata to `pot.saved`, the sender's pot, or the treasury) is
  decided with R10. Until then it is not moved by any function (no sweep, S13).

## ADR-011 Lint: `gas-small-strings` off
- Status: accepted (2026-10-18, contracts agent; convention change per CLAUDE.md rule 6).
  Renumbered on 2026-10-24: it was filed as a second ADR-008.
- Why: EIP-712 type strings (`PaymentRequest(...)`, `Permit(...)`, `EIP712Domain(...)`) are longer
  than 32 bytes by specification and are hashed at compile time into `bytes32` constants, so the
  gas hint does not apply. Keeping the rule on would force disables on every typehash.

## ADR-012 Wallets for Wave 1: injected sender wallet, app-generated requester key, minimal relayer
- Status: accepted (user, 2026-10-24). Supersedes ADR-008 for Wave 1. Track 2 only.
- Sender: an injected wallet (MetaMask) on Mezo testnet. No Privy in Wave 1.
- Requester: the app generates an EVM key and stores it in the browser. The sender registers that
  address on-chain per pot, so the contract knows the requester and can refuse to pay it (a
  requester is never a payee).
- Relayer: a minimal Node service with a funded testnet key that submits signed requests and runs
  schedules.

## ADR-013 Single PolicyEngine with built-in checks for Wave 1; policy plug-ins are Wave 2
- Status: accepted (user, 2026-10-24).
- Decision: Wave 1 has one PolicyEngine with fixed, built-in checks: payee allowlist, cap per
  period, nonce + expiry, and the sender's approval. There is no `IPolicy` interface and no
  per-policy contracts; `IPolicy.sol` was deleted unused.
- Why: four fixed checks don't need a plug-in seam, and one contract is easier to test and review
  before the deadline. Pluggable policies move to Wave 2.
- Follow-up: CODING_STANDARDS S15 ("one policy = one contract implementing `IPolicy`") and the
  README's "policy plug-ins" wording still describe the old plan; update them with their owners.
