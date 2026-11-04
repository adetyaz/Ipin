# Handoff: Ìpín, Wave 2 (written 2026-11-04)

For the next agent picking up this repo. Read this first, then `CLAUDE.md` (rules you must follow),
then `README.md` (source of truth for scope and rules). This file says where things stand and
what to do next. It does not repeat the rules.

## 1. The project in five lines

- **Ìpín** is purpose-bound money on Mezo. A sender (often abroad) splits MUSD into named pots, and
  money leaves a pot only to approved payees, within a monthly limit, through signed requests or
  schedules. One on-chain policy engine checks every payment.
- **Built for** the Mezo Buildathon on AKINDO. Wave 1 is submitted. **Wave 2 builds Nov 2–15, 2026.**
  Track 2 (Access and Distribution) is primary; Track 1 (Bitcoin-backed finance) comes through
  savings in sMUSD and borrow-to-pay.
- **Repo:** https://github.com/adetyaz/Ipin (owner: adetyaz). The local clone is at `/home/user/ipin`
  in the cloud session.
- **Stack:**
  - Foundry, solc 0.8.24, OpenZeppelin 5 (`contracts/`)
  - TypeScript + Hono + viem relayer (`relayer/`)
  - SvelteKit / Svelte 5 phone-first PWA (`app/`)
  - shared types, ABIs and EIP-712 code (`packages/shared/`)
  - pnpm workspace, Node 22
- **Live:**
  - App: https://ipin-ten.vercel.app (Vercel)
  - Relayer: https://ipin.onrender.com (Render, `render.yaml`)
  - Both deploy from **`main`**.

## 2. Branch state (important)

- **All Wave 2 work is on `feat/wave2-mezo-integration`**, pushed, 28 commits ahead of `main`.
  `main` is at `b8cae84` and still points at an older Vault.
- **The user merges.** Don't push to `main` yourself. Don't rewrite history (CLAUDE.md).
- The user's local clone is on Windows (Git Bash) at `C:/Users/PC/Documents/Projects/Work/Ipin`.
  They run all on-chain commands themselves, with their own key.

## 3. Addresses (Mezo testnet, chain 31611)

| What | Address |
| --- | --- |
| **Ìpín Vault (live, verified)** | `0x69aF910aF825faE2D06f320080a0A1023A0a48f8`. **Predates the M-02 fix: must be redeployed** (section 6) |
| Older Vaults (don't use) | `0xD5fC295C29b41B9174d1887a669941CC4327E9d7` (no zero-value BTC fix), `0x4F91686cd2BBb4fc0cfC0bAd4db16f8170fBc8a8` (first Showcase), `0x6da24cb091A69bc3026B233DBdD146cEb3b72727` (Wave 1 + multicall) |
| MUSD | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |
| Mezo sMUSD (`MUSDSavingsRate`, proxy) | `0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16` |
| Mezo `BorrowerOperationsSignatures` (what the Vault calls) | `0xD757e3646AF370b15f32EB557F0F8380Df7D639e` |
| Mezo `BorrowerOperations` (behind BOS) | `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` |
| Mezo `TroveManager` | `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0` |
| Mezo PCV | `0x4dDD70f4C603b6089c07875Be02fEdFD626b80Af` |
| Mezo BTC price oracle (**chain precompile**) | `0x7b7c000000000000000000000000000000000015` |
| Relayer account (fees go here) | `0x1466F9EB70B79d2b36af7A4A31c45AD9AC861b54` |
| User's deployer / sender / trove owner | `0x99BD4BDD7A9c22E2a35F09A6Bd17f038D5E5eB87` |
| Showcase merchant (`keccak256("ipin-showcase-merchant")`) | `0xfA06F4Eb20b6Bb8706fBD7E4266469b7d20F2B5F` |

Mainnet (chain 31612), for later:
- sMUSD proxy `0xb4D498029af77680cD1eF828b967f010d06C51CC`
- BorrowerOperationsSignatures `0xB57ab578BF20b3e318f3EFAA587C51DBccE5df7a`
- PCV `0x391EcC7ffEFc48cff41D0F2Bb36e38b82180B993`

Verify the mainnet MUSD address and all of these on-chain before using them.

`deployments/mezo-testnet.json` is the single source for the Vault, MUSD and relayer addresses.
The app reads it at build time, the relayer at start, and the scripts at run time. Never hand-copy
an address into code.

## 4. What is done in Wave 2

Driven by the Wave 1 judges' feedback (Nov 1) and `docs/wave2.md` §7.

| Item | Where | Evidence |
| --- | --- | --- |
| R10 savings in Mezo's sMUSD (index-based yield, harvest first) | `contracts/src/Savings.sol`, ADR-019, app `sender/Savings.svelte` | `moveToSavings` / `withdrawFromSavings` on testnet (README table) |
| R13 borrow-to-pay via `withdrawMUSDWithSignature` | `contracts/src/Checkout.sol`, ADR-020 (+ addenda) | tx `0x4cfa5910…c374`: an empty pot paid the merchant 1 MUSD, borrowed against BTC |
| Zero-value BTC fix (Mezo calls the recipient with 0 value; the Vault had no `receive()`) | `Checkout.receive()` | rehearsal on a fork + that tx |
| **M-02 fix**: `receive()` accepts Mezo's call only during `borrowAndPay` (`_borrowing` flag), so a borrow signature submitted to Mezo directly reverts instead of stranding MUSD | `Checkout.sol`, `docs/security-review.md` "Second pass" | `test_R13_loanSignatureUnusableOutsideCheckout`; **not yet deployed** |
| L-04 fix: the relayer fills Mezo trove hints (`getPrev` / `getNext`) | `relayer/src/chain.ts` `withTroveHints` | `test_R13_relayerHintsTheBorrowersTrovePosition` |
| "Pay with a BTC loan" on the approval card (ratio before → after, blocks under 150%) | `app/src/lib/sender/RequestCard.svelte`, `sender/credit.ts`, `chain/credit.ts`; relayer `POST /requests/:id/approve-with-loan` | unit tests, dev preview; not yet clicked on testnet (the user's trove is too thin, section 7) |
| Full flow on testnet: multicall setup, `execute`, `createSchedule` + `executeSchedule`, `claimFees`, savings | `contracts/script/Showcase.s.sol` | README "On-chain evidence" (all on `0x69aF…`) |
| Subscriptions screen, merchant subscribe link, "short by $X" warning | `/send/subscriptions`, `/merchant`, `/send/subscribe` (one multicall: `addPayee` + `createSchedule`) | e2e on a local chain |
| 7 purpose templates | `/send/new`, `?template=<id>`, `sender/templates.ts` | unit tests + e2e |
| x402 agent weekly budget (step A: a schedule tops up the agent's wallet) | `sender/AgentFloat.svelte`, `docs/agents.md` | e2e on a local chain; an agent paying a live x402 service is **not verified** |
| Security review, second pass | `docs/security-review.md` | M-02, L-04 fixed; L-05, L-06, I-08..I-10 documented |
| Sender interview guide, Wave 2 form draft | `docs/evidence/interview-guide.md`, `docs/evidence/wave2-form.md` | placeholders `[[…]]` still to fill |
| Status page | `docs/status.md` | current |

Tests at handoff: `pnpm check` is green.
- Contracts: 109 tests (fuzz 256). `pnpm test:ci` (10k fuzz + deep invariants I1–I6) passes.
- `@ipin/shared`: 74.
- App: 44.
- Relayer: 49.

## 5. What is left

**User actions** (they need the user's key, accounts or real people):
1. Testnet redeploy for M-02 (section 6). Then the README links get refreshed: **agent task**.
2. Merge `feat/wave2-mezo-integration` into `main`, then check that Vercel and Render redeployed and
   that `https://ipin.onrender.com/health` reports `deployed: true`. After the redeploy, Render reads
   the new Vault from `deployments/mezo-testnet.json` on `main`.
3. Add test BTC collateral to the trove of `0x99BD…eB87` on https://testnet.mezo.org, to get above
   the app's 150% borrow limit (currently about 134%).
4. Interview 3–5 real senders (guide in `docs/evidence/`).
5. Fill the `[[…]]` in `docs/evidence/wave2-form.md`: team names, quotes, new Vault link, video.
6. **Last:** mainnet. The user decides when. The agent prepares the config: a mainnet deployments
   file, a Deploy.s.sol env for mainnet addresses, the app chain switch. The user deploys.

**Agent tasks now:**
- After the user sends the redeploy hashes: update README "Live on Mezo testnet", the README
  "On-chain evidence" table (all 8 rows), `docs/status.md`, and the Vault link in
  `docs/evidence/wave2-form.md`.
- Optional: a 2-minute Wave 2 demo video script (BTC-loan checkout, subscriptions, templates).

**Blocked or later (don't start without the user):**
- Naira payouts: needs a licensed partner.
- x402 step B (R11 mandates, ERC-1271 + Permit2): needs a design review.
- R12 recurring top-ups, milestone grants, tokenized-stock collateral: "Later" in the plan.

## 6. The testnet redeploy, exactly (user runs these in `contracts/`, Git Bash)

```sh
git pull                                   # on feat/wave2-mezo-integration
RPC=https://rpc.test.mezo.org

# 1. Rehearse on a fork against Mezo's real contracts (sends nothing).
#    Must print directSubmission "Sending BTC failed" and merchantGot 1000000000000000000
#    (both checked by the script: it reverts otherwise).
BTC_PRICE=$(cast call $(cast call 0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0 "priceFeed()(address)" --rpc-url $RPC) "fetchPrice()(uint256)" --rpc-url $RPC | cut -d' ' -f1) \
  forge script script/RehearseBorrowToPay.s.sol --sig "rehearse()" --rpc-url mezo_testnet
#    Slow (minutes): the fork fetches Mezo state over RPC. Silence after "Compiler run successful" is normal.
#    deployedVaultResult is about the CURRENT vault (0x69aF…): "" (success) is expected there,
#    since it already has the zero-value fix. Only the fresh vault and directSubmission matter.

# 2. Deploy and verify (writes deployments/mezo-testnet.json)
RELAYER_ADDRESS=0x1466F9EB70B79d2b36af7A4A31c45AD9AC861b54 forge script script/Deploy.s.sol \
  --rpc-url mezo_testnet --broadcast --private-key $DEPLOYER_KEY \
  --verify --verifier blockscout --verifier-url https://api.explorer.test.mezo.org/api/
git add ../deployments/mezo-testnet.json && git commit -m "chore: redeploy Vault with M-02 fix" && git push

# 3. Full-flow evidence (--slow is REQUIRED on Mezo, section 8)
forge script script/Showcase.s.sol --rpc-url mezo_testnet --broadcast --slow
grep -o '"hash": "0x[0-9a-fA-F]*"\|"function": "[^"]*"' broadcast/Showcase.s.sol/31611/run-latest.json | paste - -

# 4. Borrow-to-pay evidence: forge can't simulate the borrow (precompile),
#    so the script writes calldata and cast sends it. Within 1 hour of step 4a.
forge script script/BorrowToPay.s.sol --rpc-url mezo_testnet --broadcast        # 4a
VAULT=$(grep -o '"pots": *"0x[0-9a-fA-F]*"' ../deployments/mezo-testnet.json | grep -o '0x[0-9a-fA-F]*')
cast send $VAULT $(cat ../deployments/borrow-to-pay.calldata) --private-key $DEPLOYER_KEY --rpc-url $RPC   # 4b
# If cast says "null response", the tx usually landed. Check before resending:
cast logs --address $VAULT --from-block <deployBlock> "Borrowed(uint256 indexed,address indexed,uint256)" --rpc-url $RPC
```

The user has no `jq` (use the `grep` form). `forge` is on their PATH, and `DEPLOYER_KEY` is in
`contracts/.env` (they `source .env`).

## 7. Open decisions (flag them, don't settle them silently)

- **Borrow safety margin, 150%** (`BORROW_SAFETY_RATIO` in `packages/shared/src/mezo.ts`;
  `docs/wave2.md` §4a, marked *proposed*). The user's trove sits at about 134%, so the app blocks their own
  BTC-loan payments. The recommendation given was to add collateral rather than lower the margin.
  The user hasn't answered.
- The ADR-018 Wave 2 order is "proposed: the user decides". The user accepted it implicitly, by
  saying "go on" at each step.
- Mainnet timing: the user said mainnet is the last step.

## 8. Hard-won lessons (read before touching anything on Mezo)

1. **Forge can't simulate Mezo borrows.** Mezo's PriceFeed reads the BTC oracle precompile
   `0x7b7c…0015`, which loops in Forge's EVM ("EvmError: Revert" hundreds deep). Use
   `RehearseBorrowToPay.s.sol` (it etches `script/stubs/StubBtcOracle.sol` over the precompile on a
   fork), and send the real transaction with `cast send`, which the Mezo node simulates.
2. **Mezo calls every borrow recipient with a zero-value BTC transfer**
   (`ActivePool.sendCollateral(recipient, 0)` → `SendCollateral`: "Sending BTC failed"). A
   recipient contract needs a `receive()`. Ours accepts it only while `_borrowing` (M-02). The mock
   `MockBorrowerOperationsSignatures` reproduces the call. Keep mocks faithful to Mezo's source.
3. **Mezo's node rejects out-of-order nonces** ("invalid sequence"). Run every multi-transaction
   `forge script` with `--slow`. To recover: `--resume --slow`, or a fresh run with `--slow`.
4. **Mezo RPC is flaky about receipts.** "null response" and "tx not found" after a send usually mean
   the receipt wasn't indexed yet. Check state (balances, nonces, logs) before resending.
5. **The Mezo app has two "borrow" products.** The user first borrowed **mUSDC** from a lending market,
   which is not a trove. A trove is opened with `BorrowerOperations.openTrove(debt, 0, 0)` plus BTC
   value; testnet `minNetDebt` is 1,800 MUSD. Check with `TroveManager.getTroveStatus(addr)` (1 =
   active).
6. **The Mezo borrow signature** is standard EIP-712, domain `BorrowerOperationsSignatures` v1,
   type `WithdrawMUSD(uint256 amount,address borrower,address recipient,uint256 nonce,uint256
   deadline)`, with a sequential nonce per borrower (`getNonce`). Hints are not signed.
   `withdrawMUSDWithSignature` has no caller restriction (that's what makes M-02 possible).
7. **Read Mezo's source instead of guessing:** `git clone --depth 1 https://github.com/mezo-org/musd`
   (`solidity/contracts/`). The user was rightly angry when debugging turned into guesswork. Read
   the code, form a hypothesis, prove it with a test or a read-only `cast call`, then change things.
8. **Writing a struct signature for `cast call` by hand is error-prone.** `Schedule` is
   `(uint256 potId, address payee, uint256 amount, uint64 start, uint64 interval, uint64
   nextPeriod, bool active)`. Copy struct layouts from `contracts/src/interfaces/`.
9. **Local e2e harness** (it lived in the previous session's scratchpad, recreate it if needed):
   - anvil with `--chain-id 31611`
   - `forge create` MockMUSD, MockSavingsRate and Vault (5 constructor args:
     `musd, relayer, fee, savings, borrowerOps`, with `address(0)` disabling an integration)
   - mint MUSD to anvil account 1
   - write a temporary `deployments/mezo-testnet.json` (**restore it with `git checkout` afterwards**)
   - start the relayer with `RELAYER_PRIVATE_KEY=<anvil key 0> RPC_URL=http://127.0.0.1:8545
     PORT=8788 SCHEDULER_INTERVAL_MS=5000`
   - start the app with `PUBLIC_RELAYER_URL=http://localhost:8788 npx vite dev --port 5199
     --strictPort`
   - in Playwright, route `https://rpc.test.mezo.org/**` to anvil and inject a `window.ethereum`
     stub for account 1
   - Kill old vite processes before starting a new one: two servers on one port serve stale code.
10. **ABI changes:** after a contract interface changes, run `pnpm abi` (repo root), then
    `cd packages/shared && pnpm gen:abi`. Don't run Prettier on `src/abi/generated.ts`; the sync
    test compares it byte for byte.
11. **Lint:** solhint `--max-warnings 0`. A `solhint-disable-next-line` needs a one-line
    justification on the line **above** it (the repo's style). Comments after `--` break the
    directive.
12. **Windows user specifics:** `forge` was added to their PATH. The deployer key in `.env` needed
    `0x`. A `RELAYER_ADDRESS` parse error came from CRLF line endings, fixed with `export`. Placeholders
    like `0x99BD…eB87` must never appear in commands they paste: always give full addresses.

## 9. Working with this user

- They want plain, direct answers and exact commands to paste. Don't hedge or guess. If you don't
  know, say what you'll check and check it.
- They run everything that needs their key. Never ask them to paste a private key into chat. A
  deployer key was shared in chat earlier (testnet only). **Never repeat it**, and recommend a fresh
  key before mainnet.
- Never commit `.env`, keys or `broadcast/`. `deployments/*.calldata` is git-ignored.
- `docs/research/` belongs to another agent: don't edit it.
- Commit style: conventional commits, ending with the attribution lines the session asks for. No model
  names in commits or code.

## 10. Map of the important files

```
contracts/src/       Vault.sol (Checkout + Savings + Multicall), PolicyEngine.sol (_settle: the one
                     money path), Pots.sol, Savings.sol (R10), Checkout.sol (R13), interfaces/
contracts/test/      Checkout.t.sol, Savings.t.sol, invariant/ (I1–I6 handler), mocks/ (Mezo mocks)
contracts/script/    Deploy, Showcase, BorrowToPay, RehearseBorrowToPay, stubs/StubBtcOracle
packages/shared/src/ eip712.ts (PaymentRequest + WithdrawMUSD), mezo.ts (Mezo ABIs, 150% margin),
                     schemas.ts (relayer API, incl. approve-with-loan), abi/generated.ts
relayer/src/         app.ts (routes), service.ts (approve / approveWithLoan), chain.ts (viem,
                     withTroveHints), scheduler.ts (runs schedules)
app/src/lib/         chain/vault.ts (reads/writes, multicall helpers), chain/credit.ts (trove reads),
                     sender/ (RequestCard, Savings, AgentFloat, credit, subscribe, templates, agent)
app/src/routes/      send/ (pots, new, pot/[id], requests, subscriptions, subscribe), merchant/, ask/, i/
docs/                money-rules.md (R1–R13), decisions.md (ADR-001..020), security-review.md,
                     wave2.md (the plan), status.md, agents.md, api.md, evidence/, handoff.md (this)
```
