# Mezo research (2026-10-18)

How this was checked: Mezo docs (mezo.org/docs and the `mezo-org/documentation` repo), the `mezo-org/musd` repo, verified source on the Blockscout explorers (`api.explorer.mezo.org`, `api.explorer.test.mezo.org`), the AKINDO public API, and direct JSON-RPC calls to testnet (`https://rpc.test.mezo.org`) and mainnet (`https://mainnet.mezo.public.validationcloud.io`, chain 31612). Both nodes report `Mezod/13.0.0`.

Confidence levels: **High** means the code or chain state was read directly. **Medium** means docs or a single source. **Low** means inference.

---

## 1. MUSD savings vault (sMUSD)

**Answer.** Yes. It is `MUSDSavingsRate` ("MUSD Savings Rate", symbol `sMUSD`, 18 decimals). It sits behind an upgradeable proxy and is **not ERC-4626**.

| | Proxy (use this) | Implementation | Trusted ERC-2771 forwarder | Owner |
| --- | --- | --- | --- | --- |
| Testnet | `0x6f461c68b2c5492c0f5ccec5a264d692aa7a8e16` (TransparentUpgradeableProxy) | `0x92D12f0a60906b39d81acD9bf8977b6c824cD98C` | `0x5fa3d34f6c1537a0393098f0e124064b66ce8e24` (MezoForwarder) | `0x6e80164ea60673D64d5d6228beb684a1274Bb017` |
| Mainnet | `0xb4D498029af77680cD1eF828b967f010d06C51CC` | `0xb33c3f97bf3b7df59417d114c694353e42929e87` | `0xe6f919e62c370ef04edf4ca5e2a901ea1aa87085` (MezoForwarder) | `0x98D8899c3030741925BE630C710A98B57F397C7a` (Mezo multisig) |

How the addresses were found: `PCV.feeRecipient()` on the MUSD PCV contract returns the vault. PCV is at testnet `0x4dDD70f4C603b6089c07875Be02fEdFD626b80Af` and mainnet `0x391EcC7ffEFc48cff41D0F2Bb36e38b82180B993`, both from `musd/solidity/artifacts/deployments/*/PCV.json`. The mainnet address also matches the app URL `mezo.org/earn/vaults/0xb4D4…51CC`.

**Interface (verified source, solc 0.8.33, evm `london`; testnet and mainnet sources are identical):**

```solidity
function deposit(uint256 amount) external;       // pulls MUSD from _msgSender(), mints sMUSD 1:1 to _msgSender()
function withdraw(uint256 amount) external;      // burns sMUSD, auto-claims yield, returns `amount` MUSD to _msgSender()
function claimYield() external returns (uint256); // pays accrued yield in MUSD to _msgSender()
function claimableYield(address) view returns (uint256); // updated lazily, so it can be stale
function supplyYieldIndex(address) view returns (uint256);
function yieldIndex() view returns (uint256);
function musdToken() view returns (address);
function yieldToken() view returns (address);    // MUSD
function receiveProtocolYield(uint256) external; // PCV calls this; anyone can
// plus the standard ERC-20 functions (sMUSD is transferable)
```

Key semantics:
- **No `onBehalfOf` or receiver parameter.** Deposits mint sMUSD to the caller. A contract can deposit for itself: approve MUSD to the vault, then call `deposit(amount)`. Nothing restricts contract callers, and there is no allowlist.
- **Shares are 1:1 with principal.** Yield is not in an exchange rate. Yield accrues through a Synthetix-style `yieldIndex` and is paid out separately in MUSD by `claimYield()`, or automatically inside `withdraw()`. The user doc (`musd-savings-vault.md`) says yield sits "in the exchange rate". The deployed code does not work that way, so trust the code.
- No withdrawal fee and no time-lock. Withdrawal is instant, because the default IdleStrategy holds funds and deallocates them immediately.
- Yield arrives about weekly, when PCV distributes MUSD protocol fees. It does not accrue per block.
- `deposit` and `withdraw` first call `pcv.distributeMUSD()` inside a try/catch, which adds gas.
- On every sMUSD transfer, yield is settled for both sides. Moving sMUSD therefore does not move accrued-but-unclaimed yield.
- `_msgSender()` is ERC-2771 aware, so an EOA can deposit gaslessly through MezoForwarder (a GSN-style forwarder with EIP-712 `ForwardRequest` and ECDSA signatures). This is useful for EOAs only. It does not help our contract.
- Admin powers: the owner can `setStrategy` (move principal to a new strategy) and `setPCV`. The proxy is upgradeable. Both are trust assumptions to disclose.

**Evidence:**
- Verified source: https://api.explorer.mezo.org/api/v2/smart-contracts/0xb33c3f97bf3b7df59417d114c694353e42929e87 and https://api.explorer.test.mezo.org/api/v2/smart-contracts/0x92d12f0a60906b39d81acd9bf8977b6c824cd98c
- Explorer pages: https://explorer.test.mezo.org/address/0x6f461c68b2c5492c0f5ccec5a264d692aa7a8e16 · https://explorer.mezo.org/address/0xb4D498029af77680cD1eF828b967f010d06C51CC
- `IMUSDSavingsRate` and the PCV fee split: https://github.com/mezo-org/musd/blob/main/solidity/contracts/PCV.sol
- User docs: https://github.com/mezo-org/documentation (`src/content/docs/docs/users/mezo-earn/vaults/musd-savings-vault.md`) · https://mezo.org/earn/vaults/0xb4D498029af77680cD1eF828b967f010d06C51CC
- RPC checks: `name()` returns "MUSD Savings Rate", `symbol()` returns "sMUSD", the ERC-4626 selectors `asset()`, `totalAssets()`, `convertToAssets()` and `previewDeposit()` all revert, and the EIP-1967 implementation slot points to the addresses above.

**Confidence: High.**

**Impact on our design:**
- Idle pot money can go into the vault from our contract. The vault contract is the single sMUSD holder, and per-pot accounting stays internal. Principal is 1:1, so a pot's "invested" figure equals its principal.
- Yield arrives as MUSD from `claimYield()`, and also unprompted inside `withdraw()`. Measure yield as a balance delta. Never assume `withdraw(x)` returns exactly `x`, because it returns `x` plus any claimed yield.
- Spread yield across pots with our own yield index, the same pattern the vault uses. Alternatively, use the simpler rule from the money rules: yield goes to the sender's pot or the treasury.
- `booksBalance()` has to include `sMUSD.balanceOf(this)` (principal) plus unclaimed yield. The cleanest approach counts only realized yield.
- There is no need to call `claimableYield(addr)` on-chain for accounting, since it is stale until `_updateYieldFor` runs.
- Wave 1 can ship this. The "savings vault not callable" risk is closed.

---

## 2. Banxa

**Answer.** Banxa has been integrated in the Mezo app since 9 Dec 2025 as a fiat on-ramp to buy MUSD. It is described as working "directly in the Mezo app" with cards, Apple Pay, Google Pay and local bank transfer, in "dozens of countries".

Banxa's own integration model is a hosted checkout reached through a **partner referral URL** (`https://<partner>.banxa.com?coinType=…&blockchain=…&walletAddress=…&fiatType=…&fiatAmount=…`). It pre-fills the destination wallet address, so delivery to an address we choose is how it works by design. There is also a JS SDK or embedded option, plus a sandbox at `*.banxa-sandbox.com`.

Not found anywhere public:
- the `blockchain` code Banxa uses for Mezo (for example `MEZO`)
- whether a third-party dApp can use a referral URL without its own Banxa partner account
- any testnet support (Banxa sandbox normally uses test networks of major chains, not Mezo testnet)

**Evidence:**
- https://banxa.com/press/mezo-integrates-with-banxa-to-enable-global-fiat-on-ramp-for-musd-and-bitcoin-backed-finance/ (the page returned 403 to the fetcher; content taken from search snippets and translated copies)
- https://docs.banxa.com/products/hosted-checkout/docs/referral-integration/supported-parameters
- https://docs.banxa.com/products/hosted-checkout/docs/referral-integration/constructing-referral-urls

**Confidence:** Medium that Banxa delivers MUSD on Mezo mainnet to an address. Low that a hackathon team can use it without a partner account. High that it does not work on testnet (Low on the exact code).

**Impact on our design:**
- On testnet, a "Fund with card" button can only be a deep link to the Mezo app's Banxa flow, or a mocked or sandbox flow.
- Show it as an optional "top up pot" path, with the pot or vault address pre-filled through `walletAddress`, once Mezo confirms the partner subdomain and the blockchain code.
- Do not make it critical-path for Wave 1.

---

## 3. Permit2 and MUSD EIP-2612 permit

**Answer.** Both work on testnet and mainnet.
- **Permit2** is deployed at the canonical `0x000000000022D473030F116dDEE9F6B43aC78BA3` on testnet and mainnet. The runtime bytecode starts with the canonical Permit2 prefix `0x6040608081526004908136101561001557600080fd5b…`. The explorer shows no creator transaction, which suggests it was preinstalled.
- **MUSD permit (testnet `0x1189…c503`):**
  - `DOMAIN_SEPARATOR()` returns `0x6f9f5c5d441374bdc3939f5da85a145469d7ffbc96bfe0cce59e5de7d8f1474f`.
  - `nonces(addr)` works.
  - `eip712Domain()` (ERC-5267) returns name "Mezo USD", version "1", chainId 31611 (`0x7b7b`), and verifyingContract set to the token itself.
  - Source: `contract MUSD is ERC20Permit, Ownable` (OpenZeppelin v5, solc 0.8.24).
  - MUSD has no built-in Permit2 infinite allowance. It is an ordinary token from Permit2's point of view: the user approves Permit2 once, or uses EIP-2612 instead.
- Also present on both chains: Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11` and the CREATE2 deployer `0x4e59b44847b379578588920cA78FbF26c0B4956C`.

**Evidence:**
- RPC `eth_getCode` and `eth_call` against both chains
- https://github.com/mezo-org/musd/blob/main/solidity/contracts/token/MUSD.sol
- x402 doc ("MUSD is a `permit2` + EIP-2612 token"): `documentation/src/content/docs/docs/developers/getting-started/musd-payments-x402/index.mdx`

**Confidence:** High. A real permit signature was not submitted on-chain. Only the domain and nonces were read.

**Impact on our design:**
- Use EIP-2612 `permit` for the sender's first deposit, so funding is one signature and the relayer submits.
- Permit2 `permitTransferFrom` (SignatureTransfer) is also available if we want per-request one-shot pulls with a witness (for example, binding a pull to a request ID).
- The EIP-712 domain values in the README are correct.

---

## 4. Mezo Passport

**Answer.** `@mezo-org/passport` (latest 0.17.2, Jan 2026; dev 0.17.3-dev.4) is a React wallet-connection library **built on RainbowKit, wagmi 2 and viem 2**.
- It adds **Bitcoin wallets** (Unisat, OKX, Xverse) next to normal EVM wallets.
- Each BTC wallet controls an EVM smart account (through `@mezo-org/orangekit`). The BTC key signs, and the smart account sends Mezo transactions.
- Setup: `getConfig({ appName, bitcoinWallets? })` replaces RainbowKit's default config.
- Hooks: `useBitcoinAccount`, `useSendTransaction` (from the smart account), `useSendBitcoin`, plus the usual wagmi hooks.
- Peer dependencies: `react ^18.2`, `wagmi ^2.5.12`, `viem ^2.22.8`, `@rainbow-me/rainbowkit ^2.0.2`, `@tanstack/react-query ^5`.
- **It does not provide passkey, email, social or embedded wallets.** Neither the docs nor the README mention any. It targets Bitcoiners, not crypto newcomers.
- The dApp listing requirements ask only for "working wallet connection" (MetaMask, Passport, etc.). Passport is optional.

**Evidence:**
- https://www.npmjs.com/package/@mezo-org/passport
- https://cdn.jsdelivr.net/npm/@mezo-org/passport@0.17.2/README.md
- https://mezo.org/docs/developers/getting-started/ and `documentation/.../developers/getting-started/configure-mezo-passport.md`
- npm registry metadata

**Confidence: High.**

**Impact on our design:**
- Passport does not solve requester wallet UX. Requesters and vendors still need a passkey or embedded wallet from a third party, or our own relayer-backed signer. Options: Privy, Dynamic, Web3Auth or Turnkey (any EVM custom chain), or a WebAuthn passkey account.
- A P-256 precompile probably exists at `0x100`: `eth_estimateGas` to `0x…0100` costs about 3k gas more than an empty address. That is Medium confidence only, so verify before relying on it for an on-chain passkey verifier.
- Use Passport, or plain RainbowKit with the Mezo chain, for the **sender** side. Integrating Passport is cheap and scores Mezo-integration points, because it lets BTC holders fund pots.

---

## 5. ERC-4337 on Mezo

**Answer.**
- **EntryPoint v0.7** (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`) is deployed on testnet and mainnet. v0.6 (`0x5FF1…2789`) and v0.8 (`0x4337084D…f108`) are **not** deployed. The v0.7 SimpleAccountFactory (`0x91E6…8985`) is not deployed either.
- Safe v1.4.1 singletons and factory are present on testnet (`0x4167…461a`, `0x29fc…C762`, `0x4e1D…ec67`), along with Safe4337Module `0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226`. Mezo maintains a `safe-deployments` fork and runs safe.mezo.org.
- **There is no public bundler or paymaster.** Pimlico's public endpoint returns "chain 31611/31612 is not supported", thirdweb returns "Invalid chain", and Candide rejects the network. The Mezo RPC does not implement `eth_supportedEntryPoints`, and the Mezo docs never mention a bundler or paymaster.

**Evidence:**
- RPC `eth_getCode` on both chains
- Probes of `public.pimlico.io/v2/{31611,31612}/rpc`, `{31611,31612}.bundler.thirdweb.com` and `api.candide.dev/public/v3/31611`
- https://github.com/mezo-org/safe-deployments

**Confidence:** High for what is deployed. Medium that no bundler exists, since a private or partner bundler could exist without being documented.

**Impact on our design:** Use **our own vault plus relayer** with EIP-712 signed requests, as the README already prefers. Running 4337 would mean self-hosting a bundler (Alto, Rundler or Skandha) against EntryPoint v0.7, which is too much for Wave 1. Users still never pay gas, because the relayer pays BTC gas and recovers a fee in MUSD.

---

## 6. EVM version and solc

**Answer.**
- The docs' Hardhat and Foundry snippets still say `evmVersion: "london"` (solc 0.8.28 in the example), and Mezo's own vault is compiled with 0.8.33 for `london`.
- However, **mezod v7.0.0 (mainnet, 23 Mar 2026) upgraded EVM compatibility to Cancun**, and both networks now run mezod 13.0.0.
- Probes with `eth_call` of raw creation code, on testnet and mainnet:

| Opcode | Fork | Testnet | Mainnet |
| --- | --- | --- | --- |
| PUSH0 | Shanghai | Executes | Executes |
| TSTORE / TLOAD | Cancun | Executes, round-trips the value | Executes, round-trips the value |
| MCOPY | Cancun | Executes | Executes |
| BLOBBASEFEE | Cancun | Executes (returns 0) | Executes (returns 0) |
| CLZ | Osaka | Executes, `clz(1)` = 255 | Executes, `clz(1)` = 255 |

  A control run with INVALID (`0xfe`) correctly errors.
- Not tested: EIP-7702 (type-4 transactions) and the other Prague features.

**Evidence:**
- `documentation/src/content/docs/docs/users/resources/release-notes.md` ("upgrading EVM compatibility up to the Cancun fork")
- https://github.com/mezo-org/mezod/releases/tag/v7.0.0
- https://mezo.org/docs/developers/getting-started/ (london snippet)
- RPC probes listed above

**Confidence:** High that Cancun opcodes execute. Medium on whether Mezo officially supports anything newer than Cancun.

**Impact on our design:** Compile with `solc 0.8.28` to `0.8.33` and `evm_version = "cancun"`. This works on both networks, and OpenZeppelin v5's `ReentrancyGuardTransient` and `SafeERC20` paths are usable. For zero risk with verification or tooling, `paris` or `london` also works; only transient storage would be lost. Do not target `prague` or `osaka`.

---

## 7. Similar projects in the Mezo ecosystem

**Answer.**
- **"Mezzate"** has no public trace anywhere (web, GitHub, docs or AKINDO). It may be a mis-hearing from the kickoff.
- **MezoPay** came 2nd in the Supernormal dApp track at Mezo Hackathon 2 (the Encode Club hackathon, Sept 2025). It is a consumer app to send, request and split MUSD, with **savings pots**. It has no purpose-binding, approvals or vendor payouts, at least as described.
- Other Hackathon 2 winners nearby:
  - **Cark**: rotating savings circles (ROSCA)
  - **Mezo TreasuryOS**: treasury workspace with "approved surplus" and cash buffers for companies
  - **Cermin**: spendable versus set-aside MUSD
  - **SuperPage**: agent payments
- **Current buildathon submissions** (AKINDO, 9 products as of 18 Oct):
  - Remitsheet for Mezo: bulk-pay a spreadsheet in MUSD with one signature
  - MUSD Books: verifiable statements and invoice-referenced payments
  - MUSD Subs: recurring payments with revenue splits
  - Liqvera, Lockwatch, Vigil, Trove Guardian (loan monitoring)
  - Mezo Flow, kept
  - Also on GitHub: anikeaty08/ledger (invoice advances in MUSD)
- **None of them does purpose-bound pots with requester, approver and vendor roles, or escrowed remittance.** The closest neighbours are Remitsheet (sending) and MezoPay (pots).

**Evidence:**
- https://mezo.org/blog/announcing-mezo-hackathon-2-winners
- https://api.akindo.io/public/wave-hacks/OVOO0gdrVU8379D10/products
- https://github.com/anikeaty08/ledger
- https://github.com/mezo-org/documentation (`users/integrations/community-projects.md`)

**Confidence:** High for the lists above. Low for "Mezzate" (not found).

**Impact on our design:** Ìpín is differentiated. In the pitch, name MezoPay (P2P, savings pots) and Remitsheet (batch sending) as adjacent, then show what only Ìpín does: purpose rules, request and approve, vendor payout, and books that balance.

---

## 8. Hackathon tracks

**Answer.** The "Mezo Buildathon: Build with MUSD and MEZO" on AKINDO has two tracks:
- **Track 1: DeFi** (borrowing, lending, looping, yield), with example vaults, looping and LPs.
- **Track 2: Access and Distribution for MUSD/MEZO**, asking "How might we make MUSD and MEZO easier to discover, access, and use?" Examples: Telegram or WhatsApp bots, matching and discovery platforms, marketplaces and aggregators, and cross-platform wallets and interfaces that simplify MUSD access.

You can submit to both. Track selection on the form is multiple choice.

Schedule:
- Wave 1: build 16–26 Oct, judging 27 Oct–1 Nov, $2k.
- Wave 2: build 2–15 Nov, judging 16–22 Nov, $5k.
- Demo day: 23 Nov.
- Rewards are paid in MEZO, proportional to points, and require KYB.
- Deploying on Mezo testnet is accepted.

Stated priorities: "Extend, don't detour" and "**Composability wins**: projects that plug into existing DeFi infrastructure … score higher than isolated consumer apps."

**Does purpose-bound remittance fit Track 2?** Yes, reasonably. It puts MUSD in front of non-crypto recipients and vendors (access and distribution), with a request-and-approve UX that meets users where they are. A WhatsApp or Telegram request bot would match the examples exactly. Using the sMUSD vault for idle pots adds a Track 1 composability angle, so submit to **both**, with Track 2 as the primary.

**Evidence:**
- https://app.akindo.io/wave-hacks (the Mezo listing, ID `OVOO0gdrVU8379D10`; full text via https://api.akindo.io/public/wave-hacks/OVOO0gdrVU8379D10)
- Kickoff video: https://www.youtube.com/embed/eAiaQpzvVE0

**Confidence:** High on the track definitions. Medium on fit, which is our judgement. Mezo has not confirmed it.

**Impact on our design:**
- Lean into distribution: a messaging-bot or link-based request flow, and onboarding with no wallet for requesters and vendors.
- Lean into composability: the sMUSD vault, Permit2 or EIP-2612, and possibly Passport for BTC-holding senders.
- Set Track to "Track 2 + Track 1" on the form.
