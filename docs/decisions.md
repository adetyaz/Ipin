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

## ADR-008 Lint: `gas-small-strings` off
- Status: accepted (2026-10-18, contracts agent; convention change per CLAUDE.md rule 6)
- Why: EIP-712 type strings (`PaymentRequest(...)`, `Permit(...)`, `EIP712Domain(...)`) are longer
  than 32 bytes by specification and are hashed at compile time into `bytes32` constants, so the
  gas hint does not apply. Keeping the rule on would force disables on every typehash.
