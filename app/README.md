# Ìpín app

Phone-first web app (PWA) for the two Wave 1 roles:

- **Sender**: MetaMask on Mezo testnet. Creates pots, splits deposits, approves payees, invites
  requesters, sets a monthly allowance, reads the statement, and approves or declines requests
  with one EIP-712 signature.
- **Requester**: no wallet and no gas. The invite link generates a key in the browser
  (localStorage, ADR-012), claims the invite, and raises itemized requests.

## Run

```sh
pnpm install            # at the repo root
cp app/.env.example app/.env   # set PUBLIC_RELAYER_URL
pnpm --filter @ipin/app dev    # http://localhost:5173
```

| Env                  | Meaning                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `PUBLIC_RELAYER_URL` | Relayer base URL (docs/api.md section 3). Without it, invites and requests show a "relayer not set up" note. |
| `PUBLIC_NGN_PER_USD` | Optional whole number. Shows an approximate ₦ line under big amounts. Empty hides it.                        |

Contract addresses are never set here. The build reads `deployments/mezo-testnet.json` at the
repo root through `@ipin/shared` (`parseDeployments`). If the file is missing, the sender screens
show "Not deployed yet". **Rebuild after a deploy** so the new file is bundled.

`/dev/preview` (dev server only) renders the real components with sample data for design review
without a wallet or deployment.

## Check

```sh
pnpm --filter @ipin/app check   # svelte-check (0 warnings) + prettier + eslint + vitest
```

Root `pnpm check` runs these through `pnpm -r --if-present typecheck | lint | test`.

Tests cover the money edge: dollar display and input parsing (`src/lib/money/format.test.ts`),
split maths mirroring `Pots._creditDeposit` (`split.test.ts`, R2), and request-form validation
(`src/lib/requester/requestForm.test.ts`, I5).

## Deploy (static, no server)

`pnpm --filter @ipin/app build` writes `app/build/`, a static SPA with `200.html` as the fallback
for client routes such as invite links (`/i/<code>`).

- **Vercel**: set the project root to `app/`; `vercel.json` sets the build, output and SPA rewrite.
- **Netlify**: base `app/`, build `pnpm build`, publish `build`; `static/_redirects` handles the
  SPA fallback.

Set `PUBLIC_RELAYER_URL` in the host's environment. The relayer must allow the app's origin (CORS).

## Choices

- **SvelteKit 2 + Svelte 5 runes, adapter-static.** The relayer is the only server, so the app is
  a static SPA (`ssr = false`) that runs anywhere. Kit 2 rather than the two-week-old Kit 3.
- **Plain CSS tokens instead of Tailwind.** The design is a small token set (`src/app.css`) plus
  scoped component styles. Tokens keep light and dark themes in one place and add no build
  dependency. Every colour, radius and type size is a custom property.
- **No floats (R1).** Amounts are `bigint` from chain to screen; `formatUsd`/`parseUsdInput`
  wrap viem `formatUnits`/`parseUnits`. ESLint bans `Number()`, `parseFloat`, `toFixed` and `Math.*`
  in `src/`.
- **Design.** Àdìrẹ indigo (Yoruba resist-dyed cloth) on cotton white, palm-oil gold as the
  single warm accent, leaf green for "Books balance". Young Serif for headings and big amounts,
  Onest for the interface, JetBrains Mono for addresses. Each pot wears a cloth pattern derived
  from its name. Fonts are self-hosted via Fontsource, so the PWA works offline.
- **Lint deviation.** `svelte/no-navigation-without-resolve` is off: the app is served at `/`
  with no `paths.base`, and many links are external (explorer, faucet, WhatsApp).

## Known gaps

- Payee names are the sender's own labels, kept on the sender's device. They travel to the
  requester only in the invite link's `#fragment`, so names added after an invite was shared
  don't reach that requester.
- Invites created on one device are listed only on that device (the relayer has no "list
  invites" endpoint).
