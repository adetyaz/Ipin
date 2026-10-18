# Wallets and signing keys (requester and sender)

Checked 2026-10-18. Target: Mezo testnet (chain 31611, `https://rpc.test.mezo.org`), live by Oct 23.
Constraint: a non-crypto requester (site manager, cheap Android phone) and a judge must finish the
flow without help (README Wave 1 checklist "End to end"). There should be no seed phrase, and no
gas for anyone (ADR-001).

## 1. What the contracts actually need from each role

Read from `contracts/src/libraries/PaymentRequests.sol` (in progress, read-only) and
`docs/money-rules.md` R8 / I6:

- `PaymentRequest` is `{potId, payee, amount, nonce, expiry, runningTotal}`. **It has no requester
  field.** The nonce is in the *sender's* namespace (R3, I4).
- R8: a request-mode payment settles only with a valid EIP-712 signature **by the pot's sender**.
  `test_R8_rejectsNonSenderSignature` makes a requester's signature worthless on-chain by design.
- Schedules (R9) need no signature at execution.
- Funding: MUSD is `ERC20Permit` (mezo.md section 3), so the sender's deposit can also be one EIP-712
  `permit` signature that the relayer submits. **The sender never sends a transaction either.**

**Conclusion: the requester needs no chain key in Wave 1.** A request is an off-chain, authenticated
message to our relayer. The sender reads it and signs the real `PaymentRequest`. The only on-chain
signer is the sender, and the sender only ever *signs typed data* (permit and payment requests).
The relayer submits everything. This also means a wallet vendor's "custom chain" support matters less
than it seems. We need `signTypedData` with `chainId: 31611` in the domain. We don't need their RPC,
gas or bundler.

Two things to hand to the contracts agent:
1. **Signature check.** Verify R8 with OpenZeppelin `SignatureChecker.isValidSignatureNow`
   (ECDSA, falling back to ERC-1271), not bare `ECDSA.recover`. Mezo Passport's BTC wallets act through an
   OrangeKit *smart account* (mezo.md section 4), so their signatures can only be checked through
   ERC-1271. I did not verify that OrangeKit implements `isValidSignature`, so ask in Discord. With
   `ECDSA.recover` only, Passport senders could never approve. Embedded-wallet and passkey-derived
   EOAs are unaffected either way.
2. **README wording.** README Architecture says "a requester ... is a key with permissions on a pot".
   The contracts don't model requesters on-chain, so the README should say requesters are off-chain
   identities held by the relayer in Wave 1. The Wave 2 agent session key is a separate question.

## 2. Options

Prices and limits are from the vendors' pages on 2026-10-18. "Custom chain" means we can sign on
chain 31611 without a paid plan.

| Option | Setup time | Cost for us | Custom chain 31611 on free plan | Android UX (cheap phone) | Vendor lock-in | Main risk |
| --- | --- | --- | --- | --- | --- | --- |
| **Privy** embedded wallet | 1–2 h | Free Developer plan up to 499 MAU, 50K signatures/mo; next tier $299/mo | **Yes.** Docs: "embedded wallets can support *any* EVM-compatible chain" via viem `defineChain` in `supportedChains` | Email OTP / Google / passkey; iframe plus JS bundle (~heavy on 2G/3G) | Medium. Keys are Privy's (TEE/SSS); export is possible | Third-party outage or rate-limit mid-demo; bundle weight; I did not verify whether `signTypedData` checks domain chainId against `supportedChains` (add Mezo to be safe) |
| **Dynamic** embedded wallet | 2–3 h | No free production plan: a free *sandbox*; live needs Growth at $249/mo | Partly. Custom networks via `overrides.evmNetworks` are documented, but the docs don't say how the embedded wallet handles them; free = sandbox only | Email / social / passkey; heavy SDK | Medium–high | Sandbox-vs-live ambiguity for a public demo; cost |
| **thirdweb** in-app wallet | 1–2 h | 1,000 monthly active wallets free (official FAQ); whether a $0 plan tier exists is unclear (pricing page lists Growth from $99) | **Yes.** "works with any EVM chain", `defineChain({id, rpc})` | Email / phone / passkey / guest | Medium (thirdweb SDK, not plain wagmi) | Plan ambiguity; their AA/bundler rejects 31611 ("Invalid chain", mezo.md section 5), so use plain EOA mode only |
| **Web3Auth** (now MetaMask Embedded Wallets) | 2–4 h | Base: 1,000 MAW free; **passkeys need Growth $69/mo**; session only 1 day on Base | Probably. "All blockchains" is on Base; custom chain is added in the dashboard (v11+). Mezo is not in their list | Email / SMS / social on Base; no passkeys free | Medium | Rebrand and churn in docs (v10 to v11 to MetaMask); passkeys are paywalled |
| **Turnkey** | 3–5 h | 25 free signatures/mo, then $0.10 each with a card | Signing is chain-agnostic (raw digest or `PAYLOAD_ENCODING_EIP712`); their *transaction* signing list doesn't include Mezo, but we don't send transactions | Passkey-native; you build the UI | Low–medium (`@turnkey/viem` account) | 25 free signatures run out in testing; most build work of the vendors |
| **No vendor: device passkey + local key** (section 4) | 3–5 h (requester variant: about 2 h) | $0 | **Yes.** viem `privateKeyToAccount` signs for any chain | One fingerprint or screen-lock tap; no email or SMS; works offline-first in a PWA | None | Recovery is ours to design; PRF support varies by authenticator (fine on Google Password Manager on Android) |
| Mezo Passport (reference) | 1 h | $0 | Native | BTC/EVM wallet extensions or apps only | — | Not usable by a non-crypto requester (mezo.md section 4) |

### Notes on the no-vendor option

- **Requester (no chain key):** on invite, generate a WebCrypto **P-256** key with `extractable:
  false`, keep the `CryptoKey` in IndexedDB, and send the public key to the relayer once. Every
  request is signed with `crypto.subtle.sign`. There are no prompts at all: the device *is* the identity.
  Supported in every modern Android Chrome. A WebAuthn passkey (verified by the relayer with
  `@simplewebauthn/server`) can be added later as a stronger "tap your fingerprint" step, but it adds a
  system dialog that confuses first-time users.
- **Sender (needs secp256k1 for EIP-712):** WebCrypto has no secp256k1, so the key must be bytes.
  The best design uses the WebAuthn **PRF** extension: `privateKey = keccak256(prfOutput ‖ "ipin-v1")`, then
  viem `privateKeyToAccount`. The key is never stored, and because Google Password Manager and iCloud passkeys sync, the same passkey on a new
  phone yields the same address (recovery for free). Without PRF (some third-party password managers),
  fall back to a random key in IndexedDB, wrapped with a non-extractable AES-GCM key. That is device-bound,
  with no recovery beyond re-inviting. On-chain P-256 / `toWebAuthnAccount` needs a smart account and 4337,
  which mezo.md section 5 rules out for Wave 1.

## 3. Recommendations

### Requester: no wallet. Invite link plus a silent device key (no vendor)

The contracts give a requester signature no on-chain weight (R8), so a chain wallet would add
friction and a seed or recovery problem for no safety gain. The flow: sender shares a WhatsApp link,
the requester opens it in Chrome, types a name, and is done. There is no account, email, SMS cost or vendor. Safety
still comes from the sender's signature: a stolen requester device can only *ask*.
Loss or recovery: the sender taps "re-invite", which revokes the old public key.

5-step sketch (Vite/React PWA plus viem):
1. **Invite.** Sender app calls `POST /invites {potId, label}`. The relayer stores a random 128-bit
   one-time token (24 h expiry) and returns `https://app/r/<token>`. The sender shares it via the WhatsApp
   share intent (`navigator.share`).
2. **Device key.** On `/r/:token`:
   `crypto.subtle.generateKey({name:"ECDSA", namedCurve:"P-256"}, false, ["sign"])`. Store the
   `CryptoKeyPair` in IndexedDB (`idb-keyval`), call `navigator.storage.persist()`, and prompt "Add to
   home screen".
3. **Redeem.** `POST /invites/redeem {token, name, publicKeyJwk}`. The relayer burns the token and binds
   `{requesterId, potId, publicKey}`.
4. **Raise request.** Build `{potId, payeeId, amount: parseUnits(input, 18).toString(), note,
   photoHash, ts, reqId}` (viem `parseUnits`, so the amount is a bigint string per R1). Sign the canonical JSON with
   `crypto.subtle.sign({name:"ECDSA", hash:"SHA-256"}, privateKey, bytes)`. The relayer verifies the
   signature, freshness (`ts` within 5 min) and `reqId` uniqueness, checks that the payee is approved
   for that pot, stores it as *awaiting approval*, and notifies the sender.
5. **Status.** The requester polls `GET /requests?mine` (or uses SSE). It shows Awaiting approval, Approved, Paid
   (tx link to `explorer.test.mezo.org`), or Refunded. The requester never sees an address, gas or a token.

### Sender: Privy embedded wallet (email / Google / passkey), with Passport as "use my own wallet"

The diaspora sender is a semi-crypto user who expects "log in with email" and may switch phones.
Privy is free under 499 MAU, documents any-EVM-chain support with viem `defineChain`, gives a
viem-compatible EIP-1193 provider, and can hide its confirmation modal so our own approval screen
leads. It also handles recovery and export, which we would otherwise have to build. Keep Passport or
RainbowKit as a secondary button for BTC holders (Mezo-integration points; needs ERC-1271 in the vault,
see section 1).
**Fallback if Privy misbehaves on 31611 by Oct 21:** the no-vendor PRF passkey key (section 2).
Its signing code is identical, since both end in a viem account that calls `signTypedData`.

5-step sketch:
1. **Chain.** `npm i @privy-io/react-auth viem`, then define the chain:
   `export const mezoTestnet = defineChain({ id: 31611, name: "Mezo Testnet", nativeCurrency: { name:
   "Bitcoin", symbol: "BTC", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.test.mezo.org"] } },
   blockExplorers: { default: { name: "Mezo Explorer", url: "https://explorer.test.mezo.org" } }, testnet: true })`.
2. **Provider.** `<PrivyProvider appId={import.meta.env.VITE_PRIVY_APP_ID} config={{ loginMethods:
   ["email", "google", "passkey"], embeddedWallets: { ethereum: { createOnLogin:
   "users-without-wallets" } }, defaultChain: mezoTestnet, supportedChains: [mezoTestnet] }}>`.
   Add the production and preview domains to the Privy dashboard's allowed origins.
3. **viem client.** `const w = useWallets().wallets.find(x => x.walletClientType === "privy")`, then
   `const provider = await w.getEthereumProvider()`, then `createWalletClient({ account: w.address as
   Address, chain: mezoTestnet, transport: custom(provider) })`.
4. **Fund (one signature).** Sign the MUSD EIP-2612 `Permit` (domain read from the token's
   `eip712Domain()`, `spender = VAULT`). Send it with the split choice to `POST /deposits`. The relayer
   calls the vault's deposit-with-permit and pays the BTC gas.
5. **Approve.** For a pending request, the app builds the `PaymentRequest` (`potId, payee, amount,
   nonce, expiry, runningTotal = amount`), with the nonce supplied by the relayer and expiry set to now + 24 h. It calls
   `walletClient.signTypedData({ domain: { name, version, chainId: 31611, verifyingContract: VAULT },
   types: { PaymentRequest: [...] }, primaryType: "PaymentRequest", message })`. `name` and `version` must
   match the vault's `EIP712` constructor, so take them from the contracts agent. Then call `POST /requests/:id/approve
   {signature}`. The relayer pre-checks with `publicClient.verifyTypedData` (which also handles ERC-1271)
   and submits.

## 4. Open items

- Confirm with a 10-minute spike on Oct 19 that Privy's `signTypedData` works with `chainId 31611` and its
  modal hidden. If it fails, switch the sender to the PRF fallback.
- Ask Mezo Discord whether OrangeKit accounts implement ERC-1271 (Passport-as-sender).
- Contracts: `SignatureChecker` for R8 and for the permit path (MUSD's own `permit` is ECDSA-only, so a
  Passport sender would deposit with a normal `approve` transaction or Permit2 instead).
- Relayer: requester public-key registry, invite tokens, rate limit per requester and per pot.

## Sources

- Privy custom chains ("any EVM-compatible chain"): https://docs.privy.io/basics/react/advanced/configuring-evm-networks
- Privy pricing (Developer free 0–499 MAU, Core $299): https://www.privy.io/pricing
- Privy passkey login: https://docs.privy.io/authentication/user-authentication/login-methods/passkey
- Privy signTypedData and `showWalletUIs`: https://docs.privy.io/wallets/using-wallets/ethereum/sign-typed-data
- Dynamic pricing (sandbox free, Growth $249/mo): https://www.dynamic.xyz/pricing
- Dynamic custom EVM networks (`overrides.evmNetworks`): https://docs.dynamic.xyz/chains/evmNetwork
- thirdweb in-app wallet: https://portal.thirdweb.com/connect/in-app-wallet/overview
- thirdweb any EVM chain (`defineChain`): https://portal.thirdweb.com/typescript/v5/chain
- thirdweb pricing and wallet FAQ: https://thirdweb.com/pricing, https://portal.thirdweb.com/connect/wallet/faq
- Web3Auth / MetaMask Embedded Wallets pricing (passkeys on Growth $69): https://web3auth.io/pricing.html
- Web3Auth EVM chains (dashboard custom chains, Mezo not listed): https://docs.metamask.io/embedded-wallets/connect-blockchain/evm/
- Turnkey pricing (25 free signatures): https://www.turnkey.com/pricing
- Turnkey Ethereum support (EIP-712, `@turnkey/viem`): https://docs.turnkey.com/networks/ethereum
- WebAuthn PRF support overview (Google Password Manager on Android supports PRF): https://www.corbado.com/blog/passkeys-prf-webauthn
- Chromium PRF intent to ship: https://groups.google.com/a/chromium.org/g/blink-dev/c/iTNOgLwD2bI/m/Oz1C7oEYAgAJ
- Mezo Passport, ERC-4337 status, MUSD permit: `docs/research/mezo.md` sections 3–5
