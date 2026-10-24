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
rather than crash. ABIs come from `contracts/abi/*.json` (exported by a pnpm script).

## 2. Item hash (app ↔ contracts)

`itemHash = keccak256(abi.encode(string item, uint256 quantity, uint256 unitPrice, string vendor))`.
`unitPrice` is in MUSD base units (18 dp). `packages/shared` exports `itemHash()` with a test that
matches a vector produced by a Foundry test.

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
