# Ìpín relayer

A small Hono server that implements the relayer API in `docs/api.md` section 3. It stores
requesters' signed requests. When the sender approves a request, it submits the sender's
EIP-712 approval to `Vault.execute` with its own funded key. Every 60 s it calls
`executeSchedule` for schedules that are due. The Vault re-checks every rule on-chain. The relayer
only fails fast, and it simulates every call so that nothing that would revert is broadcast.

## Run

```sh
pnpm install                          # repo root
cp relayer/.env.example relayer/.env  # then set RELAYER_PRIVATE_KEY
pnpm --filter relayer start           # or: pnpm --filter relayer dev (watch)
```

The relayer reads addresses from `deployments/mezo-testnet.json` through `@ipin/shared`, so
nothing is copied by hand. If that file doesn't exist yet, the relayer still starts. It logs
`NOT DEPLOYED`, reports `deployed: false` on `/health`, and returns `NOT_DEPLOYED` (503) for
chain endpoints. It checks for the file again on every scheduler tick, so you don't need to
restart it after a deploy.

At startup it logs one of: `NOT DEPLOYED`, `DEPLOYED but NOT FUNDED`,
`DEPLOYED, relayer balance LOW`, or `DEPLOYED and FUNDED`, along with the relayer's BTC balance.
It also warns if `RELAYER_PRIVATE_KEY` isn't the deployment's `relayer`. Payments still settle in
that case, but fees accrue to the deployed relayer address.

Logs are JSON (pino), written to stdout and to `relayer/logs/relayer.log`. State lives in
`relayer/data/relayer-db.json`. Both paths are gitignored.

## Environment

| Var                     | Default                                |                                       |
| ----------------------- | -------------------------------------- | ------------------------------------- |
| `RELAYER_PRIVATE_KEY`   | required                               | Funded testnet key; pays gas in BTC   |
| `RPC_URL`               | `https://rpc.test.mezo.org`            | Mezo testnet RPC                      |
| `PORT` / `HOST`         | `8787` / `0.0.0.0`                     |                                       |
| `APP_URL`               | `http://localhost:5173`                | Invite links are `<APP_URL>/i/<code>` |
| `CORS_ORIGIN`           | `APP_URL`                              | Comma-separated origins, or `*`       |
| `DATA_DIR` / `LOG_DIR`  | `relayer/data` / `relayer/logs`        |                                       |
| `LOG_LEVEL`             | `info`                                 |                                       |
| `DEPLOYMENTS_PATH`      | `<repo>/deployments/mezo-testnet.json` |                                       |
| `SCHEDULER_INTERVAL_MS` | `60000`                                |                                       |

## Request lifecycle

`pending` → (sender approves) `approved` (tx sent, `txHash` set) → `executed` | `failed`.
`pending` → (sender rejects) `rejected`. If simulation fails (for example `CapExceeded(...)`),
the request stays `pending` and `error` holds the decoded reason, so the sender can fix the pot
and approve again.

## Deploy (Render or Railway)

Deploy the whole repo, because the relayer imports `packages/shared` and reads
`deployments/`.

- **Build:** `corepack enable && pnpm install --frozen-lockfile`
- **Start:** `pnpm --filter relayer start`
- **Env:** `RELAYER_PRIVATE_KEY`, `APP_URL` (the deployed app URL), and `CORS_ORIGIN` if it
  differs. The platform sets `PORT`.
- **Health check path:** `/health`
- **Storage:** the JSON store lives on the container disk. On Render, attach a persistent disk
  and point `DATA_DIR` at it. On Railway, mount a volume. Without one, pending requests are lost
  on redeploy. On-chain state is never lost.

## Test

```sh
pnpm --filter relayer test   # vitest, no network (fake chain + mocked JSON-RPC)
```
