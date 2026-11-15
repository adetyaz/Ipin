<!--
  A merchant's subscribe link (docs/wave2.md 2.2). The sender reads the terms,
  picks a pot and signs ONE transaction: add the merchant as a payee and create
  the schedule. Money only ever leaves the pot, within its monthly limit.
-->
<script lang="ts">
  import { explorer } from "#/chain/client"
  import {
    type PotView,
    readFee,
    readPayees,
    readPotsOf,
    subscribeInOneTransaction,
  } from "#/chain/vault"
  import { wallet } from "#/chain/wallet.svelte"
  import { formatUsd } from "#/money/format"
  import {
    formatEvery,
    parseSubscribeLink,
    shortfall,
  } from "#/sender/subscribe"
  import { setPayeeLabel } from "#/storage"
  import { nowSeconds, shortAddress } from "#/text"
  import Button from "#/ui/Button.svelte"
  import { Flow } from "#/ui/flow.svelte"
  import Notice from "#/ui/Notice.svelte"
  import Steps from "#/ui/Steps.svelte"
  import WalletGate from "#/ui/WalletGate.svelte"
  import { page } from "$app/state"

  const link = $derived(parseSubscribeLink(page.url.searchParams))
  let pots = $state<PotView[] | null>(null)
  let potId = $state("")
  let payeesOfPot = $state<string[]>([])
  let fee = $state<bigint | null>(null)
  let error = $state<string | null>(null)
  let doneTx = $state<`0x${string}` | null>(null)
  const flow = new Flow()

  $effect(() => {
    if (!wallet.ready || !wallet.account) return
    const owner = wallet.account
    readPotsOf(owner)
      .then((p) => {
        pots = p
        if (p.length === 1 && p[0]) potId = p[0].id.toString()
      })
      .catch(() => (error = "Couldn't read your pots from Mezo testnet."))
    readFee()
      .then((f) => (fee = f))
      .catch(() => (fee = null))
  })

  $effect(() => {
    if (potId === "") return
    readPayees(BigInt(potId))
      .then((list) => (payeesOfPot = list.map((a) => a.toLowerCase())))
      .catch(() => (payeesOfPot = []))
  })

  const pot = $derived(pots?.find((p) => p.id.toString() === potId))
  const terms = $derived(link.ok ? link.terms : null)
  const alreadyPayee = $derived(
    !!terms && payeesOfPot.includes(terms.payee.toLowerCase()),
  )
  // R7: a payment bigger than the pot's monthly limit can never be paid.
  const overCap = $derived(!!pot && !!terms && terms.amount > pot.cap)
  const short = $derived(
    pot && terms && fee !== null
      ? shortfall(pot.balance, terms.amount, fee)
      : 0n,
  )
  const canSign = $derived(!!pot && !!terms && !overCap && !flow.running)

  async function accept() {
    if (!canSign || !pot || !terms) return
    const t = terms
    const target = pot
    const ok = await flow.run([
      {
        label: `Subscribe ${target.name} to ${t.merchant}`,
        hint: "One transaction: MetaMask shows a call to the Ìpín vault. Confirm it.",
        run: async () => {
          const tx = await subscribeInOneTransaction({
            potId: target.id,
            payee: t.payee,
            amount: t.amount,
            interval: t.interval,
            start: nowSeconds(),
            alreadyPayee,
          })
          setPayeeLabel(t.payee, t.merchant)
          doneTx = tx
          return tx
        },
      },
    ])
    if (!ok) doneTx = null
  }
</script>

<svelte:head><title>Subscribe · Ìpín</title></svelte:head>

<WalletGate>
  <div class="page">
    {#if !link.ok}
      <h1>This link doesn't work</h1>
      <Notice tone="error">{link.error} Ask the merchant for a new link.</Notice
      >
    {:else if terms}
      <p class="eyebrow">Subscription request</p>
      <h1>{terms.merchant}</h1>

      <section class="card terms" aria-label="Terms">
        <div class="big">
          <span class="amt num">{formatUsd(terms.amount)}</span>
          <span class="every">{formatEvery(terms.interval)}</span>
        </div>
        <dl>
          <div>
            <dt>Paid to</dt>
            <dd>
              {terms.merchant}
              <a
                class="mono addr"
                href={explorer.address(terms.payee)}
                target="_blank"
                rel="noreferrer">{shortAddress(terms.payee)}</a
              >
            </dd>
          </div>
          <div>
            <dt>First payment</dt>
            <dd>Today, then {formatEvery(terms.interval)}</dd>
          </div>
        </dl>
        <p class="muted small">
          {terms.merchant} gets no access to your wallet. The Ìpín relayer pays each
          instalment from the pot you choose, only to this address, never above the
          pot's monthly limit. You can stop it any time.
        </p>
      </section>

      {#if error}<Notice tone="error">{error}</Notice>{/if}

      {#if pots && pots.length === 0}
        <Notice tone="info" title="You have no pots yet">
          Create a pot first, then open this link again.
          <a href="/send/new">Create a pot</a>
        </Notice>
      {:else if pots}
        <label class="f">
          <span>Pay from</span>
          <select bind:value={potId} disabled={flow.running || !!doneTx}>
            <option value="" disabled>Choose a pot</option>
            {#each pots as p (p.id)}
              <option value={p.id.toString()}
                >{p.name} · {formatUsd(p.balance)} · limit {formatUsd(
                  p.cap,
                )}/month</option
              >
            {/each}
          </select>
        </label>

        {#if overCap && pot}
          <Notice tone="error" title="Above this pot's monthly limit">
            {pot.name} can pay at most {formatUsd(pot.cap)} a month, so this would
            never be paid. Raise the limit on the pot page or pick another pot.
          </Notice>
        {:else if short > 0n && pot}
          <Notice
            tone="warn"
            title="{pot.name} can't cover the first payment yet"
          >
            It's short by {formatUsd(short)} including the relayer fee. You can subscribe
            now; the payment goes out once you add money.
          </Notice>
        {/if}
        {#if pot && !alreadyPayee && !overCap}
          <p class="muted small">
            This also adds {terms.merchant} as an approved payee of {pot.name}.
          </p>
        {/if}
      {:else if !error}
        <p class="muted">Loading your pots…</p>
      {/if}

      <Steps {flow} />

      {#if doneTx}
        <Notice tone="info" title="Subscribed">
          {terms.merchant} will be paid {formatUsd(terms.amount)}
          {formatEvery(terms.interval)} from {pot?.name}.
          <a href={explorer.tx(doneTx)} target="_blank" rel="noreferrer"
            >See it on Mezo explorer</a
          >
          · <a href="/send/subscriptions">All subscriptions</a>
        </Notice>
      {:else}
        <Button
          size="lg"
          onclick={accept}
          busy={flow.running}
          disabled={!canSign}
        >
          Subscribe for {formatUsd(terms.amount)}
          {formatEvery(terms.interval)}
        </Button>
      {/if}
    {/if}
  </div>
</WalletGate>

<style>
  .page {
    max-width: 32rem;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .terms {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .big {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .amt {
    font-family: var(--font-display);
    font-size: var(--text-2xl, 2rem);
    line-height: 1;
  }
  .every {
    color: var(--ink-2);
  }
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  dt {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  dd {
    margin: 0;
    font-weight: 600;
    font-size: var(--text-sm);
    display: flex;
    flex-direction: column;
    overflow-wrap: anywhere;
  }
  .addr {
    font-weight: 400;
    font-size: var(--text-xs);
    width: fit-content;
  }
  .small {
    font-size: var(--text-sm);
  }
  .f {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .f > span {
    font-size: var(--text-sm);
    font-weight: 600;
  }
  select {
    min-height: 3rem;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line-strong);
    width: 100%;
  }
  select:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--indigo);
  }
</style>
