<!--
  Every schedule across the sender's pots as a subscription (docs/wave2.md
  2.1): amount, payee, how often, next due, a one-tap stop, and a warning when
  the pot can't cover the next payment (2.4).
-->
<script lang="ts">
  import {
    type PotView,
    readFee,
    readPotsOf,
    readSchedulesOf,
    type ScheduleView,
    vaultWrites,
  } from "#/chain/vault"
  import { wallet } from "#/chain/wallet.svelte"
  import { formatUsd } from "#/money/format"
  import { formatEvery, shortfall } from "#/sender/subscribe"
  import { payeeLabel } from "#/storage"
  import { formatDay, nowSeconds, shortAddress } from "#/text"
  import Button from "#/ui/Button.svelte"
  import { Flow } from "#/ui/flow.svelte"
  import Notice from "#/ui/Notice.svelte"
  import Steps from "#/ui/Steps.svelte"
  import WalletGate from "#/ui/WalletGate.svelte"

  let pots = $state<Map<string, PotView>>(new Map())
  let subs = $state<ScheduleView[] | null>(null)
  let fee = $state<bigint>(0n)
  let error = $state<string | null>(null)
  let stopping = $state<bigint | null>(null)
  const flow = new Flow()

  async function load(owner: `0x${string}`) {
    try {
      const mine = await readPotsOf(owner)
      pots = new Map(mine.map((p) => [p.id.toString(), p]))
      const [all, f] = await Promise.all([
        readSchedulesOf(mine.map((p) => p.id)),
        readFee().catch(() => 0n),
      ])
      fee = f
      subs = all
        .filter((s) => s.active)
        .sort((a, b) => (a.nextDue < b.nextDue ? -1 : 1))
      error = null
    } catch {
      error = "Couldn't read your subscriptions from Mezo testnet."
    }
  }

  $effect(() => {
    if (wallet.ready && wallet.account) void load(wallet.account)
  })

  const name = (a: string) => payeeLabel(a) ?? shortAddress(a)
  const potOf = (s: ScheduleView) => pots.get(s.potId.toString())
  const shortOf = (s: ScheduleView) => {
    const p = potOf(s)
    return p ? shortfall(p.balance, s.amount, fee) : 0n
  }
  const perMonth = $derived(
    (subs ?? []).reduce(
      (sum, s) =>
        sum +
        (s.amount * 30n * 86_400n) / (s.interval === 0n ? 1n : s.interval),
      0n,
    ),
  )

  async function stop(s: ScheduleView) {
    stopping = s.id
    const ok = await flow.run([
      {
        label: `Stop paying ${name(s.payee)}`,
        hint: "Confirm in MetaMask. Nothing more is paid on this subscription.",
        run: () => vaultWrites.cancelSchedule(s.id),
      },
    ])
    stopping = null
    if (ok && wallet.account) await load(wallet.account)
  }
</script>

<svelte:head><title>Subscriptions · Ìpín</title></svelte:head>

<WalletGate>
  <div class="page">
    <header>
      <h1>Subscriptions</h1>
      <p class="muted">
        Everything your pots pay on a schedule: allowances and merchant
        subscriptions. The relayer pays each one when due, only to that payee,
        within the pot's limit.
      </p>
    </header>

    {#if error}<Notice tone="error">{error}</Notice>{/if}

    {#if subs === null && !error}
      <p class="muted">Loading…</p>
    {:else if subs && subs.length === 0}
      <p class="empty">
        No subscriptions yet. Set up an allowance on a pot's page, or open a
        merchant's subscribe link.
      </p>
    {:else if subs}
      <p class="total">
        About <strong class="num">{formatUsd(perMonth)}</strong> a month across
        {subs.length === 1 ? "1 subscription" : `${subs.length} subscriptions`}.
      </p>
      <ul class="list">
        {#each subs as s (s.id)}
          {@const p = potOf(s)}
          {@const gap = shortOf(s)}
          <li class="card">
            <div class="row">
              <span class="amt num">{formatUsd(s.amount)}</span>
              <span class="who">
                <strong>{name(s.payee)}</strong>
                <span class="meta"
                  >{formatEvery(s.interval)} · from {p?.name ??
                    `pot #${s.potId}`}</span
                >
              </span>
              <Button
                variant="ghost"
                busy={stopping === s.id}
                disabled={flow.running}
                onclick={() => stop(s)}>Stop</Button
              >
            </div>
            <p class="next">
              {s.nextDue <= nowSeconds()
                ? "Due now · the relayer pays it shortly"
                : `Next on ${formatDay(s.nextDue)}`}
            </p>
            {#if gap > 0n && p}
              <Notice tone="warn" title="{p.name} is short by {formatUsd(gap)}">
                The next payment waits until the pot has
                {formatUsd(s.amount + fee)} (including the relayer fee). No payment
                is skipped. <a href="/send/pot/{p.id}">Add money</a>
              </Notice>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    <Steps {flow} />

    <p class="muted small">
      Are you a merchant? <a href="/merchant">Make a subscribe link</a> for your customers.
    </p>
  </div>
</WalletGate>

<style>
  .page {
    max-width: 40rem;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .empty {
    font-size: var(--text-sm);
    color: var(--ink-2);
    padding: var(--space-4);
    border-radius: var(--radius-md);
    background: var(--surface-2);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  li {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .amt {
    font-family: var(--font-display);
    font-size: var(--text-lg);
  }
  .who {
    display: flex;
    flex-direction: column;
    margin-right: auto;
    min-width: 0;
  }
  .meta,
  .next {
    font-size: var(--text-xs);
    color: var(--ink-2);
  }
  .small {
    font-size: var(--text-sm);
  }
</style>
