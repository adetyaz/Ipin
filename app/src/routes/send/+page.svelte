<script lang="ts">
  import { relayer, relayerUrl } from "#/api/relayer"
  import { MEZO_TESTNET_APP } from "#/chain/client"
  import { type PotView, readMusdBalance, readPotsOf } from "#/chain/vault"
  import { wallet } from "#/chain/wallet.svelte"
  import Amount from "#/ui/Amount.svelte"
  import BooksBadge from "#/ui/BooksBadge.svelte"
  import Button from "#/ui/Button.svelte"
  import Notice from "#/ui/Notice.svelte"
  import PotCard from "#/ui/PotCard.svelte"
  import WalletGate from "#/ui/WalletGate.svelte"

  let pots = $state<PotView[] | null>(null)
  let musd = $state<bigint | null>(null)
  let pending = $state(0)
  let error = $state<string | null>(null)

  const total = $derived((pots ?? []).reduce((sum, p) => sum + p.balance, 0n))

  async function load(owner: `0x${string}`) {
    error = null
    try {
      const [mine, bal] = await Promise.all([
        readPotsOf(owner),
        readMusdBalance(owner),
      ])
      pots = mine
      musd = bal
      if (relayerUrl && mine.length > 0) {
        const ids = new Set(mine.map((p) => p.id))
        relayer
          .listRequests({ status: "pending" })
          .then((rs) => (pending = rs.filter((r) => ids.has(r.potId)).length))
          .catch(() => (pending = 0))
      }
    } catch {
      error = "We couldn't read your pots from Mezo testnet. Try again."
    }
  }

  $effect(() => {
    if (wallet.ready && wallet.account) void load(wallet.account)
  })
</script>

<svelte:head><title>Your pots · Ìpín</title></svelte:head>

<WalletGate>
  <div class="layout">
    <section class="main">
      <header class="top">
        <div>
          <p class="eyebrow">Held in your pots</p>
          {#if pots}
            <Amount value={total} size="xl" naira />
          {:else}
            <span class="skeleton amount-skel" aria-label="Loading"></span>
          {/if}
        </div>
        <BooksBadge />
      </header>

      {#if pending > 0}
        <a class="inbox" href="/send/requests">
          <span class="count num">{pending}</span>
          <span>
            <strong
              >{pending === 1 ? "1 request" : `${pending} requests`} waiting for you</strong
            >
            <span class="muted">Check the items and approve or decline</span>
          </span>
          <span aria-hidden="true" class="arrow">→</span>
        </a>
      {/if}

      {#if error}
        <Notice tone="error" title="Couldn't load">{error}</Notice>
      {/if}

      {#if pots === null && !error}
        <div class="grid">
          <div class="skeleton card-skel"></div>
          <div class="skeleton card-skel"></div>
        </div>
      {:else if pots && pots.length === 0}
        <div class="empty card">
          <h2>Start with the house</h2>
          <p class="muted">
            Make a pot for each purpose, like House and Upkeep, then add money
            and split it between them.
          </p>
          <Button href="/send/new" size="lg">Create pots</Button>
        </div>
      {:else if pots}
        <div class="section-head">
          <h2>Pots</h2>
          <div class="actions">
            <Button variant="secondary" href="/send/new">New pot</Button>
            <Button href="/send/deposit">Add money</Button>
          </div>
        </div>
        <div class="grid">
          {#each pots as pot (pot.id)}
            <PotCard {pot} />
          {/each}
        </div>
      {/if}
    </section>

    <aside class="side">
      <div class="card wallet">
        <p class="eyebrow">Your wallet</p>
        {#if musd !== null}
          <Amount value={musd} size="lg" />
          <p class="muted small">MUSD ready to put into pots</p>
        {:else}
          <span class="skeleton line"></span>
        {/if}
        <a
          class="small"
          href={MEZO_TESTNET_APP}
          target="_blank"
          rel="noreferrer">Get test MUSD on Mezo</a
        >
      </div>

      <div class="card fund">
        <p class="eyebrow">Top up</p>
        <p class="small muted">
          Buy MUSD with a debit card through Banxa, Mezo's card partner.
        </p>
        <Button
          variant="secondary"
          full
          href="https://banxa.com/"
          target="_blank"
          rel="noreferrer">Fund with card</Button
        >
        <p class="tag">Mainnet only. On testnet, use test MUSD.</p>
      </div>
    </aside>
  </div>
</WalletGate>

<style>
  .layout {
    display: grid;
    gap: var(--space-6);
  }
  @media (min-width: 960px) {
    .layout {
      grid-template-columns: minmax(0, 1fr) 20rem;
      align-items: start;
    }
    .side {
      position: sticky;
      top: 5rem;
    }
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    min-width: 0;
  }
  .top {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding-top: var(--space-2);
  }
  @media (min-width: 640px) {
    .top {
      flex-direction: row;
      justify-content: space-between;
      align-items: flex-end;
    }
  }
  .inbox {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    background: var(--palm-soft);
    color: var(--ink);
    text-decoration: none;
  }
  .inbox span:nth-child(2) {
    display: flex;
    flex-direction: column;
    font-size: var(--text-sm);
  }
  .count {
    display: grid;
    place-items: center;
    flex: none;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    background: var(--palm);
    color: #2a1d00;
    font-weight: 700;
  }
  .arrow {
    margin-left: auto;
    font-size: var(--text-lg);
  }
  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .section-head h2 {
    font-size: var(--text-xl);
  }
  .actions {
    display: flex;
    gap: var(--space-2);
  }
  .grid {
    display: grid;
    gap: var(--space-4);
  }
  @media (min-width: 640px) {
    .grid {
      grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
    }
  }
  .empty {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    align-items: flex-start;
  }
  .empty h2 {
    font-size: var(--text-xl);
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .side .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .small {
    font-size: var(--text-sm);
  }
  a.small {
    display: inline-flex;
    align-items: center;
    min-height: var(--tap);
    font-weight: 600;
  }
  .tag {
    font-size: var(--text-xs);
    color: var(--palm-ink);
    background: var(--palm-soft);
    padding: 0.2rem 0.5rem;
    border-radius: var(--radius-sm);
    width: fit-content;
  }
  .skeleton {
    display: block;
    border-radius: var(--radius-md);
    background: var(--surface-2);
    animation: shimmer 1.4s ease-in-out infinite;
  }
  .amount-skel {
    width: 10rem;
    height: 3.5rem;
    margin-top: var(--space-2);
  }
  .card-skel {
    height: 12rem;
    border-radius: var(--radius-lg);
  }
  .line {
    height: 2.25rem;
    width: 8rem;
  }
  @keyframes shimmer {
    50% {
      opacity: 0.55;
    }
  }
</style>
