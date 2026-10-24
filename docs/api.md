# Integration contracts (Wave 1)

The fixed seams between contracts, relayer and app. Change them only by editing this file in the
same commit as the code, and tell the other owners.

## 1. Deployment file (contracts → everyone)

`contracts/script/Deploy.s.sol` writes `deployments/mezo-testnet.json` (committed after deploy):

```json
{
  "chainId": 31611,
  "musd": "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
  "pots": "0x…",
  "policyEngine": "0x…",
  "relayer": "0x…",
  "deployBlock": 123456
}
```

`packages/shared` loads it, so the relayer and app need no hand-copied addresses. Before the
first deploy the file doesn't exist; the code must fail with a clear "not deployed yet" message
rather than crash. ABIs come from `contracts/abi/*.json` (exported by `pnpm abi`).

Wave 1 deploys **one** contract, `Vault`, which is both the pots ledger and the policy engine
(ADR-013, single PolicyEngine; one contract means no cross-contract trust on the money path).
So `pots` and `policyEngine` hold the **same address**. Use `contracts/abi/Vault.json` (full ABI) for everything; `IPots.json` and `IPolicyEngine.json` are the same functions split by
concern. Source of truth for signatures and NatSpec: `contracts/src/interfaces/`.

Deploy (from `contracts/`, Foundry on PATH). Env: `RELAYER_ADDRESS` (required), `FEE_AMOUNT`
(default `250000000000000000`, must be `0 < fee <= 1e18`), `MUSD_ADDRESS` (default testnet MUSD).

```sh
# dry-run on a fork: writes deployments/mezo-testnet.json.dry-run.json (gitignored)
forge script script/Deploy.s.sol --fork-url mezo_testnet
# real deploy (owner only): writes deployments/mezo-testnet.json
forge script script/Deploy.s.sol --rpc-url mezo_testnet --broadcast --private-key $DEPLOYER_KEY
# end-to-end check with real MUSD on a fork (never broadcast)
forge script script/ForkSmoke.s.sol --fork-url mezo_testnet
```

Key order in the written JSON is alphabetical (forge serializer); parse it as an object.

## 2. Item hash (app ↔ contracts)

`itemHash = keccak256(abi.encode(string item, uint256 quantity, uint256 unitPrice, string vendor))`.
`unitPrice` is in MUSD base units (18 dp). `packages/shared` exports `itemHash()` with a test that
matches a vector produced by a Foundry test. The contract also exposes `itemHash(...)` as a pure view.

Test vector (`contracts/test/PaymentRequest.t.sol`, `test_PaymentRequest_itemHashMatchesVector`):

```text
itemHash("Cement bag 50kg", 200, 9000000000000000000, "Vendor Y")
  = 0x0ed8f4ca6b571e726131a47e8f2ed5ef66614bd6ddde8109e3539970fd86bedc
```

viem: `keccak256(encodeAbiParameters(parseAbiParameters("string, uint256, uint256, string"),
[item, quantity, unitPrice, vendor]))`.

## 2a. PaymentRequest (EIP-712, app signs, relayer submits)

Domain: `{ name: "Ipin", version: "1", chainId: 31611, verifyingContract: <Vault> }`.

```text
PaymentRequest(uint256 potId,address payee,uint256 amount,bytes32 itemHash,uint256 nonce,uint256 expiry)
```

- `amount = quantity * unitPrice`; the flat fee (`fee()`, 0.25 MUSD) is charged on top from the
  same pot and does not count toward the cap.
- `nonce`: any unused uint256 in the sender's namespace (`nonceUsed(sender, nonce)`); use a random
  256-bit value. `expiry`: unix seconds, inclusive.
- Submit with `execute(request, signature)`. `hashPaymentRequest(request)` returns the digest.
- Revoke before it settles: the sender calls `invalidateNonce(nonce)` from their own wallet. It
  acts on `msg.sender`'s namespace only, emits `NonceInvalidated(signer, nonce)`, and reverts
  `NonceAlreadyUsed` if the nonce was already used or revoked. The relayer should treat
  `NonceAlreadyUsed` on submit as "settled or revoked" and stop retrying. Added by the security
  review (docs/security-review.md M-01); the EIP-712 type is unchanged.

## 3. Relayer HTTP API (relayer ↔ app)

JSON over HTTPS. Amounts are decimal strings of MUSD base units (bigint on both sides, R1).
Addresses are checksummed. Errors are `{ "error": { "code": string, "message": string } }`.

| Method | Path | Body / query | Returns |
| --- | --- | --- | --- |
| GET | `/health` | — | `{ ok, chainId, relayer, deployed: boolean }` |
| GET | `/config` | — | deployment file contents plus `{ feeAmount }` |
| POST | `/invites` | `{ potId, label }` (label e.g. "Site manager") | `{ code, url }` |
| GET | `/invites/:code` | — | `{ potId, label, claimedBy?: address }` |
| POST | `/invites/:code/claim` | `{ address, signature }` (requester key signs `"Ipin invite " + code`) | `{ ok }` |
| POST | `/requests` | `{ potId, payee, item, quantity, unitPrice, vendor, note?, requester, signature }` | `{ id }` |
| GET | `/requests` | `?potId=&status=pending\|approved\|executed\|rejected\|failed` | `Request[]` |
| GET | `/requests/:id` | — | `Request` |
| POST | `/requests/:id/approve` | `{ paymentRequest, senderSignature }` (EIP-712, see contracts interface) | `{ txHash }` after the relayer submits `execute` |
| POST | `/requests/:id/reject` | `{ senderSignature }` (sender signs `"Ipin reject " + id`) | `{ ok }` |

`Request` = `{ id, potId, payee, item, quantity, unitPrice, amount, vendor, note?, requester,
itemHash, status, createdAt, txHash?, error? }`. `amount = quantity * unitPrice` (bigint).

Requester signatures on `POST /requests` are EIP-191 `personal_sign` over the canonical JSON of the
body minus `signature`, so the relayer can verify that the requester address is registered on the
pot (read from chain) before storing. Nothing on-chain trusts the requester's key; only the
sender's EIP-712 approval settles (R8).

On-chain actions the sender takes directly from MetaMask (not via relayer): create pot, deposit
(approve or permit), add/remove payee, register requester, create schedule.

The relayer also runs schedules: every minute it calls `executeSchedule(id)` for due schedules and
logs the result. The statement and booksBalance badge read the chain directly (events +
`booksBalance()`), not the relayer.

### Wire details (as implemented by the relayer)

- `potId` and `quantity` are accepted as a decimal string or a JSON integer; responses always use strings.
- `createdAt` is ISO 8601. `POST /invites` and `POST /requests` return 201.
- `/config` returns `deployBlock` as a string and adds `vault` (same as `pots`).
- Invite links are `<APP_URL>/i/<code>` (app route `/i/[code]`).
